import type { Emotion } from '@shared/types'

export type EffectKind =
  | 'hearts'
  | 'sparkles'
  | 'stars'
  | 'confetti'
  | 'zzz'
  | 'question'
  | 'music'
  | 'exclaim'
  | 'raincloud'
  | 'thoughts'

export interface EffectEvent {
  kind: EffectKind
  x: number
  y: number
}

type Listener = (e: EffectEvent) => void

/** Tiny pub/sub so any engine can request particles without coupling. */
class EffectsBus {
  private listeners = new Set<Listener>()

  on(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  emit(kind: EffectKind, x: number, y: number): void {
    for (const fn of this.listeners) fn({ kind, x, y })
  }
}

export const effectsBus = new EffectsBus()

/** Which particles an emotion triggers when it arrives. */
export const EMOTION_EFFECTS: Partial<Record<Emotion, EffectKind>> = {
  happy: 'hearts',
  excited: 'sparkles',
  celebrating: 'confetti',
  confused: 'question',
  sad: 'raincloud',
  surprised: 'exclaim',
  blushing: 'hearts',
  sleepy: 'zzz',
  thinking: 'thoughts'
}
