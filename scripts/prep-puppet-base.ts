/**
 * Prepares the clean BEARi base image for the "living puppet" renderer:
 * paints out the corner watermark, removes the white background by border
 * flood-fill (interior whites like the dupatta survive), trims, and writes a
 * transparent PNG to public/puppet/.
 *
 * Usage: npx tsx scripts/prep-puppet-base.ts
 */
import { mkdirSync } from 'fs'
import { resolve } from 'path'
import sharp from 'sharp'

const SRC = 'reference/sections/sheet-1-identity/hero-waving.png'
const OUT = 'src/renderer/public/puppet/beari-base.png'
const TOL = 30

async function main(): Promise<void> {
  // 1. Paint white over the top-left watermark pill, then load raw RGBA.
  const meta = await sharp(resolve(SRC)).metadata()
  const W = meta.width ?? 0
  const patched = await sharp(resolve(SRC))
    .composite([{ input: { create: { width: Math.round(W * 0.16), height: 34, channels: 4, background: '#ffffff' } }, left: 0, top: 0 }])
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { data, info } = patched
  const { width: w, height: h } = info
  const idx = (x: number, y: number): number => (y * w + x) * 4

  // Background reference = average of the four corners.
  const corners = [idx(0, 0), idx(w - 1, 0), idx(0, h - 1), idx(w - 1, h - 1)]
  const bg = [0, 1, 2].map((c) => corners.reduce((s, i) => s + data[i + c], 0) / 4)
  const isBg = (i: number): boolean => {
    const dr = data[i] - bg[0]
    const dg = data[i + 1] - bg[1]
    const db = data[i + 2] - bg[2]
    return Math.sqrt(dr * dr + dg * dg + db * db) < TOL
  }

  // Border flood-fill to clear only the outer background.
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
  // 1px anti-aliased rim.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = idx(x, y)
      if (data[i + 3] === 0) continue
      const nbs = [idx(x - 1, y), idx(x + 1, y), idx(x, y - 1), idx(x, y + 1)]
      if (nbs.some((n) => data[n + 3] === 0)) data[i + 3] = 205
    }
  }

  mkdirSync(resolve(OUT, '..'), { recursive: true })
  const out = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .trim({ threshold: 1 })
    .png()
    .toBuffer()
  await sharp(out).toFile(resolve(OUT))
  const m = await sharp(out).metadata()
  console.log(`puppet base: ${OUT} (${m.width}x${m.height})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
