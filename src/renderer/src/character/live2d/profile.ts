import type { Emotion } from '@shared/types'

/**
 * A Live2D model profile maps BEARi's semantic states (emotions, actions)
 * onto a specific Cubism model's expression names and motion groups, plus
 * layout. This decouples the runtime from any one model, so the free sample
 * works today and BEARi's own rigged model drops in by adding a profile.
 */
export interface Live2DProfile {
  key: string
  /** model3.json URL under /live2d/models/… (served from public). */
  modelUrl: string
  /** Fraction of the window height the model should fill. */
  fitHeight: number
  /** Cubism parameter id used for mouth open (lip-sync while talking). */
  mouthParam: string
  /** Emotion → expression id/name defined in the model. */
  expressions: Partial<Record<Emotion, string>>
  /** Action → [motionGroup, index?] defined in the model. */
  motions: {
    idle: [string, number?]
    wave?: [string, number?]
    celebrate?: [string, number?]
    walk?: [string, number?]
    sleep?: [string, number?]
    think?: [string, number?]
  }
}

/** BEARi's own rigged model — the naming spec the rigger should follow. */
export const BEARI_PROFILE: Live2DProfile = {
  key: 'beari',
  modelUrl: './live2d/models/beari/beari.model3.json',
  fitHeight: 0.96,
  mouthParam: 'ParamMouthOpenY',
  expressions: {
    neutral: 'neutral',
    happy: 'happy',
    excited: 'excited',
    thinking: 'thinking',
    confused: 'confused',
    sad: 'sad',
    surprised: 'surprised',
    blushing: 'blushing',
    sleepy: 'sleepy',
    focused: 'thinking',
    celebrating: 'excited'
  },
  motions: {
    idle: ['Idle'],
    wave: ['Wave', 0],
    celebrate: ['Celebrate', 0],
    walk: ['Walk', 0],
    sleep: ['Sleep', 0],
    think: ['Think', 0]
  }
}

/** Free Live2D sample (Haru) — proves the whole engine before BEARi's model exists. */
export const SAMPLE_PROFILE: Live2DProfile = {
  key: 'sample',
  modelUrl: './live2d/models/sample/haru_greeter_t03.model3.json',
  fitHeight: 0.95,
  mouthParam: 'ParamMouthOpenY',
  expressions: {
    neutral: 'f00',
    happy: 'f01',
    surprised: 'f02',
    excited: 'f03',
    thinking: 'f04',
    blushing: 'f05',
    sad: 'f06',
    confused: 'f07',
    celebrating: 'f03'
  },
  motions: {
    idle: ['Idle'],
    wave: ['Tap', 0],
    celebrate: ['Tap', 1]
  }
}

/** Loader tries BEARi's model first, then falls back to the sample. */
export const PROFILE_CHAIN: Live2DProfile[] = [BEARI_PROFILE, SAMPLE_PROFILE]
