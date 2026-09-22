import type { Emotion } from '@shared/types'

/** Mouth shapes Beari.tsx knows how to draw. */
export type MouthShape = 'smile' | 'openSmile' | 'o' | 'flat' | 'sad' | 'grin' | 'sleepy'

/** High-level behaviour modes the Animator can be in. */
export type Mode = 'idle' | 'walk' | 'think' | 'sleep' | 'wave' | 'drag' | 'celebrate'

/** Hand-held props BEARi can bring out during actions. */
export type PropKind = 'none' | 'book' | 'mug' | 'wand' | 'teddy'

/**
 * Idle actions that have exact reference artwork. Renderers that can show
 * her real art (puppet, sprite) swap to the matching painted pose while one
 * of these is active; other renderers keep animating procedurally.
 */
export type ActionKind = 'read' | 'coffee' | 'magic' | 'stretch' | 'sit' | 'dance' | null

/**
 * The complete, renderer-agnostic description of BEARi's body at one
 * instant. The Animator produces ~60 of these per second; Beari.tsx turns
 * one into SVG. Nothing else may drive the body.
 */
export interface Pose {
  /** Feet anchor, px from the left edge of the stage. */
  x: number
  /** Vertical offset above the floor (walk bob, jumps). */
  lift: number
  facing: 1 | -1
  /** Whole-body squash & stretch, 1 = rest. */
  squash: number
  bodyTilt: number
  /** 0..1 breathing cycle (chest/head rise). */
  breath: number
  headTilt: number
  /** -1..1 gaze / head turn. */
  lookX: number
  lookY: number
  /** 1 open .. 0 closed. */
  eyeOpen: number
  /** -1 (frown) .. 1 (raised). */
  browRaise: number
  mouth: MouthShape
  /** Shoulder rotations in degrees; 0 = arm resting down. */
  armL: number
  armR: number
  /** Elbow bend in degrees; 0 = straight. Positive folds the forearm across/up. */
  elbowL: number
  elbowR: number
  /** Walk cycle phase; motion speed drives it. */
  legPhase: number
  /** How much the legs are moving, 0 = standing. */
  legSwing: number
  /** Springy trailing offsets for hair & dupatta. */
  hairSway: number
  scarfSway: number
  sitting: boolean
  /** Eased 0→1 sit-down progress — renderers fold the legs with this. */
  sitPhase: number
  emotion: Emotion
  talking: boolean
  /** Snapshot of the Animator's current mode (for sprite-state mapping). */
  mode: Mode
  /** Current prop and its eased appear/disappear phase (0 hidden … 1 held). */
  prop: PropKind
  propPhase: number
  /** Seconds since the current idle action started (drives prop micro-motion). */
  actionTime: number
  /** Exact-art idle action currently active, if any. */
  action: ActionKind
}

export function restPose(x: number): Pose {
  return {
    x,
    lift: 0,
    facing: 1,
    squash: 1,
    bodyTilt: 0,
    breath: 0,
    headTilt: 0,
    lookX: 0,
    lookY: 0,
    eyeOpen: 1,
    browRaise: 0,
    mouth: 'smile',
    armL: 0,
    armR: 0,
    elbowL: 0,
    elbowR: 0,
    legPhase: 0,
    legSwing: 0,
    hairSway: 0,
    scarfSway: 0,
    sitting: false,
    sitPhase: 0,
    emotion: 'neutral',
    talking: false,
    mode: 'idle',
    prop: 'none',
    propPhase: 0,
    actionTime: 0,
    action: null
  }
}
