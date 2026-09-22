/**
 * Cuts BEARi's pose artwork from the reference sheets for the puppet
 * renderer: crop → border flood-fill background removal (interior whites
 * survive) → trim → 2× Lanczos upscale for smooth on-screen scaling.
 *
 * Usage: npx tsx scripts/cut-puppet-art.ts
 */
import { mkdirSync } from 'fs'
import { resolve } from 'path'
import sharp from 'sharp'

interface Cut {
  out: string
  src: string
  x: number
  y: number
  w: number
  h: number
  tol?: number
  /** Optional region (crop-relative) to force-erase, e.g. a stray decoration. */
  erase?: { x: number; y: number; w: number; h: number }
}

const CUTS: Cut[] = [
  {
    out: 'beari-front',
    src: 'reference/sections/sheet-1-identity/view-angles-front-side-back.png',
    x: 50,
    y: 70,
    w: 195,
    h: 280
  },
  {
    out: 'beari-side',
    src: 'reference/sections/sheet-1-identity/view-angles-front-side-back.png',
    x: 275,
    y: 68,
    w: 165,
    h: 282
  },
  {
    out: 'beari-wave',
    src: 'reference/sections/sheet-1-identity/hero-waving.png',
    x: 34,
    y: 4,
    w: 372,
    h: 440,
    erase: { x: 0, y: 0, w: 80, h: 32 }
  },
  // props (from the accessories panel)
  { out: 'props/mug', src: 'reference/sections/sheet-3-library/accessories-props.png', x: 250, y: 16, w: 64, h: 50 },
  { out: 'props/book', src: 'reference/sections/sheet-3-library/accessories-props.png', x: 336, y: 16, w: 56, h: 52 },
  { out: 'props/wand', src: 'reference/sections/sheet-3-library/accessories-props.png', x: 84, y: 84, w: 62, h: 56 },
  { out: 'props/teddy', src: 'reference/sections/sheet-3-library/accessories-props.png', x: 338, y: 86, w: 56, h: 62 }
]

const OUT_DIR = resolve('src/renderer/public/puppet')

async function process(cut: Cut): Promise<void> {
  const meta = await sharp(resolve(cut.src)).metadata()
  const left = Math.max(0, cut.x)
  const top = Math.max(0, cut.y)
  const width = Math.min(cut.w, (meta.width ?? 0) - left)
  const height = Math.min(cut.h, (meta.height ?? 0) - top)

  const { data, info } = await sharp(resolve(cut.src))
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width: w, height: h } = info
  const idx = (x: number, y: number): number => (y * w + x) * 4
  const tol = cut.tol ?? 26
  // Median of all border pixels — robust against decorations touching a corner.
  const borderIdx: number[] = []
  for (let x = 0; x < w; x++) borderIdx.push(idx(x, 0), idx(x, h - 1))
  for (let y = 0; y < h; y++) borderIdx.push(idx(0, y), idx(w - 1, y))
  const median = (c: number): number => {
    const vals = borderIdx.map((i) => data[i + c]).sort((a, b) => a - b)
    return vals[Math.floor(vals.length / 2)]
  }
  const bg = [median(0), median(1), median(2)]
  const isBg = (i: number): boolean => {
    const dr = data[i] - bg[0]
    const dg = data[i + 1] - bg[1]
    const db = data[i + 2] - bg[2]
    return Math.sqrt(dr * dr + dg * dg + db * db) < tol
  }

  const visited = new Uint8Array(w * h)
  const queue: number[] = []
  for (let x = 0; x < w; x++) queue.push(x, 0, x, h - 1)
  for (let y = 0; y < h; y++) queue.push(0, y, w - 1, y)
  while (queue.length) {
    const y = queue.pop()!
    const x = queue.pop()!
    if (x < 0 || y < 0 || x >= w || y >= h) continue
    const p = y * w + x
    if (visited[p]) continue
    visited[p] = 1
    const i = p * 4
    if (!isBg(i)) continue
    data[i + 3] = 0
    queue.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1)
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = idx(x, y)
      if (data[i + 3] === 0) continue
      const nbs = [idx(x - 1, y), idx(x + 1, y), idx(x, y - 1), idx(x, y + 1)]
      if (nbs.some((n) => data[n + 3] === 0)) data[i + 3] = 200
    }
  }
  if (cut.erase) {
    for (let y = cut.erase.y; y < Math.min(h, cut.erase.y + cut.erase.h); y++) {
      for (let x = cut.erase.x; x < Math.min(w, cut.erase.x + cut.erase.w); x++) {
        data[idx(x, y) + 3] = 0
      }
    }
  }

  const trimmed = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .trim({ threshold: 1 })
    .png()
    .toBuffer()
  const tm = await sharp(trimmed).metadata()
  await sharp(trimmed)
    .resize((tm.width ?? w) * 2, (tm.height ?? h) * 2, { kernel: 'lanczos3' })
    .png()
    .toFile(resolve(OUT_DIR, `${cut.out}.png`))
  console.log(`${cut.out}.png  ${(tm.width ?? 0) * 2}x${(tm.height ?? 0) * 2}`)
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })
  for (const cut of CUTS) await process(cut)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
