/**
 * Motion layer for the frame renderer.
 *
 * The drawings are held, never blended - blending two different pictures of
 * her is exactly what produced the doubled outlines. So all the *continuous*
 * motion lives here, as whole-body transforms that can never pull the artwork
 * apart:
 *
 *   arc         her jump follows a real ballistic curve through the air; the
 *               drawn frames ride it instead of stepping between the heights
 *               they were drawn at
 *   lead-in     in the last moments before a big change of pose (standing to
 *               sitting) she starts to settle toward it, and what is left of
 *               the move is carried through the cut by a spring, so she arrives
 *               in the pose and eases out rather than snapping into it
 *   weight      every cut carries an impulse - she stretches on take-off and
 *               when she stands, squashes when she lands, sits or is put down
 *   walk        a bob and a roll tied to the ground she covers, on top of the
 *               drawn stride
 *   inertia     when she starts, stops or is yanked, the top of her body lags
 *               and then settles - hair and dupatta follow-through without any
 *               hair or dupatta layer
 *   life        breathing, a slow weight shift while she stands, a nod while
 *               she talks, a slump while she sleeps
 *   turn        the spin-on-the-spot eases in and opens with a little overshoot
 *
 * Everything is driven by critically damped springs and exponential approaches
 * in real time, so it is identical at 30, 60 and 144 fps. No DOM here: the
 * offline filmstrip (scripts/preview-frames.ts) runs this exact code.
 */
import type { Pose } from '../engine/pose'
import type { ClipMeta, Step } from './clips'
import { FRAMES, TIMELINES } from './clips'
import type { Director } from './director'

/** What the renderer applies, all about her feet. `y` is positive upward. */
export interface MotionOut {
  x: number
  y: number
  /** Degrees. */
  rot: number
  sx: number
  sy: number
  /** Horizontal shear: x += shear * (y - feet), so the head leans, the feet stay. */
  shear: number
}

/** Critically damped spring, implicit Euler - stable at any frame time. */
class Spring {
  x = 0
  v = 0
  step(target: number, omega: number, dt: number): number {
    const f = 1 + 2 * dt * omega
    const oo = omega * omega
    const hoo = dt * oo
    const hhoo = dt * hoo
    const detInv = 1 / (f + hhoo)
    const detX = f * this.x + dt * this.v + hhoo * target
    const detV = this.v + hoo * (target - this.x)
    this.x = detX * detInv
    this.v = detV * detInv
    return this.x
  }
}

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v)
/** Frame-rate independent approach toward a target. */
const approach = (from: number, to: number, k: number, dt: number): number =>
  from + (to - from) * (1 - Math.exp(-k * dt))

/**
 * Width multiplier for the spin-on-the-spot. Closes with an ease-in, opens
 * with a soft overshoot so she "lands" facing the new way instead of stopping
 * dead. 1 when settled.
 */
export function turnWidth(turnT: number): number {
  if (turnT >= 1) return 1
  if (turnT < 0.5) return Math.cos(Math.PI * turnT)
  const u = (turnT - 0.5) / 0.5
  const c1 = 0.9
  const c3 = c1 + 1
  const back = 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2)
  return Math.max(0.02, back)
}

/** How long before a cut the lead-in starts. */
const LEAD_MS = 150

/** The beats the director is currently stepping through (none for the walk). */
function sequence(dir: Director): Step[] {
  const t = TIMELINES[dir.id]
  if (!t || dir.id === 'walk') return []
  return dir.phase === 'intro' ? t.intro : dir.phase === 'outro' ? t.outro : t.loop
}

/** The frame that will follow the current beat, when the timeline knows it. */
function upcoming(dir: Director, seq: Step[]): number | null {
  const i = Math.min(dir.step, seq.length - 1)
  if (i + 1 < seq.length) return seq[i + 1].f
  const t = TIMELINES[dir.id]
  if (dir.phase === 'outro') return null // whatever comes next is another clip
  return t.loop[0]?.f ?? null
}

export interface MotionInput {
  dt: number
  /** Seconds, monotonic. */
  now: number
  pose: Pose
  dir: Director
  clip: ClipMeta | null
  index: number
  /** Strip px -> screen px. */
  figScale: number
  /** Her standing height on screen, px. */
  figureH: number
  /** How far her feet moved since the last tick, screen px. */
  movedPx: number
  /** Screen px of ground per walk frame - same value the director gets. */
  stridePx: number
}

export class MotionLayer {
  private squash = new Spring()
  private shear = new Spring()
  /** Lead-in squash/stretch applied on top of the spring, last tick's value. */
  private lead = 0
  private lift = 0
  /** Seconds into the current jump, or -1 when her feet are on the floor. */
  private airT = -1
  private airDur = 0
  private airApex = 0
  private walkAmt = 0
  private talkAmt = 0
  private swayAmt = 0
  private dragHover = 0
  private vel = 0
  private lastClip: string | null = null
  private lastIndex = -1
  private lastMode: Pose['mode'] | null = null

  update(inp: MotionInput): MotionOut {
    const { dt, now, pose, dir, clip, index, figScale, figureH, stridePx } = inp
    const out: MotionOut = { x: 0, y: 0, rot: 0, sx: 1, sy: 1, shear: 0 }
    if (dt <= 0) return out

    const seq = sequence(dir)
    const isAir = !!clip && clip.lifts[index] > 0

    // ------------------------------------------------------------ cuts
    // Every change of picture is a physical event with a direction: dropping
    // into a crouch squashes her, springing up stretches her.
    const clipId = clip ? dir.frame().clip : null
    if (clip && (clipId !== this.lastClip || index !== this.lastIndex)) {
      const prevMeta = this.lastClip ? FRAMES.clips[this.lastClip] : null
      const prevH = prevMeta && this.lastIndex >= 0 ? prevMeta.heights[this.lastIndex] : clip.heights[index]
      const wasAir = !!prevMeta && this.lastIndex >= 0 && prevMeta.lifts[this.lastIndex] > 0
      const dh = (clip.heights[index] - prevH) / FRAMES.standH
      const sameClip = clipId === this.lastClip
      // cross-clip cuts (rest -> read) are softer than beats inside an action
      let impulse = dh * (sameClip ? 1.6 : 1.1)
      if (isAir && !wasAir) {
        impulse += 1.6 // take-off: stretch
        // how long she will be in the air, and how high: the beats ahead that
        // were drawn off the floor, until the first one that was not
        const i = Math.min(dir.step, Math.max(0, seq.length - 1))
        let ms = 0
        let apex = 0
        for (let j = i; j < seq.length && clip.lifts[seq[j].f] > 0; j++) {
          ms += seq[j].ms
          apex = Math.max(apex, clip.lifts[seq[j].f])
        }
        this.airT = 0
        this.airDur = Math.max(0.12, ms / 1000)
        this.airApex = apex * figScale
      }
      if (!isAir && wasAir) impulse -= 2.4 // landing: squash
      // whatever the lead-in had already moved her by is carried through the
      // cut and released by the spring, so the arrival eases out
      this.squash.x += this.lead
      this.lead = 0
      this.squash.v += clamp(impulse, -2.6, 2.0)
      this.lastClip = clipId
      this.lastIndex = index
    }

    // ------------------------------------------------------------ lead-in
    // Just before a beat that changes her height a lot, start settling toward
    // it. This is what turns "snap to the next drawing" into a movement.
    let lead = 0
    if (clip && seq.length && dir.turnT >= 1) {
      const i = Math.min(dir.step, seq.length - 1)
      const next = upcoming(dir, seq)
      const remaining = seq[i].ms - dir.t
      if (next !== null && next !== seq[i].f && remaining < LEAD_MS) {
        const dh = (clip.heights[next] - clip.heights[seq[i].f]) / FRAMES.standH
        const r = 1 - Math.max(0, remaining) / LEAD_MS
        const ramp = r * r * (3 - 2 * r) // smoothstep: eases in and out
        lead = clamp(dh * 0.35, -0.09, 0.09) * ramp
      }
    }
    this.lead = lead

    // ------------------------------------------------------------ drag
    if (pose.mode === 'drag' && this.lastMode !== 'drag') this.squash.v += 0.9 // picked up
    if (pose.mode !== 'drag' && this.lastMode === 'drag') this.squash.v -= 1.6 // set down
    this.lastMode = pose.mode
    // The animator lifts her a little while she is carried; ease it in and out.
    this.dragHover = approach(this.dragHover, pose.mode === 'drag' ? pose.lift * figScale * 1.6 : 0, 10, dt)

    // ------------------------------------------------------------ arc
    // The frames of a jump were drawn at fixed heights. Fly a real parabola
    // over the time she is airborne and draw each frame shifted onto it.
    const baked = clip ? clip.lifts[index] * figScale : 0
    if (this.airT >= 0 && isAir) {
      this.airT += dt
      const u = clamp(this.airT / this.airDur, 0, 1)
      this.lift = 4 * this.airApex * u * (1 - u)
    } else {
      this.airT = -1
      this.lift = approach(this.lift, 0, 18, dt)
    }
    const arcY = this.lift - baked

    // ------------------------------------------------------------ walk
    const walking = dir.id === 'walk' && dir.turnT >= 0.5
    this.walkAmt = approach(this.walkAmt, walking ? 1 : 0, 9, dt)
    // one bob per step; a walk frame is a quarter step of the 8-frame cycle
    const bobPhase = (dir.walkDist / Math.max(1, stridePx)) * (Math.PI / 2)
    const bobY = Math.abs(Math.sin(bobPhase)) * figureH * 0.02 * this.walkAmt
    const roll = Math.sin(bobPhase / 2) * 1.1 * this.walkAmt

    // ------------------------------------------------------------ inertia
    // Horizontal acceleration tips the top of her body the other way, then
    // the spring brings it back with a little overshoot: follow-through.
    const v = inp.movedPx / dt
    const vSmooth = approach(this.vel, v, 28, dt)
    const accel = (vSmooth - this.vel) / dt
    this.vel = vSmooth
    const shearTarget = clamp(accel * 0.00022, -0.09, 0.09)
    const shear = this.shear.step(shearTarget, 13, dt)

    // ------------------------------------------------------------ life
    const quiet = !walking && dir.turnT >= 1 && pose.mode !== 'drag'
    const standing = quiet && (dir.id === 'rest' || dir.id === 'think' || dir.id === 'coffee' || dir.id === 'wave')
    this.swayAmt = approach(this.swayAmt, standing ? 1 : 0, 4, dt)
    const swayX = Math.sin(now * 0.7) * 0.9 * this.swayAmt
    const swayRot = Math.sin(now * 0.7 + 0.6) * 0.35 * this.swayAmt
    const sleeping = dir.id === 'sleep'
    const slump = sleeping ? Math.sin(now * 1.1) * 0.5 + clamp(pose.headTilt, -14, 14) * 0.18 : 0
    const readRot = quiet && (dir.id === 'read' || dir.id === 'sit') ? Math.sin(now * 0.55) * 0.3 : 0

    this.talkAmt = approach(this.talkAmt, pose.talking ? 1 : 0, 8, dt)
    const talkY = Math.abs(Math.sin(now * 7.5)) * 1.6 * this.talkAmt
    const talkRot = Math.sin(now * 7.5) * 0.45 * this.talkAmt

    // ------------------------------------------------------------ compose
    const squash = this.squash.step(0, 22, dt) + lead
    const breath = pose.breath
    out.sy = (1 + 0.011 * breath) * (1 + squash)
    out.sx = (1 - 0.006 * breath) * (1 - squash * 0.55)
    out.x = swayX
    out.y = arcY + bobY + this.dragHover + talkY
    out.rot = clamp(pose.bodyTilt + pose.lookX * 1.5, -16, 16) + roll + swayRot + slump + readRot + talkRot
    out.shear = shear
    return out
  }
}
