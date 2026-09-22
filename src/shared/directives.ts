import type { Emotion, OutfitStyle, ReplyDirectives } from './types'
import { EMOTIONS, OUTFIT_STYLES } from './types'

const TAG_RE = /<(mood|outfit|style|remember):([^>]*)>/g

/** Friendly words the model might use for each garment. */
const STYLE_WORDS: Record<string, OutfitStyle> = {
  kurta: 'kurta',
  kurti: 'kurta',
  traditional: 'kurta',
  frock: 'frock',
  dress: 'frock',
  croptop: 'croptop',
  'crop top': 'croptop',
  'crop-top': 'croptop',
  jeans: 'croptop',
  casual: 'croptop',
  hoodie: 'hoodie',
  sweatshirt: 'hoodie',
  cozy: 'hoodie'
}

/**
 * Extracts <mood:…> / <outfit:…> / <style:…> / <remember:…> directives from a
 * reply and returns the cleaned display text. Tolerant of models that place
 * tags anywhere in the message.
 */
export function parseDirectives(raw: string): { text: string; directives: ReplyDirectives } {
  const directives: ReplyDirectives = {}
  const text = raw
    .replace(TAG_RE, (_, tag: string, value: string) => {
      const v = value.trim()
      if (tag === 'mood' && (EMOTIONS as readonly string[]).includes(v)) {
        directives.emotion = v as Emotion
      } else if (tag === 'outfit' && v) {
        directives.outfitColor = v
      } else if (tag === 'style' && v) {
        const key = v.toLowerCase()
        const style = (OUTFIT_STYLES as readonly string[]).includes(key) ? (key as OutfitStyle) : STYLE_WORDS[key]
        if (style) directives.outfitStyle = style
      } else if (tag === 'remember' && v) {
        directives.remember = v
      }
      return ''
    })
    .trim()
  return { text, directives }
}

/** Strips directive tags from a partial (streaming) buffer for live display. */
export function stripDirectives(raw: string): string {
  // Remove complete tags, plus any unterminated tag at the end of the buffer.
  return raw.replace(TAG_RE, '').replace(/<(mood|outfit|style|remember):[^>]*$/, '').trimStart()
}
