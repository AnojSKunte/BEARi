import type { Emotion } from '@shared/types'
import type { Pose, Mode } from './pose'
import { restPose } from './pose'

export type { Mode }

interface IdleAction {
  name:
    | 'glance'
    | 'stretch'
    | 'adjustGlasses'
    | 'wander'
    | 'swayHum'
    | 'read'
    | 'coffee'
    | 'magic'
    | 'sit'
    | 'dance'
  until: number
  data?: number
}

/** Idle actions backed by exact reference artwork (see Pose.action). */
const EXACT_ART_ACTIONS = new Set<IdleAction['name']>(['read', 'coffee', 'magic', 'stretch', 'sit', 'dance'])

/** Which prop each idle action brings out. */
const ACTION_PROP: Partial<Record<IdleAction['name'], Pose['prop']>> = {
  read: 'book',
  coffee: 'mug',
  magic: 'wand'
}

const WALK_SPEED = 130 // px/s
/** Ground distance covered by one half step — keeps feet planted, not sliding. */
const STRIDE = 26
const rand = (a: number, b: number): number => a + Math.random() * (b - a)
/**
 * Frame-rate independent ease. Callers pass `dt * k`; converting through
 * 1 − e^(−kt) makes the approach exponential in real time rather than in
 * frames, so motion is identical at 30, 60 and 144 fps and eases instead of
 * lurching at full speed on the first frame.
 */
const lerp = (a: number, b: number, t: number): number => a + (b - a) * (1 - Math.exp(-Math.max(0, t)))
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))

/**
 * Animation Engine — a procedural state machine that owns BEARi's body.
 * Call tick(dt) every frame; read .pose. Everything eases, nothing snaps.
 */
export class Animator {
  pose: Pose
  mode: Mode = 'idle'

  /** Stage width in px (set by the host on resize). */
  stageWidth = 1200
  /** Where the cursor is, in stage coordinates (or null when unknown). */
  cursor: { x: number; y: number } | null = null

  private now = 0
  private walkTarget: number | null = null
  private blinkAt = 2
  private blinkPhase = -1 // <0 idle, otherwise seconds into the blink
  private idleAction: IdleAction | null = null
  private nextIdleActionAt = 3
  private actionStartedAt = 0
  private lastMagicSparkleAt = 0
  /** Dev/testing: when set, forces pose.eyeOpen every tick. */
  debugEyeOpen: number | null = null
  private emotionUntil = 0
  private waveUntil = 0
  private celebrateUntil = 0
  private hairVel = 0
  private scarfVel = 0
  private prevX: number

  /**
   * Only pick idle actions that have real drawn frames behind them. Set by the
   * frame renderer, which would otherwise have to mime `magic` and `stretch`
   * with artwork that was never drawn for them.
   */
  artActionsOnly = false
  /** Suppress the floating zzz - the sleeping artwork already has them. */
  private get dropsSleepParticles(): boolean {
    return this.artActionsOnly
  }

  /** Fires whenever she wants particles ('hearts', 'zzz', ...). */
  onEffect: ((effect: string, x: number, y: number) => void) | null = null

  constructor(startX: number) {
    this.pose = restPose(startX)
    this.prevX = startX
  }

  // ------------------------------------------------------------ commands

  setEmotion(emotion: Emotion, holdSeconds = 6): void {
    this.pose.emotion = emotion
    this.emotionUntil = this.now + holdSeconds
    if (emotion === 'celebrating') {
      this.mode = 'celebrate'
      this.celebrateUntil = this.now + 2.4
    }
  }

  setTalking(talking: boolean): void {
    this.pose.talking = talking
  }

  setThinking(thinking: boolean): void {
    if (thinking) {
      this.mode = 'think'
      this.walkTarget = null
    } else if (this.mode === 'think') {
      this.mode = 'idle'
    }
  }

  walkTo(x: number): void {
    const target = clamp(x, 90, this.stageWidth - 90)
    // A step of a few pixels is not worth a walk: renderers that show her from
    // the side would turn her round and straight back again for nothing.
    if (Math.abs(target - this.pose.x) < 30) return
    this.walkTarget = target
    this.mode = 'walk'
  }

  startDrag(): void {
    this.mode = 'drag'
    this.walkTarget = null
  }

  dragTo(x: number): void {
    if (this.mode === 'drag') this.pose.x = clamp(x, 60, this.stageWidth - 60)
  }

  endDrag(): void {
    if (this.mode === 'drag') this.mode = 'idle'
  }

  sleep(): void {
    if (this.mode === 'sleep') return
    this.mode = 'sleep'
    this.walkTarget = null
  }

  /** Dev/testing aid: force a specific idle action to start right now. */
  forceIdleAction(name: IdleAction['name'], seconds = 6, data?: number): void {
    this.mode = 'idle'
    this.walkTarget = null
    this.idleAction = { name, until: this.now + seconds, data }
    this.actionStartedAt = this.now
    this.nextIdleActionAt = this.now + seconds + 5
  }

  wake(): void {
    if (this.mode !== 'sleep') return
    this.mode = 'wave'
    this.waveUntil = this.now + 1.8
    this.setEmotion('happy', 4)
    this.onEffect?.('sparkles', this.pose.x, 260)
  }

  get isAsleep(): boolean {
    return this.mode === 'sleep'
  }

  // ------------------------------------------------------------ tick

  tick(dt: number): Pose {
    dt = Math.min(dt, 0.05)
    this.now += dt
    const p = this.pose

    // Emotion decay back to neutral.
    if (this.emotionUntil && this.now > this.emotionUntil && p.emotion !== 'neutral') {
      p.emotion = 'neutral'
    }

    this.updateBreathAndBlink(dt)
    this.updateMode(dt)
    this.updateGaze(dt)
    this.updateFace()
    this.updateSprings(dt)
    this.updateProps(dt)

    // Ease in/out of sitting so she folds down instead of snapping.
    p.sitPhase = lerp(p.sitPhase, p.sitting ? 1 : 0, dt * 4.5)

    // Dev/testing overrides (used by headless verification).
    if (this.debugEyeOpen != null) p.eyeOpen = this.debugEyeOpen

    p.mode = this.mode
    this.prevX = p.x
    return p
  }

  private updateBreathAndBlink(dt: number): void {
    const p = this.pose
    const rate = this.mode === 'sleep' ? 0.22 : 0.45
    p.breath = (Math.sin(this.now * Math.PI * 2 * rate) + 1) / 2

    if (this.mode === 'sleep') {
      p.eyeOpen = lerp(p.eyeOpen, 0, dt * 6)
      return
    }
    if (this.blinkPhase >= 0) {
      this.blinkPhase += dt
      const t = this.blinkPhase / 0.16
      p.eyeOpen = t < 0.5 ? 1 - t * 2 : (t - 0.5) * 2
      if (t >= 1) {
        this.blinkPhase = -1
        p.eyeOpen = 1
        this.blinkAt = this.now + rand(3, 7)
      }
    } else if (this.now >= this.blinkAt) {
      this.blinkPhase = 0
    }
  }

  private updateMode(dt: number): void {
    const p = this.pose
    switch (this.mode) {
      case 'walk': {
        if (this.walkTarget == null) {
          this.mode = 'idle'
          break
        }
        const dx = this.walkTarget - p.x
        const dir = Math.sign(dx) as 1 | -1
        if (Math.abs(dx) < 6) {
          this.walkTarget = null
          this.mode = 'idle'
          p.legSwing = lerp(p.legSwing, 0, dt * 8)
          break
        }
        p.facing = dir
        // Ease in and out of walking speed so she doesn't start at full pelt.
        p.legSwing = lerp(p.legSwing, 1, dt * 6)
        const step = dir * WALK_SPEED * dt * p.legSwing
        p.x += step
        // The step cycle is driven by DISTANCE TRAVELLED, not by wall time, so
        // the feet stay planted on the ground instead of sliding across it.
        p.legPhase += (Math.abs(step) / STRIDE) * Math.PI
        // The body rises at passing position (legs together) and drops at
        // contact (legs apart) — |cos| of the leg phase, not |sin|.
        p.lift = Math.abs(Math.cos(p.legPhase)) * 4 * p.legSwing
        p.bodyTilt = lerp(p.bodyTilt, dir * 2, dt * 6)
        // Arms swing in OPPOSITION — the left arm goes forward as the right
        // leg does. Swinging both the same way is the toy-soldier walk.
        const swing = Math.sin(p.legPhase) * 20 * p.legSwing
        p.armL = lerp(p.armL, swing, dt * 8)
        p.armR = lerp(p.armR, -swing, dt * 8)
        p.elbowL = lerp(p.elbowL, 10 + swing * 0.35, dt * 6)
        p.elbowR = lerp(p.elbowR, -10 - swing * 0.35, dt * 6)
        p.sitting = false
        break
      }

      case 'think': {
        // Hand really comes up to the chin: shoulder inward, elbow folded.
        p.armR = lerp(p.armR, 26, dt * 6)
        p.elbowR = lerp(p.elbowR, 122, dt * 6)
        p.armL = lerp(p.armL, 6, dt * 5)
        p.elbowL = lerp(p.elbowL, -10, dt * 5)
        p.lookY = lerp(p.lookY, -0.7, dt * 4)
        p.lookX = lerp(p.lookX, 0.35 * p.facing, dt * 4)
        p.headTilt = lerp(p.headTilt, -5, dt * 4)
        p.lift = lerp(p.lift, 0, dt * 8)
        p.legSwing = lerp(p.legSwing, 0, dt * 8)
        break
      }

      case 'sleep': {
        p.sitting = true
        p.lift = lerp(p.lift, 0, dt * 4)
        p.headTilt = lerp(p.headTilt, 14, dt * 2)
        // Arms folded loosely around the teddy in her lap.
        p.armL = lerp(p.armL, -14, dt * 3)
        p.elbowL = lerp(p.elbowL, -46, dt * 3)
        p.armR = lerp(p.armR, 14, dt * 3)
        p.elbowR = lerp(p.elbowR, 46, dt * 3)
        p.bodyTilt = lerp(p.bodyTilt, 4, dt * 2)
        p.legSwing = 0
        p.emotion = 'sleepy'
        if (Math.floor(this.now * 0.5) !== Math.floor((this.now - dt) * 0.5)) {
          if (!this.dropsSleepParticles) this.onEffect?.('zzz', p.x + 40 * p.facing, 200)
        }
        break
      }

      case 'wave': {
        p.sitting = false
        p.headTilt = lerp(p.headTilt, 3, dt * 6)
        p.bodyTilt = lerp(p.bodyTilt, 0, dt * 6)
        // A real wave: the arm rises beside her head and the FOREARM wags
        // around a BENT elbow — rocking through zero would hyperextend it
        // backwards on every half cycle. It also dips first (anticipation).
        const waveT = this.now - (this.waveUntil - 1.8)
        const antic = waveT < 0.2 ? 30 * (1 - waveT / 0.2) : 0
        p.armR = lerp(p.armR, -138 + antic, dt * 9)
        p.elbowR = lerp(p.elbowR, 30 + Math.sin(this.now * 11) * 24, dt * 14)
        p.armL = lerp(p.armL, 4, dt * 6)
        p.elbowL = lerp(p.elbowL, 0, dt * 6)
        if (this.now > this.waveUntil) {
          this.mode = 'idle'
        }
        break
      }

      case 'celebrate': {
        // Both arms shoot up in a V, hands wiggle, happy hops.
        p.armL = lerp(p.armL, 132, dt * 10)
        p.armR = lerp(p.armR, -132, dt * 10)
        p.elbowL = lerp(p.elbowL, Math.sin(this.now * 10) * 14, dt * 12)
        p.elbowR = lerp(p.elbowR, -Math.sin(this.now * 10 + 1) * 14, dt * 12)
        p.lift = Math.abs(Math.sin(this.now * 8)) * 16
        p.legSwing = 0
        if (this.now > this.celebrateUntil) {
          this.mode = 'idle'
          this.celebrateUntil = 0
        }
        break
      }

      case 'drag': {
        // Held up: arms out for balance, legs dangling with a pendulum sway.
        p.lift = lerp(p.lift, 26, dt * 10)
        p.legSwing = lerp(p.legSwing, 0.4, dt * 6)
        p.legPhase += dt * 3
        p.armL = lerp(p.armL, 42, dt * 6)
        p.elbowL = lerp(p.elbowL, 14, dt * 6)
        p.armR = lerp(p.armR, -42, dt * 6)
        p.elbowR = lerp(p.elbowR, -14, dt * 6)
        p.bodyTilt = lerp(p.bodyTilt, clamp((p.x - this.prevX) * 2, -10, 10), dt * 8)
        break
      }

      case 'idle': {
        this.updateIdle(dt)
        break
      }
    }

    const bouncing = this.idleAction && this.now < this.idleAction.until && this.idleAction.name === 'dance'
    if (this.mode !== 'walk' && this.mode !== 'drag' && this.mode !== 'celebrate' && !bouncing) {
      p.lift = lerp(p.lift, 0, dt * 8)
    }
    // Relaxed arm sway — only when nothing else owns the arms.
    const acting = this.idleAction && this.now < this.idleAction.until ? this.idleAction.name : null
    const armsOwned =
      this.mode === 'think' ||
      this.mode === 'wave' ||
      this.mode === 'sleep' ||
      this.mode === 'drag' ||
      this.mode === 'celebrate' ||
      this.mode === 'walk' ||
      (acting !== null && acting !== 'glance' && acting !== 'swayHum' && acting !== 'wander')
    if (!armsOwned) {
      p.armL = lerp(p.armL, Math.sin(this.now * 1.1) * 3, dt * 4)
      p.armR = lerp(p.armR, -Math.sin(this.now * 1.1 + 0.4) * 3, dt * 4)
      p.elbowL = lerp(p.elbowL, -7 + Math.sin(this.now * 1.3) * 2, dt * 4)
      p.elbowR = lerp(p.elbowR, 7 + Math.sin(this.now * 1.3 + 0.6) * 2, dt * 4)
    }
    const dancing = this.idleAction && this.now < this.idleAction.until && this.idleAction.name === 'dance'
    if (this.mode !== 'walk' && this.mode !== 'sleep' && this.mode !== 'drag' && !dancing) {
      p.bodyTilt = lerp(p.bodyTilt, 0, dt * 5)
      p.legSwing = lerp(p.legSwing, 0, dt * 8)
    }
    const sitting =
      this.idleAction && this.now < this.idleAction.until && (this.idleAction.name === 'sit' || this.idleAction.name === 'read')
    if (this.mode !== 'sleep' && !sitting) p.sitting = false
  }

  private updateIdle(dt: number): void {
    const p = this.pose
    p.headTilt = lerp(p.headTilt, Math.sin(this.now * 0.6) * 1.5, dt * 3)

    if (this.idleAction && this.now < this.idleAction.until) {
      const tAct = this.now - this.actionStartedAt
      switch (this.idleAction.name) {
        case 'glance':
          p.lookX = lerp(p.lookX, this.idleAction.data ?? 0.8, dt * 3)
          break
        case 'stretch':
          // A real morning stretch: arms up in a wide V, tiny lean.
          p.armL = lerp(p.armL, 140, dt * 6)
          p.armR = lerp(p.armR, -140, dt * 6)
          p.elbowL = lerp(p.elbowL, Math.sin(this.now * 1.6) * 6, dt * 6)
          p.elbowR = lerp(p.elbowR, -Math.sin(this.now * 1.6) * 6, dt * 6)
          p.headTilt = lerp(p.headTilt, -6, dt * 6)
          break
        case 'adjustGlasses':
          // Hand actually reaches up to the glasses rim.
          p.armR = lerp(p.armR, 74, dt * 8)
          p.elbowR = lerp(p.elbowR, 102, dt * 8)
          p.headTilt = lerp(p.headTilt, 3, dt * 6)
          break
        case 'swayHum':
          p.bodyTilt = Math.sin(this.now * 2.4) * 2
          break
        case 'read':
          // She sits down; the book opens in both hands; eyes scan the lines.
          p.sitting = true
          p.armL = lerp(p.armL, -26, dt * 5)
          p.elbowL = lerp(p.elbowL, -108, dt * 5)
          p.armR = lerp(p.armR, 26, dt * 5)
          p.elbowR = lerp(p.elbowR, 108, dt * 5)
          p.lookY = lerp(p.lookY, 0.55, dt * 3)
          p.lookX = lerp(p.lookX, Math.sin(this.now * 0.8) * 0.3, dt * 3)
          p.headTilt = lerp(p.headTilt, 5, dt * 3)
          break
        case 'coffee': {
          // Mug held at the chest; every few seconds it rises for a sip.
          const sipping = Math.sin(tAct * 0.9 + 1) > 0.55
          p.armR = lerp(p.armR, 16, dt * 5)
          p.elbowR = lerp(p.elbowR, sipping ? 136 : 100, dt * 5)
          p.armL = lerp(p.armL, -8, dt * 5)
          p.elbowL = lerp(p.elbowL, -24, dt * 5)
          p.headTilt = lerp(p.headTilt, sipping ? -4 : 1, dt * 4)
          p.lookY = lerp(p.lookY, sipping ? 0.1 : 0.25, dt * 2)
          break
        }
        case 'magic':
          // Wand swishes in little arcs, sparkles trailing from the tip.
          p.armR = lerp(p.armR, -78 + Math.sin(this.now * 2.6) * 14, dt * 6)
          p.elbowR = lerp(p.elbowR, -18, dt * 5)
          p.headTilt = lerp(p.headTilt, -3, dt * 4)
          if (this.now - this.lastMagicSparkleAt > 0.7) {
            this.lastMagicSparkleAt = this.now
            this.onEffect?.('sparkles', p.x + 52 * p.facing, 310)
          }
          break
        case 'sit':
          // Settled on the floor, hands resting on her lap.
          p.sitting = true
          p.armL = lerp(p.armL, -14, dt * 4)
          p.elbowL = lerp(p.elbowL, -52, dt * 4)
          p.armR = lerp(p.armR, 14, dt * 4)
          p.elbowR = lerp(p.elbowR, 52, dt * 4)
          p.lookX = lerp(p.lookX, Math.sin(this.now * 0.5) * 0.4, dt * 2)
          p.headTilt = lerp(p.headTilt, Math.sin(this.now * 0.8) * 2, dt * 3)
          break
        case 'dance':
          // A happy little groove: sway, bounce, arms pumping alternately.
          p.bodyTilt = Math.sin(this.now * 5) * 4
          p.lift = Math.abs(Math.sin(this.now * 5)) * 6
          p.headTilt = Math.sin(this.now * 5 + 1) * 3
          p.armL = lerp(p.armL, 55 + Math.sin(this.now * 5) * 30, dt * 10)
          p.elbowL = lerp(p.elbowL, 45, dt * 8)
          p.armR = lerp(p.armR, -55 + Math.sin(this.now * 5) * 30, dt * 10)
          p.elbowR = lerp(p.elbowR, -45, dt * 8)
          break
        case 'wander':
          break
      }
      return
    }

    if (this.idleAction) this.idleAction = null

    if (this.now >= this.nextIdleActionAt) {
      // Mostly living-rig motion (glance, stretch, dance, sway, walk);
      // exact-art pose beats (read, coffee, magic, sit) stay occasional
      // treats so they feel like scenes, not a slideshow.
      const roll = Math.random()
      if (this.artActionsOnly) {
        // Only the beats she has been drawn doing; the rest of the time she
        // simply stands and breathes, which beats miming.
        if (roll < 0.2) this.idleAction = { name: 'read', until: this.now + rand(9, 14) }
        else if (roll < 0.38) this.idleAction = { name: 'coffee', until: this.now + rand(7, 11) }
        else if (roll < 0.5) this.idleAction = { name: 'sit', until: this.now + rand(7, 11) }
        else if (roll < 0.58) this.idleAction = { name: 'dance', until: this.now + rand(3, 4.5) }
        else if (roll < 0.86) this.walkTo(rand(90, this.stageWidth - 90))
        else this.idleAction = { name: 'glance', until: this.now + rand(1.2, 2.5), data: rand(-1, 1) }
        this.actionStartedAt = this.now
        this.nextIdleActionAt = (this.idleAction ? this.idleAction.until : this.now) + rand(6, 14)
        return
      }
      if (roll < 0.14) {
        this.idleAction = { name: 'glance', until: this.now + rand(1.2, 2.5), data: rand(-1, 1) }
      } else if (roll < 0.26) {
        this.idleAction = { name: 'stretch', until: this.now + rand(2.5, 4) }
      } else if (roll < 0.34) {
        this.idleAction = { name: 'adjustGlasses', until: this.now + 1.4 }
      } else if (roll < 0.42) {
        this.idleAction = { name: 'read', until: this.now + rand(7, 11) }
      } else if (roll < 0.49) {
        this.idleAction = { name: 'coffee', until: this.now + rand(6, 9) }
      } else if (roll < 0.54) {
        this.idleAction = { name: 'magic', until: this.now + rand(3.5, 5.5) }
      } else if (roll < 0.6) {
        this.idleAction = { name: 'sit', until: this.now + rand(7, 11) }
      } else if (roll < 0.68) {
        this.idleAction = { name: 'dance', until: this.now + rand(3, 5) }
      } else if (roll < 0.88) {
        this.walkTo(rand(90, this.stageWidth - 90))
      } else {
        this.idleAction = { name: 'swayHum', until: this.now + rand(2, 4) }
      }
      this.actionStartedAt = this.now
      this.nextIdleActionAt = (this.idleAction ? this.idleAction.until : this.now) + rand(6, 14)
    }
  }

  /** Ease the prop in/out and expose action timing to renderers. */
  private updateProps(dt: number): void {
    const p = this.pose
    const activeAction = this.idleAction && this.now < this.idleAction.until ? this.idleAction : null
    const want: Pose['prop'] =
      this.mode === 'sleep' ? 'teddy' : (activeAction && ACTION_PROP[activeAction.name]) || 'none'

    if (want !== 'none') {
      // Swap instantly only while fully hidden; otherwise ease out first.
      if (p.prop === 'none' || p.propPhase < 0.03) p.prop = want
      p.propPhase = lerp(p.propPhase, p.prop === want ? 1 : 0, dt * 5)
    } else {
      p.propPhase = lerp(p.propPhase, 0, dt * 5)
      if (p.propPhase < 0.03) p.prop = 'none'
    }
    p.actionTime = activeAction ? this.now - this.actionStartedAt : this.mode === 'sleep' ? this.now : 0
    p.action =
      activeAction && EXACT_ART_ACTIONS.has(activeAction.name)
        ? (activeAction.name as Pose['action'])
        : null
  }

  private updateGaze(dt: number): void {
    const p = this.pose
    if (this.mode === 'think' || this.mode === 'sleep') return
    // Actions that own the gaze: glancing around, or absorbed in a prop.
    const absorbed =
      this.idleAction &&
      this.now < this.idleAction.until &&
      (this.idleAction.name === 'glance' || this.idleAction.name === 'read' || this.idleAction.name === 'coffee')
    if (absorbed) return

    if (this.cursor) {
      // Head is ~330px above the floor at scale 1.
      const dx = clamp((this.cursor.x - p.x) / 420, -1, 1)
      const dy = clamp((this.cursor.y - 240) / 420, -1, 1)
      p.lookX = lerp(p.lookX, dx, dt * 5)
      p.lookY = lerp(p.lookY, dy, dt * 5)
      if (this.mode === 'idle' && Math.abs(dx) > 0.25) {
        p.facing = (dx > 0 ? 1 : -1) as 1 | -1
      }
    } else {
      p.lookX = lerp(p.lookX, 0, dt * 3)
      p.lookY = lerp(p.lookY, 0, dt * 3)
    }
  }

  private updateFace(): void {
    const p = this.pose
    if (p.talking) {
      p.mouth = Math.sin(this.now * 16) > -0.2 ? 'openSmile' : 'smile'
      return
    }
    switch (p.emotion) {
      case 'happy':
        p.mouth = 'openSmile'
        p.browRaise = 0.5
        break
      case 'excited':
      case 'celebrating':
        p.mouth = 'openSmile'
        p.browRaise = 1
        break
      case 'thinking':
      case 'focused':
        p.mouth = 'flat'
        p.browRaise = -0.2
        break
      case 'confused':
        p.mouth = 'o'
        p.browRaise = 0.7
        break
      case 'sad':
        p.mouth = 'sad'
        p.browRaise = -0.8
        break
      case 'surprised':
        p.mouth = 'o'
        p.browRaise = 1
        break
      case 'blushing':
        p.mouth = 'grin'
        p.browRaise = 0.3
        break
      case 'sleepy':
        p.mouth = 'sleepy'
        p.browRaise = -0.3
        break
      default:
        p.mouth = 'smile'
        p.browRaise = 0
    }
  }

  /** Hair & dupatta trail movement with a damped spring. */
  private updateSprings(dt: number): void {
    const p = this.pose
    const vel = (p.x - this.prevX) / Math.max(dt, 0.001)
    const hairTarget = clamp(-vel * 0.06, -14, 14)
    const spring = (value: number, velRef: number, target: number): [number, number] => {
      const k = 60
      const damp = 9
      const accel = (target - value) * k - velRef * damp
      const nextVel = velRef + accel * dt
      return [value + nextVel * dt, nextVel]
    }
    ;[p.hairSway, this.hairVel] = spring(p.hairSway, this.hairVel, hairTarget)
    ;[p.scarfSway, this.scarfVel] = spring(p.scarfSway, this.scarfVel, hairTarget * 1.4)
  }
}
