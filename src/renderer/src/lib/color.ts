/** Color helpers for the outfit system (renderer-only: uses canvas). */

import type { OutfitColors } from '@shared/types'

let ctx: CanvasRenderingContext2D | null = null

/** Normalizes any CSS color ("blue", "#f80", "rgb(…)") to #rrggbb, or null. */
export function normalizeColor(input: string): string | null {
  if (!ctx) {
    ctx = document.createElement('canvas').getContext('2d')
    if (!ctx) return null
  }
  ctx.fillStyle = '#000'
  ctx.fillStyle = input.trim()
  const a = ctx.fillStyle
  ctx.fillStyle = '#fff'
  ctx.fillStyle = input.trim()
  // Invalid colors leave fillStyle at the previous value — detect by mismatch.
  if (a !== ctx.fillStyle) return null
  return typeof a === 'string' && a.startsWith('#') ? a : null
}

function toRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ]
}

function toHex(r: number, g: number, b: number): string {
  const h = (v: number): string =>
    Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

export function shade(hex: string, factor: number): string {
  const [r, g, b] = toRgb(hex)
  return factor >= 0
    ? toHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor)
    : toHex(r * (1 + factor), g * (1 + factor), b * (1 + factor))
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/**
 * "I'm wearing blue" → a coordinated outfit: dress takes the color,
 * trim goes darker, scarf stays light (or flips to white on dark dresses),
 * accessories echo the dress.
 */
export function outfitFromColor(css: string, current: OutfitColors): OutfitColors | null {
  const dress = normalizeColor(css)
  if (!dress) return null
  const dark = luminance(dress) < 0.45
  return {
    ...current,
    dress,
    dressTrim: shade(dress, -0.25),
    scarf: dark ? '#FBF7F2' : shade(dress, 0.75),
    hairAccessory: shade(dress, dark ? 0.35 : -0.35)
  }
}
