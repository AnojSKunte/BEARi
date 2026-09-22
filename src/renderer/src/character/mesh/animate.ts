import type { Pose } from '../engine/pose'
import type { BoneRuntime, RigData, Vec2 } from './rig'
import { buildRuntime, matApply, solve, stepChains } from './rig'

/**
 * Drives BEARi's skeleton from the shared Pose.
 *
 * Everything here exists to make motion read as a body rather than as parts:
 *   • every channel is smoothed by a critically-damped spring — no snapping
 *   • the spine counter-rotates against the hips and the head counter-rotates
 *     against the chest (the classic line-of-action of a walking figure)
 *   • hands are placed by two-bone IK, so a hand that should touch her chin,
 *     her lips or her glasses actually arrives there instead of gesturing
 *   • hair and hem are springs, so they lag and settle (overlapping action)
 *   • breathing scales the chest, and landing squashes the whole body
 */

const DEG = Math.PI / 180

/** Hand IK targets, in figure-space fractions of the figure box. */
export type ReachTarget = 'chin' | 'glasses' | 'lips' | 'none'

export class RigController {
  readonly rig: RigData
  readonly rt: BoneRuntime[]
  private readonly byName = new Map<string, number>()

  // smoothed channels
  private s = {
    pelvisRot: 0,
    chestRot: 0,
    neckRot: 0,
    headRot: 0,
    headX: 0,
    headY: 0,
    armL: 0,
    armR: 0,
    elbowL: 0,
    elbowR: 0,
    shoulderLiftL: 0,
    shoulderLiftR: 0,
    thighL: 0,
    thighR: 0,
    kneeL: 0,
    kneeR: 0,
    breath: 0,
    squash: 1
  }
  private v = { ...this.s, squash: 0 }
  private prevX = 0
  private velX = 0
  private prevLift = 0
  private squashVel = 0

  constructor(rig: RigData) {
    this.rig = rig
    this.rt = buildRuntime(rig.bones)
    rig.bones.forEach((b, i) => this.byName.set(b.name, i))
  }

  private bone(name: string): BoneRuntime | undefined {
    const i = this.byName.get(name)
    return i === undefined ? undefined : this.rt[i]
  }

  /** Critically damped follow — the base of every smooth move. */
  private ease(key: keyof typeof this.s, target: number, stiffness: number, dt: number): number {
    const cur = this.s[key]
    const vel = (this.v as Record<string, number>)[key] ?? 0
    const omega = stiffness
    const x = cur - target
    const exp = Math.exp(-omega * dt)
    const nv = (vel - omega * omega * x * dt) * exp
    const nx = target + (x + (vel + omega * x) * dt) * exp
    this.s[key] = nx
    ;(this.v as Record<string, number>)[key] = nv
    return nx
  }

  /** World position of a bone's tail, in figure space. */
  tipOf(name: string): Vec2 | null {
    const b = this.bone(name)
    if (!b) return null
    const len = Math.hypot(b.def.tail.x - b.def.head.x, b.def.tail.y - b.def.head.y)
    return matApply(b.world, len, 0)
  }

  /**
   * Reach a hand to a face target with two-bone IK. Called after the base
   * pose is applied, so it overrides the shoulder/elbow angles for that arm.
   */
  private reach(side: 'L' | 'R', target: Vec2, dt: number): void {
    const upper = this.bone(`upperArm${side}`)
    const fore = this.bone(`foreArm${side}`)
    if (!upper || !fore) return
    const root = upper.def.head
    const upLen = Math.hypot(fore.def.head.x - root.x, fore.def.head.y - root.y)
    const loLen = Math.hypot(fore.def.tail.x - fore.def.head.x, fore.def.tail.y - fore.def.head.y)
    const dx = target.x - root.x
    const dy = target.y - root.y
    const dist = Math.max(Math.abs(upLen - loLen) + 1, Math.min(upLen + loLen - 1, Math.hypot(dx, dy)))
    const toTarget = Math.atan2(dy, dx)
    const a = Math.acos(Math.max(-1, Math.min(1, (upLen * upLen + dist * dist - loLen * loLen) / (2 * upLen * dist))))
    const b = Math.acos(Math.max(-1, Math.min(1, (upLen * upLen + loLen * loLen - dist * dist) / (2 * upLen * loLen))))
    // elbow points away from the body
    const flip = side === 'L' ? 1 : -1
    const restUp = Math.atan2(fore.def.head.y - root.y, fore.def.head.x - root.x)
    const restLo = Math.atan2(fore.def.tail.y - fore.def.head.y, fore.def.tail.x - fore.def.head.x)
    const upWorld = toTarget + a * flip
    const loWorld = upWorld + (Math.PI - b) * flip
    const upAngle = upWorld - restUp
    const loAngle = loWorld - restLo - (upWorld - restUp)
    const k = Math.min(1, dt * 9)
    upper.angle += (upAngle - upper.angle) * k
    fore.angle += (loAngle - fore.angle) * k
  }

  /** Advance the rig one frame. */
  update(pose: Pose, dt: number, reachL: ReachTarget = 'none', reachR: ReachTarget = 'none'): void {
    const d = Math.min(dt, 0.05)
    const f = this.rig.figure
    // ---- travel velocity drives lean, hair drag and arm inertia
    const vx = (pose.x - this.prevX) / Math.max(d, 1e-4)
    this.prevX = pose.x
    this.velX += (vx - this.velX) * Math.min(1, d * 8)

    const lean = Math.max(-4, Math.min(4, this.velX * 0.012))

    // ---- spine: hips and chest counter-rotate, giving a line of action
    const pelvis = this.ease('pelvisRot', (pose.bodyTilt * 0.35 + lean * 0.5) * DEG, 14, d)
    const chest = this.ease('chestRot', (pose.bodyTilt * 0.5 + lean * 0.6 + Math.sin(pose.legPhase) * 1.6 * pose.legSwing) * DEG, 13, d)
    const neckRot = this.ease('neckRot', (pose.headTilt * 0.35 + pose.lookX * 3) * DEG, 15, d)
    const headRot = this.ease('headRot', (pose.headTilt * 0.65 + pose.lookX * 4) * DEG, 15, d)
    const headX = this.ease('headX', pose.lookX * f.h * 0.012, 14, d)
    const headY = this.ease('headY', pose.lookY * f.h * 0.008 - pose.breath * f.h * 0.004, 14, d)
    const breath = this.ease('breath', pose.breath, 10, d)

    // ---- squash & stretch on landing
    if (this.prevLift > 8 && pose.lift <= 1) this.squashVel -= 6
    this.prevLift = pose.lift
    this.squashVel += (1 - this.s.squash) * 120 * d
    this.squashVel *= Math.exp(-11 * d)
    this.s.squash = Math.max(0.9, Math.min(1.08, this.s.squash + this.squashVel * d))

    const setB = (name: string, angle: number, extra?: Partial<BoneRuntime>): void => {
      const b = this.bone(name)
      if (!b) return
      b.angle = angle
      if (extra) Object.assign(b, extra)
    }

    setB('pelvis', pelvis, { offY: (1 - this.s.squash) * f.h * 0.06, scaleY: this.s.squash })
    setB('chest', chest, { scale: 1 + breath * 0.012, scaleY: 1 + breath * 0.016 })
    setB('neck', neckRot)
    setB('head', headRot, { offX: headX, offY: headY })

    // ---- arms: shoulders lift a little when the arm goes up (real bodies do)
    const armLdeg = pose.armL
    const armRdeg = pose.armR
    const liftL = this.ease('shoulderLiftL', Math.max(0, armLdeg) * 0.06 * DEG, 12, d)
    const liftR = this.ease('shoulderLiftR', Math.min(0, armRdeg) * 0.06 * DEG, 12, d)
    setB('shoulderL', liftL)
    setB('shoulderR', liftR)
    // arm inertia: the arm trails its own motion slightly
    const drag = Math.max(-8, Math.min(8, -this.velX * 0.01))
    setB('upperArmL', this.ease('armL', (armLdeg + drag) * DEG, 16, d))
    setB('upperArmR', this.ease('armR', (armRdeg + drag) * DEG, 16, d))
    setB('foreArmL', this.ease('elbowL', pose.elbowL * DEG, 18, d))
    setB('foreArmR', this.ease('elbowR', pose.elbowR * DEG, 18, d))

    // ---- legs
    const sit = pose.sitPhase
    const walkSwing = Math.sin(pose.legPhase) * 22 * pose.legSwing * (1 - sit)
    setB('thighL', this.ease('thighL', (sit * 72 + walkSwing) * DEG, 17, d))
    setB('thighR', this.ease('thighR', (sit * -72 - walkSwing) * DEG, 17, d))
    setB('calfL', this.ease('kneeL', (sit * -104 + Math.max(0, Math.sin(pose.legPhase)) * 26 * pose.legSwing * (1 - sit)) * DEG, 17, d))
    setB('calfR', this.ease('kneeR', (sit * 104 + Math.max(0, -Math.sin(pose.legPhase)) * 26 * pose.legSwing * (1 - sit)) * DEG, 17, d))

    // ---- hand IK: guarantee contact for face-touching actions
    const face = this.rig.face
    const targets: Record<Exclude<ReachTarget, 'none'>, Vec2> = {
      chin: { x: face.mouth.x, y: face.mouth.y + f.h * 0.045 },
      glasses: { x: face.eyeR.x + f.h * 0.02, y: face.eyeR.y },
      lips: { x: face.mouth.x, y: face.mouth.y + f.h * 0.006 }
    }
    if (reachL !== 'none') this.reach('L', targets[reachL], d)
    if (reachR !== 'none') this.reach('R', { ...targets[reachR], x: reachR === 'glasses' ? targets[reachR].x : targets[reachR].x }, d)

    // ---- solve, then run cloth/hair springs and solve again so the chains
    //      react to this frame's motion
    solve(this.rt)
    stepChains(this.rt, d, this.velX * 0.0006 + pose.bodyTilt * 0.004)
    solve(this.rt)
  }
}
