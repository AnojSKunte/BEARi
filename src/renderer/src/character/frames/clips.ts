/**
 * Frame-animation timelines.
 *
 * Every clip in `frames.json` is a row of hand-drawn frames. A timeline says
 * which of them to show, in what order and for how long. Frames are held, never
 * cross-faded: two drawings blended on top of each other is exactly what makes
 * a character look doubled and ghosted, so the smoothness here comes from
 * timing and from the whole-body secondary motion the renderer adds.
 *
 * Each timeline has three parts:
 *   intro  played once on the way in   (stand up -> crouch -> sit down)
 *   loop   repeated while the state lasts (turning pages)
 *   outro  played once on the way out  (stand back up)
 * so she never teleports between poses.
 */
import data from './frames.json'

export interface ClipMeta {
  file: string
  view: 'front' | 'side'
  count: number
  cellW: number
  cellH: number
  anchorX: number
  anchorY: number
  /** Per frame: how far above the floor the artwork puts her feet (a jump), strip px. */
  lifts: number[]
  /** Per frame: head-top to feet, strip px - lets a cut be weighted by how far she drops or rises. */
  heights: number[]
}

export interface FrameData {
  standH: number
  clips: Record<string, ClipMeta>
}

export const FRAMES = data as FrameData

/** One beat: show frame `f` of the clip for `ms` milliseconds. */
export interface Step {
  f: number
  ms: number
}

export interface Timeline {
  clip: string
  intro: Step[]
  loop: Step[]
  outro: Step[]
  /** Play the loop this many times, then finish (celebration, wave). */
  loops?: number
}

const s = (f: number, ms: number): Step => ({ f, ms })

/**
 * `rest` is the canonical standing frame every other clip was aligned to, so
 * cutting to it and back is invisible.
 */
export const TIMELINES: Record<string, Timeline> = {
  rest: { clip: 'wave', intro: [], loop: [s(0, 400)], outro: [] },

  // hand comes up, waves four times, comes back down
  wave: {
    clip: 'wave',
    intro: [s(1, 110), s(2, 95)],
    loop: [s(3, 140), s(4, 105), s(5, 140), s(4, 105)],
    outro: [s(2, 95), s(1, 110)],
    loops: 2
  },

  // hand rises, finger to chin, then the idea lands
  think: {
    clip: 'think',
    intro: [s(1, 130)],
    loop: [s(2, 900), s(2, 900), s(3, 700)],
    outro: [s(1, 120)]
  },

  // mug appears, she sips, lowers it, holds it in both hands
  coffee: {
    clip: 'coffee',
    intro: [s(1, 340), s(5, 420)],
    loop: [s(5, 800), s(2, 170), s(3, 560), s(3, 300), s(2, 200), s(4, 480), s(5, 1000)],
    outro: [s(1, 200)]
  },

  // stands, crouches, sits down, a book appears, reads and turns pages
  read: {
    clip: 'read',
    intro: [s(1, 280), s(2, 420), s(3, 460)],
    loop: [s(4, 1500), s(5, 520), s(4, 1700), s(3, 900)],
    outro: [s(2, 380), s(1, 260)]
  },

  // just sits down for a while - the same crouch, without the book
  sit: {
    clip: 'read',
    intro: [s(1, 280), s(2, 420)],
    loop: [s(2, 1200)],
    outro: [s(1, 260)]
  },

  // crouch, spring up, apex, land, cheer
  celebrate: {
    clip: 'celebrate',
    // 540 ms in the air: the motion layer flies a parabola over these beats,
    // and this much hang time gives the jump weight instead of a twitch
    intro: [s(1, 170)],
    loop: [s(2, 130), s(3, 280), s(2, 130), s(4, 150), s(5, 460)],
    outro: [s(4, 110), s(1, 100)],
    loops: 2
  },

  // yawn, sit down, hug the teddy, drift off
  sleep: {
    clip: 'sleep',
    intro: [s(0, 1000), s(1, 560), s(2, 1150)],
    loop: [s(3, 2600)],
    outro: [s(2, 520), s(1, 360)]
  },

  // driven by distance travelled, not by the clock - see FrameBeari
  walk: { clip: 'walk', intro: [], loop: [], outro: [] }
}

export type TimelineId = keyof typeof TIMELINES

/** Timelines whose artwork actually exists in this build. */
export function hasTimeline(id: string): boolean {
  const t = TIMELINES[id]
  return !!t && !!FRAMES.clips[t.clip]
}
