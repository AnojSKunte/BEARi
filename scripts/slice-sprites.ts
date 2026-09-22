/**
 * Sprite pipeline v2 — cuts BEARi's action artwork out of the reference
 * sections at maximum fidelity:
 *
 *   crop (generous, caption band included)
 *   → border flood-fill background removal (interior whites survive)
 *   → connected-component filter (drops caption text + stray flecks,
 *     keeps the figure and anything meaningfully sized near it)
 *   → soft 2-ring alpha feather on the silhouette edge
 *   → tight trim
 *   → 2× Lanczos upscale + gentle sharpen (same treatment as the puppet art)
 *
 * Writes src/renderer/public/sprites/*.png and, if an argument is given,
 * a checkerboard contact sheet for visual verification.
 *
 * Usage: npx tsx scripts/slice-sprites.ts [contactSheetOut]
 */
import { mkdirSync } from 'fs'
import { resolve } from 'path'
import sharp from 'sharp'

interface Cell {
  out: string
  src: string
  x: number
  y: number
  w: number
  h: number
  /** Flood-fill tolerance (distance from border background color). */
  tol?: number
  /** Keep components at least this fraction of the figure's size (default 0.015). */
  minFrac?: number
  /** Fraction of crop height (from the bottom) treated as the caption band. */
  captionBand?: number
}

const S2 = 'reference/sections/sheet-2-actions'

/** Generous crops — the component filter cleans captions and strays. */
const CELLS: Cell[] = [
  // ---- full body poses (3 rows × 5 cols)
  { out: 'pose-standing', src: `${S2}/full-body-poses-15.png`, x: 6, y: 30, w: 96, h: 148 },
  { out: 'pose-walking', src: `${S2}/full-body-poses-15.png`, x: 99, y: 16, w: 98, h: 162 },
  { out: 'pose-running', src: `${S2}/full-body-poses-15.png`, x: 192, y: 16, w: 100, h: 162 },
  { out: 'pose-jumping', src: `${S2}/full-body-poses-15.png`, x: 287, y: 8, w: 104, h: 170 },
  { out: 'pose-waving', src: `${S2}/full-body-poses-15.png`, x: 384, y: 16, w: 100, h: 162 },
  { out: 'pose-sitting', src: `${S2}/full-body-poses-15.png`, x: 4, y: 186, w: 102, h: 140 },
  { out: 'pose-reading', src: `${S2}/full-body-poses-15.png`, x: 99, y: 186, w: 98, h: 140 },
  { out: 'pose-typing', src: `${S2}/full-body-poses-15.png`, x: 192, y: 186, w: 102, h: 140 },
  { out: 'pose-thinking', src: `${S2}/full-body-poses-15.png`, x: 289, y: 186, w: 96, h: 140 },
  { out: 'pose-presenting', src: `${S2}/full-body-poses-15.png`, x: 382, y: 186, w: 104, h: 140 },
  { out: 'pose-dancing', src: `${S2}/full-body-poses-15.png`, x: 6, y: 332, w: 98, h: 142 },
  { out: 'pose-celebrating', src: `${S2}/full-body-poses-15.png`, x: 99, y: 332, w: 100, h: 142 },
  { out: 'pose-stretching', src: `${S2}/full-body-poses-15.png`, x: 192, y: 332, w: 102, h: 142 },
  { out: 'pose-coffee-time', src: `${S2}/full-body-poses-15.png`, x: 287, y: 332, w: 102, h: 142 },
  { out: 'pose-magic-wand', src: `${S2}/full-body-poses-15.png`, x: 382, y: 332, w: 102, h: 142 },
  // ---- interactions & fun actions (3 rows × 5 cols)
  { out: 'fun-peeking', src: `${S2}/interactions-fun-actions.png`, x: 4, y: 26, w: 96, h: 134 },
  { out: 'fun-riding-cursor', src: `${S2}/interactions-fun-actions.png`, x: 98, y: 22, w: 100, h: 138 },
  { out: 'fun-holding-heart', src: `${S2}/interactions-fun-actions.png`, x: 194, y: 13, w: 100, h: 147 },
  { out: 'fun-playing-with-cat', src: `${S2}/interactions-fun-actions.png`, x: 290, y: 18, w: 104, h: 142 },
  { out: 'fun-watching-you', src: `${S2}/interactions-fun-actions.png`, x: 389, y: 13, w: 96, h: 147 },
  { out: 'fun-on-laptop', src: `${S2}/interactions-fun-actions.png`, x: 2, y: 165, w: 104, h: 136 },
  { out: 'fun-fishing', src: `${S2}/interactions-fun-actions.png`, x: 99, y: 161, w: 100, h: 140 },
  { out: 'fun-sliding', src: `${S2}/interactions-fun-actions.png`, x: 194, y: 161, w: 102, h: 140 },
  { out: 'fun-climbing-window', src: `${S2}/interactions-fun-actions.png`, x: 292, y: 158, w: 100, h: 143 },
  { out: 'fun-hiding', src: `${S2}/interactions-fun-actions.png`, x: 388, y: 161, w: 100, h: 140 },
  { out: 'fun-pushing', src: `${S2}/interactions-fun-actions.png`, x: 2, y: 308, w: 98, h: 144 },
  { out: 'fun-pulling', src: `${S2}/interactions-fun-actions.png`, x: 97, y: 308, w: 102, h: 144 },
  { out: 'fun-carrying-box', src: `${S2}/interactions-fun-actions.png`, x: 194, y: 308, w: 102, h: 144 },
  { out: 'fun-reading-book', src: `${S2}/interactions-fun-actions.png`, x: 292, y: 308, w: 100, h: 144 },
  { out: 'fun-taking-selfie', src: `${S2}/interactions-fun-actions.png`, x: 386, y: 308, w: 102, h: 144 },
  // ---- animated action sequence beats
  { out: 'seq-thinking', src: `${S2}/animated-action-sequence.png`, x: 8, y: 20, w: 116, h: 118 },
  { out: 'seq-searching', src: `${S2}/animated-action-sequence.png`, x: 150, y: 20, w: 122, h: 118 },
  { out: 'seq-found-it', src: `${S2}/animated-action-sequence.png`, x: 296, y: 20, w: 118, h: 118 },
  { out: 'seq-yay', src: `${S2}/animated-action-sequence.png`, x: 432, y: 20, w: 116, h: 118 },
  { out: 'seq-sending', src: `${S2}/animated-action-sequence.png`, x: 564, y: 20, w: 120, h: 118 },
  // ---- emotion effect glyphs (2 rows × 6 cols)
  { out: 'fx-hearts', src: `${S2}/emotion-effects.png`, x: 8, y: 22, w: 76, h: 76 },
  { out: 'fx-sparkles', src: `${S2}/emotion-effects.png`, x: 94, y: 22, w: 76, h: 76 },
  { out: 'fx-stars', src: `${S2}/emotion-effects.png`, x: 178, y: 22, w: 76, h: 76 },
  { out: 'fx-exclamation', src: `${S2}/emotion-effects.png`, x: 264, y: 22, w: 66, h: 76 },
  { out: 'fx-question', src: `${S2}/emotion-effects.png`, x: 346, y: 22, w: 66, h: 76 },
  { out: 'fx-idea', src: `${S2}/emotion-effects.png`, x: 426, y: 22, w: 66, h: 76 },
  { out: 'fx-angry-steam', src: `${S2}/emotion-effects.png`, x: 8, y: 106, w: 76, h: 64, captionBand: 0.3 },
  { out: 'fx-dizzy-birds', src: `${S2}/emotion-effects.png`, x: 92, y: 106, w: 78, h: 64, captionBand: 0.3 },
  { out: 'fx-rain-cloud', src: `${S2}/emotion-effects.png`, x: 178, y: 106, w: 74, h: 64, captionBand: 0.3 },
  { out: 'fx-confetti', src: `${S2}/emotion-effects.png`, x: 260, y: 106, w: 74, h: 50, captionBand: 0.12 },
  { out: 'fx-glow', src: `${S2}/emotion-effects.png`, x: 342, y: 106, w: 72, h: 64, captionBand: 0.3 },
  { out: 'fx-sleepy-zzz', src: `${S2}/emotion-effects.png`, x: 422, y: 106, w: 76, h: 64, captionBand: 0.3 }
]

const OUT_DIR = resolve('src/renderer/public/sprites')

async function cutSprite(cell: Cell): Promise<sharp.Sharp> {
  const meta = await sharp(resolve(cell.src)).metadata()
  const left = Math.max(0, cell.x)
  const top = Math.max(0, cell.y)
  const width = Math.min(cell.w, (meta.width ?? 0) - left)
  const height = Math.min(cell.h, (meta.height ?? 0) - top)

  const { data, info } = await sharp(resolve(cell.src))
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width: w, height: h } = info
  const idx = (x: number, y: number): number => (y * w + x) * 4
  const tol = cell.tol ?? 26

  // Background reference = median of border pixels (robust to decorations).
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

  // 1. Border flood fill — clears only background connected to the edge.
  const visited = new Uint8Array(w * h)
  const stack: number[] = []
  for (let x = 0; x < w; x++) stack.push(x, 0, x, h - 1)
  for (let y = 0; y < h; y++) stack.push(0, y, w - 1, y)
  while (stack.length) {
    const y = stack.pop()!
    const x = stack.pop()!
    if (x < 0 || y < 0 || x >= w || y >= h) continue
    const p = y * w + x
    if (visited[p]) continue
    visited[p] = 1
    const i = p * 4
    if (!isBg(i)) continue
    data[i + 3] = 0
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1)
  }

  // 2. Connected components over remaining opaque pixels.
  const label = new Int32Array(w * h).fill(-1)
  interface Comp {
    id: number
    count: number
    minX: number
    minY: number
    maxX: number
    maxY: number
  }
  const comps: Comp[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (label[p] !== -1 || data[p * 4 + 3] === 0) continue
      const comp: Comp = { id: comps.length, count: 0, minX: x, minY: y, maxX: x, maxY: y }
      const q = [x, y]
      label[p] = comp.id
      while (q.length) {
        const cy = q.pop()!
        const cx = q.pop()!
        comp.count++
        comp.minX = Math.min(comp.minX, cx)
        comp.maxX = Math.max(comp.maxX, cx)
        comp.minY = Math.min(comp.minY, cy)
        comp.maxY = Math.max(comp.maxY, cy)
        for (const [nx, ny] of [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1]
        ]) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const np = ny * w + nx
          if (label[np] !== -1 || data[np * 4 + 3] === 0) continue
          label[np] = comp.id
          q.push(nx, ny)
        }
      }
      comps.push(comp)
    }
  }
  if (comps.length === 0) throw new Error(`${cell.out}: nothing found in crop`)

  // 3. Keep the figure + meaningfully sized neighbours; drop caption text
  //    (components living entirely in the bottom band) and tiny flecks.
  const biggest = comps.reduce((a, b) => (b.count > a.count ? b : a))
  const minCount = biggest.count * (cell.minFrac ?? 0.015)
  const bandTop = h * (1 - (cell.captionBand ?? 0.2))
  const keep = new Set<number>()
  for (const c of comps) {
    if (c.id === biggest.id) {
      keep.add(c.id)
      continue
    }
    // Caption text below the figure.
    if (c.minY >= bandTop) continue
    // Bottom sliver of a section label chip clipped by the crop's top edge.
    if (c.maxY < 20) continue
    // Thin sliver of a neighbouring cell touching the left/right crop edge.
    if (c.maxX - c.minX <= 8 && (c.minX === 0 || c.maxX === w - 1)) continue
    if (c.count >= minCount) keep.add(c.id)
  }
  for (let p = 0; p < w * h; p++) {
    if (label[p] !== -1 && !keep.has(label[p])) data[p * 4 + 3] = 0
  }

  // 4. Two-ring alpha feather so the silhouette melts into any backdrop.
  const ring1: number[] = []
  const ring2: number[] = []
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = idx(x, y)
      if (data[i + 3] === 0) continue
      const nbs = [idx(x - 1, y), idx(x + 1, y), idx(x, y - 1), idx(x, y + 1)]
      if (nbs.some((n) => data[n + 3] === 0)) ring1.push(i)
    }
  }
  const ringSet = new Set(ring1)
  for (const i of ring1) {
    const p = i / 4
    const x = p % w
    const y = (p - x) / w
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1]
    ]) {
      if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue
      const ni = idx(nx, ny)
      if (data[ni + 3] > 0 && !ringSet.has(ni)) ring2.push(ni)
    }
  }
  for (const i of ring1) data[i + 3] = Math.min(data[i + 3], 165)
  for (const i of ring2) data[i + 3] = Math.min(data[i + 3], 225)

  // 5. Trim + 2× Lanczos upscale + gentle sharpen.
  const trimmed = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .trim({ threshold: 1 })
    .png()
    .toBuffer()
  const tm = await sharp(trimmed).metadata()
  return sharp(trimmed)
    .resize((tm.width ?? w) * 2, (tm.height ?? h) * 2, { kernel: 'lanczos3' })
    .sharpen({ sigma: 0.8 })
    .png()
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })
  const done: { name: string; buf: Buffer; w: number; h: number }[] = []
  for (const cell of CELLS) {
    const img = await cutSprite(cell)
    const buf = await img.toBuffer()
    await sharp(buf).toFile(resolve(OUT_DIR, `${cell.out}.png`))
    const meta = await sharp(buf).metadata()
    done.push({ name: cell.out, buf, w: meta.width ?? 0, h: meta.height ?? 0 })
    console.log(`${cell.out}.png  ${meta.width}x${meta.height}`)
  }
  console.log(`${done.length} sprites written to ${OUT_DIR}`)

  // ---- checkerboard contact sheet for visual verification
  const contactOut = process.argv[2]
  if (!contactOut) return
  const CW = 220
  const CH = 300
  const cols = 8
  const rows = Math.ceil(done.length / cols)
  const checker = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * CW}" height="${rows * CH}">
      <defs><pattern id="c" width="20" height="20" patternUnits="userSpaceOnUse">
        <rect width="20" height="20" fill="#d8d4e2"/><rect width="10" height="10" fill="#ffffff"/>
        <rect x="10" y="10" width="10" height="10" fill="#ffffff"/></pattern></defs>
      <rect width="100%" height="100%" fill="url(#c)"/>
      ${done.map((d, i) => `<text x="${(i % cols) * CW + CW / 2}" y="${Math.floor(i / cols) * CH + CH - 6}" text-anchor="middle" font-size="15" font-family="Segoe UI" fill="#333">${d.name}</text>`).join('')}
    </svg>`
  )
  const composites: sharp.OverlayOptions[] = []
  for (let i = 0; i < done.length; i++) {
    const d = done[i]
    const scale = Math.min((CW - 12) / d.w, (CH - 34) / d.h, 1)
    const rw = Math.max(1, Math.round(d.w * scale))
    const rh = Math.max(1, Math.round(d.h * scale))
    composites.push({
      input: await sharp(d.buf).resize(rw, rh).toBuffer(),
      left: (i % cols) * CW + Math.floor((CW - rw) / 2),
      top: Math.floor(i / cols) * CH + Math.floor((CH - 30 - rh) / 2)
    })
  }
  await sharp(checker).composite(composites).png().toFile(resolve(contactOut))
  console.log(`contact sheet: ${contactOut}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
