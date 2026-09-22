/**
 * BEARi frame-animation builder.
 *
 * Turns hand-generated animation sheets (reference/anim/<clip>.png - one row of
 * evenly spaced frames per action) into per-clip sprite strips plus a manifest.
 *
 * Why frames: a drawn frame is a whole picture. Nothing is cut into layers, so
 * there is no seam, no gap and no ghost outline when she moves - the thing that
 * every rigged/cut-out approach kept producing. Smoothness comes from timing
 * and from whole-image secondary motion at runtime, never from blending two
 * different drawings on top of each other.
 *
 * Pipeline per sheet:
 *   1. paper-white background removal (border flood fill) + alpha matting so
 *      every silhouette keeps the soft edge the painting has
 *   2. connected components -> N frames (stray marks such as the zZz or the
 *      idea bulb are merged into the nearest figure, never dropped)
 *   3. per-sheet scale normalisation so she is exactly the same size in every
 *      clip, measured head-top to feet on the standing frames
 *   4. per-frame anchor: hips for X, one shared ground line for Y, so a jump
 *      really leaves the floor while everything else stays planted
 *   5. clip alignment: each clip's rest frame is fitted to the canonical rest
 *      frame by silhouette IoU, so cutting between clips never makes her pop
 *   6. pack each clip into one strip with a shared cell + anchor
 *
 * Outputs:
 *   src/renderer/public/frames/<clip>.webp
 *   src/renderer/src/character/frames/frames.json
 *   scratch/frames-index.png   (verification contact sheet)
 *
 * Usage: npx tsx scripts/build-frames.ts
 */
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import sharp from 'sharp'

// Single-threaded so the build is reproducible: parallel resampling can shift a
// rim pixel, which moves a median-derived anchor by a pixel between runs.
sharp.concurrency(1)

// ---------------------------------------------------------------- config

/** Normalised standing height (head top -> feet) in strip pixels. */
const STAND_H = 600
/** Transparent margin kept inside every cell. */
const PAD = 6
/** Components smaller than this are paint speckle, not art. */
const MIN_AREA = 150

type View = 'front' | 'side'

interface SheetCfg {
  id: string
  frames: number
  view: View
  /**
   * Frames whose feet legitimately leave the floor (a jump). Every other frame
   * is planted on the ground line individually, which removes the 15-50px of
   * drift the sheets have between a standing figure and a sitting one.
   */
  airborne?: number[]
}

/** `wave` is first on purpose: its frame 0 is the canonical rest pose. */
const SHEETS: SheetCfg[] = [
  { id: 'wave', frames: 6, view: 'front' },
  { id: 'think', frames: 4, view: 'front' },
  { id: 'coffee', frames: 6, view: 'front' },
  { id: 'read', frames: 6, view: 'front' },
  { id: 'celebrate', frames: 6, view: 'front', airborne: [2, 3] },
  { id: 'sleep', frames: 4, view: 'front' },
  { id: 'walk', frames: 8, view: 'side' }
]

interface Img {
  w: number
  h: number
  px: Uint8ClampedArray
}

const buf = (img: Img): Buffer => Buffer.from(img.px.buffer, img.px.byteOffset, img.px.byteLength)

// ---------------------------------------------------------------- matting

/** Remove the paper background and give the silhouette its real soft edge. */
async function matte(src: string): Promise<Img> {
  const { data, info } = await sharp(resolve(src)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  const n = w * h
  const px = new Uint8ClampedArray(data)
  const alpha = new Uint8Array(n)
  for (let i = 0; i < n; i++) alpha[i] = px[i * 4 + 3]

  // Only *paper* white floods. Her dupatta and leggings are painted white but
  // always carry shading, so they stay opaque.
  const isPaper = (p: number): boolean => px[p * 4] >= 246 && px[p * 4 + 1] >= 246 && px[p * 4 + 2] >= 246

  const seen = new Uint8Array(n)
  const stack = new Int32Array(n)
  let sp = 0
  const push = (p: number): void => {
    if (!seen[p]) {
      seen[p] = 1
      stack[sp++] = p
    }
  }
  for (let x = 0; x < w; x++) {
    push(x)
    push((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    push(y * w)
    push(y * w + w - 1)
  }
  while (sp > 0) {
    const p = stack[--sp]
    if (!isPaper(p)) continue
    alpha[p] = 0
    const x = p % w
    if (x > 0) push(p - 1)
    if (x < w - 1) push(p + 1)
    if (p >= w) push(p - w)
    if (p < n - w) push(p + w)
  }

  // ---- trapped paper.
  // A curl can close around a sliver of background that the border flood cannot
  // reach through its anti-aliased seal. Left opaque, that sliver shows up as a
  // bright white splinter on the user's wallpaper. Clear only pockets that are
  // small, paper-white and right at the silhouette rim, so painted whites (the
  // dupatta, her leggings, the highlights in her eyes) are never touched.
  {
    const POCKET_MAX = 1200
    const RIM = 4
    const dist = new Int32Array(n).fill(127)
    const q = new Int32Array(n)
    let qh = 0
    let qt = 0
    for (let i = 0; i < n; i++)
      if (!alpha[i]) {
        dist[i] = 0
        q[qt++] = i
      }
    while (qh < qt) {
      const p = q[qh++]
      const d = dist[p] + 1
      if (d > RIM + 1) continue
      const x = p % w
      if (x > 0 && dist[p - 1] > d) {
        dist[p - 1] = d
        q[qt++] = p - 1
      }
      if (x < w - 1 && dist[p + 1] > d) {
        dist[p + 1] = d
        q[qt++] = p + 1
      }
      if (p >= w && dist[p - w] > d) {
        dist[p - w] = d
        q[qt++] = p - w
      }
      if (p < n - w && dist[p + w] > d) {
        dist[p + w] = d
        q[qt++] = p + w
      }
    }
    const seenP = new Uint8Array(n)
    const stackP = new Int32Array(n)
    let cleared = 0
    for (let s0 = 0; s0 < n; s0++) {
      if (seenP[s0] || !alpha[s0] || !isPaper(s0)) continue
      let sp = 0
      let minD = 127
      const cells: number[] = []
      stackP[sp++] = s0
      seenP[s0] = 1
      while (sp > 0) {
        const p = stackP[--sp]
        cells.push(p)
        if (dist[p] < minD) minD = dist[p]
        const x = p % w
        if (x > 0 && !seenP[p - 1] && alpha[p - 1] && isPaper(p - 1)) {
          seenP[p - 1] = 1
          stackP[sp++] = p - 1
        }
        if (x < w - 1 && !seenP[p + 1] && alpha[p + 1] && isPaper(p + 1)) {
          seenP[p + 1] = 1
          stackP[sp++] = p + 1
        }
        if (p >= w && !seenP[p - w] && alpha[p - w] && isPaper(p - w)) {
          seenP[p - w] = 1
          stackP[sp++] = p - w
        }
        if (p < n - w && !seenP[p + w] && alpha[p + w] && isPaper(p + w)) {
          seenP[p + w] = 1
          stackP[sp++] = p + w
        }
      }
      if (cells.length <= POCKET_MAX && minD <= RIM) {
        for (const p of cells) alpha[p] = 0
        cleared += cells.length
      }
    }
    if (cleared) console.log(`      cleared ${cleared}px of trapped paper`)
  }

  // ---- alpha matting at the rim.
  // A hard fill leaves the painting's anti-aliased edge fully opaque, which
  // reads as a sticker cut out with scissors. Estimate the real coverage from
  // the neighbouring interior colour and un-premultiply back to paint colour.
  const nearBg = new Uint8Array(n)
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x
      if (!alpha[p]) continue
      if (!alpha[p - 1] || !alpha[p + 1] || !alpha[p - w] || !alpha[p + w]) nearBg[p] = 1
    }
  for (let r = 0; r < 2; r++) {
    const grow: number[] = []
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x
        if (!alpha[p] || nearBg[p]) continue
        if (nearBg[p - 1] === 1 || nearBg[p + 1] === 1 || nearBg[p - w] === 1 || nearBg[p + w] === 1) grow.push(p)
      }
    for (const p of grow) nearBg[p] = 1
  }
  const src0 = Uint8ClampedArray.from(px)
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x
      if (!nearBg[p]) continue
      let fg: number[] | null = null
      for (let rad = 1; rad <= 4 && !fg; rad++)
        for (let dy = -rad; dy <= rad && !fg; dy++)
          for (let dx = -rad; dx <= rad; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
            const qx = x + dx
            const qy = y + dy
            if (qx < 1 || qy < 1 || qx >= w - 1 || qy >= h - 1) continue
            const q = qy * w + qx
            if (!alpha[q] || nearBg[q]) continue
            fg = [src0[q * 4], src0[q * 4 + 1], src0[q * 4 + 2]]
            break
          }
      if (!fg) continue
      let bestDen = 0
      let a = 1
      for (let c = 0; c < 3; c++) {
        const den = 255 - fg[c]
        if (den > bestDen) {
          bestDen = den
          a = (255 - src0[p * 4 + c]) / den
        }
      }
      if (bestDen < 24) continue
      a = Math.max(0, Math.min(1, a))
      if (a < 0.03) {
        alpha[p] = 0
        continue
      }
      alpha[p] = Math.round(a * 255)
      for (let c = 0; c < 3; c++) px[p * 4 + c] = Math.max(0, Math.min(255, (src0[p * 4 + c] - 255 * (1 - a)) / a))
    }

  for (let i = 0; i < n; i++) px[i * 4 + 3] = alpha[i]
  return { w, h, px }
}

// ---------------------------------------------------------------- components

interface Comp {
  x0: number
  y0: number
  x1: number
  y1: number
  area: number
}

function label(img: Img): { lab: Int32Array; comps: Comp[] } {
  const { w, h, px } = img
  const n = w * h
  const lab = new Int32Array(n).fill(-1)
  const comps: Comp[] = []
  const stack = new Int32Array(n)
  for (let s = 0; s < n; s++) {
    if (lab[s] !== -1 || px[s * 4 + 3] === 0) continue
    const id = comps.length
    const c: Comp = { x0: w, y0: h, x1: 0, y1: 0, area: 0 }
    let sp = 0
    stack[sp++] = s
    lab[s] = id
    while (sp > 0) {
      const p = stack[--sp]
      const x = p % w
      const y = (p - x) / w
      c.area++
      if (x < c.x0) c.x0 = x
      if (x > c.x1) c.x1 = x
      if (y < c.y0) c.y0 = y
      if (y > c.y1) c.y1 = y
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const q = ny * w + nx
          if (lab[q] !== -1 || px[q * 4 + 3] === 0) continue
          lab[q] = id
          stack[sp++] = q
        }
    }
    comps.push(c)
  }
  return { lab, comps }
}

/** Drop speckle, then assign every remaining island to one of the N figures. */
function groupFrames(img: Img, count: number): { lists: Int32Array[] } {
  const { w, h, px } = img
  const { lab, comps } = label(img)
  const keep = comps.map((c, i) => ({ i, c })).filter((o) => o.c.area >= MIN_AREA)
  if (keep.length < count) throw new Error(`only ${keep.length} islands for ${count} frames`)
  const seeds = [...keep]
    .sort((a, b) => b.c.area - a.c.area)
    .slice(0, count)
    .sort((a, b) => a.c.x0 + a.c.x1 - (b.c.x0 + b.c.x1))
  const compFrame = new Int32Array(comps.length).fill(-1)
  seeds.forEach((s, k) => {
    compFrame[s.i] = k
  })
  for (const o of keep) {
    if (compFrame[o.i] !== -1) continue
    const cx = (o.c.x0 + o.c.x1) / 2
    let best = 0
    let bd = Infinity
    seeds.forEach((s, k) => {
      const d = cx < s.c.x0 ? s.c.x0 - cx : cx > s.c.x1 ? cx - s.c.x1 : 0
      if (d < bd) {
        bd = d
        best = k
      }
    })
    compFrame[o.i] = best
  }
  const n = w * h
  const frameOf = new Int32Array(n).fill(-1)
  const counts = new Int32Array(count)
  for (let p = 0; p < n; p++) {
    const l = lab[p]
    if (l < 0) continue
    const f = compFrame[l]
    if (f < 0) {
      px[p * 4 + 3] = 0 // speckle
      continue
    }
    frameOf[p] = f
    counts[f]++
  }
  const lists = Array.from({ length: count }, (_, k) => new Int32Array(counts[k]))
  const fill = new Int32Array(count)
  for (let p = 0; p < n; p++) {
    const f = frameOf[p]
    if (f >= 0) lists[f][fill[f]++] = p
  }
  return { lists }
}

// ---------------------------------------------------------------- metrics

interface Metric {
  x0: number
  y0: number
  x1: number
  y1: number
  /** Top of the head mass - ignores a thin raised hand above her. */
  headTop: number
  feetY: number
  figH: number
  /** Stable horizontal anchor: median X across the hip band. */
  hipX: number
  headW: number
}

function measure(img: Img, list: Int32Array): Metric {
  const { w } = img
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of list) {
    const x = p % w
    const y = (p - x) / w
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  const rows = new Int32Array(y1 - y0 + 1)
  const rowMin = new Int32Array(y1 - y0 + 1).fill(1 << 28)
  const rowMax = new Int32Array(y1 - y0 + 1).fill(-1)
  for (const p of list) {
    const x = p % w
    const y = (p - x) / w
    const r = y - y0
    rows[r]++
    if (x < rowMin[r]) rowMin[r] = x
    if (x > rowMax[r]) rowMax[r] = x
  }
  let maxRow = 0
  for (const v of rows) if (v > maxRow) maxRow = v
  let headTop = y0
  for (let r = 0; r < rows.length; r++)
    if (rows[r] >= 0.28 * maxRow) {
      headTop = y0 + r
      break
    }
  const feetY = y1
  const figH = feetY - headTop
  let headW = 0
  for (let r = headTop - y0; r < Math.min(rows.length, headTop - y0 + figH * 0.34); r++)
    if (rowMax[r] >= rowMin[r]) headW = Math.max(headW, rowMax[r] - rowMin[r])
  const hb0 = headTop + figH * 0.45
  const hb1 = headTop + figH * 0.8
  const xs: number[] = []
  for (const p of list) {
    const x = p % w
    const y = (p - x) / w
    if (y >= hb0 && y <= hb1) xs.push(x)
  }
  xs.sort((a, b) => a - b)
  const hipX = xs.length ? xs[xs.length >> 1] : (x0 + x1) / 2
  return { x0, y0, x1, y1, headTop, feetY, figH, hipX, headW }
}

const median = (v: number[]): number => {
  if (!v.length) throw new Error('median of an empty set - is every frame of a sheet marked airborne?')
  const s = [...v].sort((a, b) => a - b)
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

async function resizeImg(img: Img, scale: number): Promise<Img> {
  const w2 = Math.max(1, Math.round(img.w * scale))
  const h2 = Math.max(1, Math.round(img.h * scale))
  const { data, info } = await sharp(buf(img), { raw: { width: img.w, height: img.h, channels: 4 } })
    .resize(w2, h2, { kernel: 'lanczos3', fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const px = new Uint8ClampedArray(data)
  for (let i = 0; i < w2 * h2; i++) if (px[i * 4 + 3] < 3) px[i * 4 + 3] = 0
  return { w: info.width, h: info.height, px }
}

// ---------------------------------------------------------------- alignment

const GX0 = -340
const GX1 = 340
const GY0 = -760
const GY1 = 120

interface Grid {
  g: Uint8Array
  gw: number
  gh: number
}

/** Silhouette grid in anchor space, at 1/`gs` resolution. */
function anchorGrid(img: Img, list: Int32Array, ax: number, ay: number, gs: number): Grid {
  const gw = Math.ceil((GX1 - GX0) / gs)
  const gh = Math.ceil((GY1 - GY0) / gs)
  const g = new Uint8Array(gw * gh)
  const { w, px } = img
  for (const p of list) {
    if (px[p * 4 + 3] < 40) continue
    const x = p % w
    const y = (p - x) / w
    const gx = Math.floor((x - ax - GX0) / gs)
    const gy = Math.floor((y - ay - GY0) / gs)
    if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue
    g[gy * gw + gx] = 1
  }
  return { g, gw, gh }
}

function bestShift(ref: Grid, cur: Grid, rangeX: number, rangeY: number): { dx: number; dy: number; iou: number } {
  const { gw, gh } = ref
  let best = { dx: 0, dy: 0, iou: -1 }
  for (let dy = -rangeY; dy <= rangeY; dy++)
    for (let dx = -rangeX; dx <= rangeX; dx++) {
      let inter = 0
      let uni = 0
      for (let y = 0; y < gh; y++) {
        const sy = y + dy
        const rowR = y * gw
        const rowC = sy * gw
        for (let x = 0; x < gw; x++) {
          const r = ref.g[rowR + x]
          const sx = x + dx
          const c = sy < 0 || sy >= gh || sx < 0 || sx >= gw ? 0 : cur.g[rowC + sx]
          if (r | c) uni++
          if (r & c) inter++
        }
      }
      const iou = uni ? inter / uni : 0
      if (iou > best.iou) best = { dx, dy, iou }
    }
  return best
}

// ---------------------------------------------------------------- build

interface BuiltFrame {
  metric: Metric
  list: Int32Array
}

/** A sheet read at its own resolution, before any normalisation. */
interface Native {
  cfg: SheetCfg
  img0: Img
  lists0: Int32Array[]
  m0: Metric[]
  /** Scale that makes her standing height match STAND_H. */
  heightScale: number
}

interface BuiltClip {
  cfg: SheetCfg
  img: Img
  frames: BuiltFrame[]
  scale: number
  /** Per-frame vertical anchor: the floor under her in that frame. */
  ays: number[]
  dx: number
  dy: number
}

async function loadNative(cfg: SheetCfg): Promise<Native> {
  const img0 = await matte(`reference/anim/${cfg.id}.png`)
  const { lists } = groupFrames(img0, cfg.frames)
  const m0 = lists.map((l) => measure(img0, l))
  const maxFig = Math.max(...m0.map((m) => m.figH))
  const standing = m0.filter((m) => m.figH >= 0.92 * maxFig).map((m) => m.figH)
  return { cfg, img0, lists0: lists, m0, heightScale: STAND_H / median(standing) }
}

/** Silhouette grid of one frame, scaled about its anchor, at 1/`gs` resolution. */
function scaledGrid(img: Img, list: Int32Array, ax: number, ay: number, scale: number, gs: number): Grid {
  const gw = Math.ceil((GX1 - GX0) / gs)
  const gh = Math.ceil((GY1 - GY0) / gs)
  const g = new Uint8Array(gw * gh)
  const { w, px } = img
  for (const p of list) {
    if (px[p * 4 + 3] < 40) continue
    const x = p % w
    const y = (p - x) / w
    const gx = Math.floor(((x - ax) * scale - GX0) / gs)
    const gy = Math.floor(((y - ay) * scale - GY0) / gs)
    if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue
    g[gy * gw + gx] = 1
  }
  return { g, gw, gh }
}

/**
 * Fit this sheet's rest frame onto the canonical rest frame by scale and shift.
 * Normalising standing height alone still leaves her head a few percent
 * different between sheets, because each sheet was drawn independently; fitting
 * the whole silhouette removes the size pop when one clip cuts to the next.
 */
function fitScale(ref: Grid, n: Native): { k: number; iou: number } {
  const list = n.lists0[0]
  const ax = n.m0[0].hipX
  const ay = n.m0[0].feetY
  let best = { k: 1, iou: -1 }
  const trial = (k: number): void => {
    const g = scaledGrid(n.img0, list, ax, ay, n.heightScale * k, 4)
    const s = bestShift(ref, g, 8, 0)
    if (s.iou > best.iou) best = { k, iou: s.iou }
  }
  // Deliberately narrow: her standing height must not visibly change when one
  // clip cuts to the next, so the fit only trims drift, it never rescales her.
  for (let k = 0.98; k <= 1.0201; k += 0.005) trial(Number(k.toFixed(4)))
  const around = best.k
  for (let k = around - 0.004; k <= around + 0.0041; k += 0.002) trial(Number(k.toFixed(4)))
  return best
}

async function buildClip(n: Native, scale: number): Promise<BuiltClip> {
  const img = await resizeImg(n.img0, scale)
  const { lists } = groupFrames(img, n.cfg.frames)
  const frames = lists.map((list) => ({ list, metric: measure(img, list) }))

  const maxFig = Math.max(...frames.map((f) => f.metric.figH))
  const maxFeet = Math.max(...frames.map((f) => f.metric.feetY))
  const air = new Set(n.cfg.airborne ?? [])
  const grounded = frames
    .map((f, i) => ({ f, i }))
    .filter((o) => !air.has(o.i) && o.f.metric.feetY >= maxFeet - 0.05 * maxFig)
    .map((o) => o.f.metric.feetY)
  const groundY = median(grounded)
  // A planted frame stands on its own lowest pixel; an airborne frame keeps the
  // height the artwork gave it above the sheet's shared floor.
  const ays = frames.map((f, i) => (air.has(i) ? groundY : f.metric.feetY))

  console.log(
    `  ${n.cfg.id.padEnd(10)} scale ${scale.toFixed(4)}  figH [${frames.map((f) => f.metric.figH).join(',')}]  ` +
      `lift [${frames.map((f, i) => Math.round(ays[i] - f.metric.feetY)).join(',')}]`
  )
  return { cfg: n.cfg, img, frames, scale, ays, dx: 0, dy: 0 }
}

async function main(): Promise<void> {
  mkdirSync(resolve('scratch'), { recursive: true })
  mkdirSync(resolve('src/renderer/public/frames'), { recursive: true })
  mkdirSync(resolve('src/renderer/src/character/frames'), { recursive: true })

  console.log('reading sheets...')
  const natives: Native[] = []
  for (const cfg of SHEETS) {
    const n = await loadNative(cfg)
    natives.push(n)
    console.log(`  ${cfg.id.padEnd(10)} ${n.cfg.frames} frames  heightScale ${n.heightScale.toFixed(4)}`)
  }

  // The first sheet's frame 0 is the canonical rest pose everything matches.
  const refN = natives[0]
  const refGrid = scaledGrid(refN.img0, refN.lists0[0], refN.m0[0].hipX, refN.m0[0].feetY, refN.heightScale, 4)

  console.log('fitting each sheet to the canonical rest pose...')
  const scales = natives.map((n) => {
    if (n === refN) return n.heightScale
    if (n.cfg.view === 'side') {
      console.log(`  ${n.cfg.id.padEnd(10)} side view - height normalisation only`)
      return n.heightScale
    }
    const fit = fitScale(refGrid, n)
    console.log(`  ${n.cfg.id.padEnd(10)} size x${fit.k.toFixed(4)}  IoU ${fit.iou.toFixed(4)}`)
    return n.heightScale * fit.k
  })

  console.log('normalising and grounding...')
  const clips: BuiltClip[] = []
  for (let i = 0; i < natives.length; i++) clips.push(await buildClip(natives[i], scales[i]))

  // ---- final 1px alignment of every rest frame to the canonical one
  const ref = clips[0]
  const refFine = anchorGrid(ref.img, ref.frames[0].list, ref.frames[0].metric.hipX, ref.ays[0], 1)
  console.log('aligning...')
  for (const c of clips) {
    if (c === ref || c.cfg.view === 'side') continue
    const f0 = c.frames[0]
    const fit = bestShift(refFine, anchorGrid(c.img, f0.list, f0.metric.hipX, c.ays[0], 1), 14, 0)
    c.dx = fit.dx
    c.dy = fit.dy
    console.log(`  ${c.cfg.id.padEnd(10)} shift ${c.dx},${c.dy}  IoU ${fit.iou.toFixed(4)}`)
  }

  // ---- alignment proof sheet: canonical rest silhouette in yellow, this clip's
  // rest silhouette in cyan, overlap in green. Residual offset shows as fringe.
  {
    const OW = 340
    const OH = 700
    const tiles: { input: Buffer; left: number; top: number }[] = []
    const stamp = (out: Uint8ClampedArray, c: BuiltClip, ax: number, ay: number, ch: number): void => {
      for (const p of c.frames[0].list) {
        if (c.img.px[p * 4 + 3] < 40) continue
        const x = p % c.img.w
        const y = (p - x) / c.img.w
        const dx = Math.round(x - ax) + OW / 2
        const dy = Math.round(y - ay) + OH - 40
        if (dx < 0 || dy < 0 || dx >= OW || dy >= OH) continue
        const d = (dy * OW + dx) * 4
        out[d + ch] = 200
        out[d + 3] = 255
      }
    }
    for (const c of clips) {
      const out = new Uint8ClampedArray(OW * OH * 4).fill(255)
      stamp(out, ref, ref.frames[0].metric.hipX, ref.ays[0], 2)
      stamp(out, c, c.frames[0].metric.hipX + c.dx, c.ays[0] + c.dy, 0)
      const lbl = Buffer.from(
        `<svg width="${OW}" height="${OH}"><text x="8" y="22" font-family="Arial" font-size="18" fill="#222">${c.cfg.id}</text></svg>`
      )
      tiles.push({
        input: await sharp(Buffer.from(out.buffer, out.byteOffset, out.byteLength), {
          raw: { width: OW, height: OH, channels: 4 }
        })
          .composite([{ input: lbl, left: 0, top: 0 }])
          .png()
          .toBuffer(),
        left: tiles.length * OW,
        top: 0
      })
    }
    await sharp({
      create: { width: OW * clips.length, height: OH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
    })
      .composite(tiles)
      .png()
      .toFile(resolve('scratch/frames-align.png'))
  }

  // ---- pack each clip into a strip
  interface ClipOut {
    file: string
    view: View
    count: number
    cellW: number
    cellH: number
    anchorX: number
    anchorY: number
    /** Per frame: how far above the floor the artwork puts her feet (a jump). */
    lifts: number[]
    /** Per frame: head-top to feet, so a cut can be weighted by how much she drops or rises. */
    heights: number[]
  }
  const manifest: Record<string, ClipOut> = {}
  const indexTiles: { input: Buffer; left: number; top: number }[] = []
  let indexY = 0
  let indexW = 0

  console.log('packing...')
  for (const c of clips) {
    const anchors = c.frames.map((f, i) => ({ ax: f.metric.hipX + c.dx, ay: c.ays[i] + c.dy }))
    let L = 0
    let R = 0
    let U = 0
    let D = 0
    c.frames.forEach((f, i) => {
      L = Math.max(L, anchors[i].ax - f.metric.x0)
      R = Math.max(R, f.metric.x1 - anchors[i].ax)
      U = Math.max(U, anchors[i].ay - f.metric.y0)
      D = Math.max(D, f.metric.y1 - anchors[i].ay)
    })
    L = Math.ceil(L) + PAD
    R = Math.ceil(R) + PAD
    U = Math.ceil(U) + PAD
    D = Math.ceil(D) + PAD
    const cellW = L + R
    const cellH = U + D
    const stripW = cellW * c.frames.length
    const strip = new Uint8ClampedArray(stripW * cellH * 4)
    c.frames.forEach((f, i) => {
      const ox = i * cellW + L - Math.round(anchors[i].ax)
      const oy = U - Math.round(anchors[i].ay)
      for (const p of f.list) {
        const x = p % c.img.w
        const y = (p - x) / c.img.w
        const dx = x + ox
        const dy = y + oy
        if (dx < 0 || dy < 0 || dx >= stripW || dy >= cellH) continue
        const s = p * 4
        const d = (dy * stripW + dx) * 4
        strip[d] = c.img.px[s]
        strip[d + 1] = c.img.px[s + 1]
        strip[d + 2] = c.img.px[s + 2]
        strip[d + 3] = c.img.px[s + 3]
      }
    })
    const file = `${c.cfg.id}.webp`
    const rawStrip = Buffer.from(strip.buffer, strip.byteOffset, strip.byteLength)
    await sharp(rawStrip, { raw: { width: stripW, height: cellH, channels: 4 } })
      .webp({ quality: 94, alphaQuality: 100, effort: 6 })
      .toFile(resolve('src/renderer/public/frames', file))
    manifest[c.cfg.id] = {
      file: `./frames/${file}`,
      view: c.cfg.view,
      count: c.frames.length,
      cellW,
      cellH,
      anchorX: L,
      anchorY: U,
      lifts: c.frames.map((f, i) => Math.round(anchors[i].ay - f.metric.feetY)),
      heights: c.frames.map((f) => f.metric.figH)
    }
    console.log(`  ${c.cfg.id.padEnd(10)} ${c.frames.length} x ${cellW} x ${cellH}  anchor ${L},${U}`)

    const tileScale = 0.32
    const tw = Math.round(stripW * tileScale)
    const th = Math.round(cellH * tileScale)
    const marks = c.frames
      .map((_, i) => {
        const ax = (i * cellW + L) * tileScale
        const ay = U * tileScale
        return (
          `<line x1="${ax}" y1="0" x2="${ax}" y2="${th}" stroke="#e03080" stroke-opacity="0.5" stroke-width="1"/>` +
          `<line x1="${i * cellW * tileScale}" y1="${ay}" x2="${(i + 1) * cellW * tileScale}" y2="${ay}" stroke="#2080e0" stroke-opacity="0.5" stroke-width="1"/>` +
          `<text x="${i * cellW * tileScale + 4}" y="14" font-family="Arial" font-size="12" fill="#333">${c.cfg.id} ${i}</text>`
        )
      })
      .join('')
    const tile = await sharp(rawStrip, { raw: { width: stripW, height: cellH, channels: 4 } })
      .resize(tw, th)
      .composite([{ input: Buffer.from(`<svg width="${tw}" height="${th}">${marks}</svg>`), left: 0, top: 0 }])
      .png()
      .toBuffer()
    indexTiles.push({ input: tile, left: 0, top: indexY })
    indexY += th + 6
    indexW = Math.max(indexW, tw)
  }

  await sharp({
    create: { width: indexW, height: indexY, channels: 4, background: { r: 240, g: 236, b: 248, alpha: 1 } }
  })
    .composite(indexTiles)
    .png()
    .toFile(resolve('scratch/frames-index.png'))

  // A poster of her canonical rest frame, for the dashboard.
  {
    const rest = manifest[SHEETS[0].id]
    const cell = await sharp(resolve('src/renderer/public/frames', `${SHEETS[0].id}.webp`))
      .extract({ left: 0, top: 0, width: rest.cellW, height: rest.cellH })
      .png()
      .toBuffer()
    await sharp(cell)
      .trim({ threshold: 1 })
      .resize({ height: 320 })
      .webp({ quality: 92, alphaQuality: 100 })
      .toFile(resolve('src/renderer/public/frames/poster.webp'))
    console.log('  poster.webp')
  }

  writeFileSync(
    resolve('src/renderer/src/character/frames/frames.json'),
    JSON.stringify({ standH: STAND_H, clips: manifest }, null, 2)
  )
  console.log('\nwrote src/renderer/src/character/frames/frames.json')
  console.log('verify: scratch/frames-index.png, scratch/frames-align.png')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
