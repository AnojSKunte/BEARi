/**
 * Clip sequencing for the frame renderer.
 *
 * Kept free of React and the DOM so the exact same logic can be driven offline
 * by scripts/preview-frames.ts, which renders a labelled filmstrip. Browser
 * tabs that are not on screen have their animation clock throttled, so timing
 * can only be checked honestly away from the browser.
 */
import type { Pose } from '../engine/pose'
import { FRAMES, TIMELINES } from './clips'
import type { Timeline } from './clips'

/** How long the spin-on-the-spot takes when she changes which way she faces. */
const TURN_MS = 200
/**
 * How long she rests before a play-once action (a wave, a celebration) may run
 * again. Without this she would stand frozen for the rest of the mood if it were
 * re-triggered while it was still active.
 */
const REPLAY_GAP = 1.1
/**
 * Ground covered per walk frame, as a fraction of her height. Driving the cycle
 * by distance rather than by the clock is what stops her feet skating: the legs
 * only move when she does. The value is tuned for a calm ~9 frames a second at
 * her walking speed.
 */
export const STRIDE_FRACTION = 0.048

// Canvas extents, in strip pixels, big enough for every clip including the jump.
export const EXT = (() => {
  let l = 0
  let r = 0
  let u = 0
  let d = 0
  for (const c of Object.values(FRAMES.clips)) {
    l = Math.max(l, c.anchorX)
    r = Math.max(r, c.cellW - c.anchorX)
    u = Math.max(u, c.anchorY)
    d = Math.max(d, c.cellH - c.anchorY)
  }
  return { l, r, u, d, w: l + r, h: u + d }
})()

export type Phase = 'intro' | 'loop' | 'outro'

/** Which timeline the animator's state asks for. */
export function desired(p: Pose): string {
  switch (p.mode) {
    case 'walk':
      return 'walk'
    case 'sleep':
      return 'sleep'
    case 'wave':
      return 'wave'
    case 'celebrate':
      return 'celebrate'
    case 'think':
      return 'think'
    case 'drag':
      return 'rest'
    default:
      break
  }
  switch (p.action) {
    case 'read':
      return 'read'
    case 'coffee':
      return 'coffee'
    case 'sit':
      return 'sit'
    case 'dance':
      return 'celebrate'
    default:
      return 'rest'
  }
}

const viewOf = (id: string): 'front' | 'side' => FRAMES.clips[TIMELINES[id].clip]?.view ?? 'front'

/** Runs the timelines: sequencing, intro/outro handover and the turn wipe. */
export class Director {
  id = 'rest'
  flip = false
  phase: Phase = 'loop'
  step = 0
  t = 0
  loopsDone = 0
  /** 1 = settled; anything less is a spin in progress. */
  turnT = 1
  walkDist = 0
  walkFrame = 0
  /** A play-once clip that already ran for the state still being requested. */
  private spent: string | null = null
  /** Seconds of rest left before `spent` is allowed to run again. */
  private spentFor = 0
  private queued: { id: string; flip: boolean } | null = null

  private tl(): Timeline {
    return TIMELINES[this.id]
  }

  private seq(): { f: number; ms: number }[] {
    const t = this.tl()
    return this.phase === 'intro' ? t.intro : this.phase === 'outro' ? t.outro : t.loop
  }

  frame(): { clip: string; index: number } {
    const t = this.tl()
    if (this.id === 'walk') return { clip: 'walk', index: this.walkFrame }
    const seq = this.seq()
    const st = seq[Math.min(this.step, seq.length - 1)]
    return { clip: t.clip, index: st ? st.f : 0 }
  }

  private enter(id: string): void {
    this.id = id
    this.phase = TIMELINES[id].intro.length ? 'intro' : 'loop'
    this.step = 0
    this.t = 0
    this.loopsDone = 0
    this.walkDist = 0
    this.walkFrame = 0
  }

  /** Switch now, spinning on the spot first if she has to turn around. */
  private begin(id: string, flip: boolean): void {
    if (viewOf(id) !== viewOf(this.id) || flip !== this.flip) {
      // If a spin is already opening back out, restart it at the point that
      // matches her current width so she carries on narrowing, instead of
      // snapping out to full width and closing again.
      const width = Math.abs(Math.cos(this.turnT * Math.PI))
      this.turnT = this.turnT < 1 ? Math.min(0.49, Math.acos(Math.min(1, width)) / Math.PI) : 0
      this.queued = { id, flip }
      return
    }
    this.enter(id)
  }

  update(dt: number, want: string, wantFlip: boolean, movedPx: number, stridePx: number): void {
    // --- spin on the spot; the new pose appears at the half-way point
    if (this.turnT < 1) {
      const before = this.turnT
      this.turnT = Math.min(1, this.turnT + (dt * 1000) / TURN_MS)
      if (before < 0.5 && this.turnT >= 0.5 && this.queued) {
        this.flip = this.queued.flip
        this.enter(this.queued.id)
        this.queued = null
      }
    }

    // --- a play-once clip rests before it may run again
    if (this.spent) {
      if (want !== this.spent) {
        this.spent = null
        this.spentFor = 0
      } else {
        this.spentFor -= dt
        if (this.spentFor <= 0) this.spent = null
      }
    }
    const target = this.spent === want ? 'rest' : want
    const targetFlip = viewOf(target) === 'side' ? wantFlip : false

    // --- the walk cycle is driven by ground covered, so her feet never slide
    if (this.id === 'walk' && stridePx > 0) {
      this.walkDist += Math.abs(movedPx)
      this.walkFrame = Math.floor(this.walkDist / stridePx) % FRAMES.clips.walk.count
    }

    if (this.queued) return // mid-turn: hold the outgoing pose

    // --- leave the current timeline properly before taking up the next
    if ((target !== this.id || targetFlip !== this.flip) && this.phase !== 'outro') {
      const t = this.tl()
      if (this.id !== 'walk' && t.outro.length) {
        this.phase = 'outro'
        this.step = 0
        this.t = 0
      } else {
        this.begin(target, targetFlip)
        return
      }
    }

    if (this.id === 'walk') return

    const seq = this.seq()
    if (!seq.length) return
    this.t += dt * 1000
    let guard = 0
    while (this.t >= seq[Math.min(this.step, seq.length - 1)].ms && guard++ < 64) {
      this.t -= seq[Math.min(this.step, seq.length - 1)].ms
      this.step++
      if (this.step < seq.length) continue
      const t = this.tl()
      if (this.phase === 'intro') {
        this.step = 0
        this.phase = 'loop'
      } else if (this.phase === 'loop') {
        this.step = 0
        this.loopsDone++
        if (t.loops && this.loopsDone >= t.loops) {
          this.spent = this.id
          this.spentFor = REPLAY_GAP
          if (t.outro.length) {
            this.phase = 'outro'
          } else {
            this.begin('rest', false)
            return
          }
        }
      } else {
        // Outro finished: hand over. `step` is deliberately left past the end of
        // the sequence - if begin() has to spin her round first, frame() clamps
        // and holds her LAST outro pose through the spin instead of snapping
        // back to the first one. If the same action is still wanted (she was
        // interrupted mid-stand-up and asked to sit again) this re-enters it,
        // which continues from the crouch she is already in.
        this.begin(target, targetFlip)
        return
      }
      break
    }
  }
}

