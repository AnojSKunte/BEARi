/**
 * Outfit rig builder — cuts each outfit figure on reference/outfits/*.png
 * into an articulated set of painted pieces (hair, head, torso, upper/lower
 * arms, thighs, calves+shoes) and emits performer-space geometry so
 * Beari.tsx can animate it exactly like the kurta rig.
 *
 * Every figure must be front view, arms hanging clear of the body, legs
 * slightly apart, on a white background (that is why the prompt asked for
 * it). Pieces are assigned by priority: arms → legs → head → torso → hair.
 *
 * Outputs src/renderer/public/rig/outfits/<style>/*.png and
 * src/renderer/src/character/rig-outfits.json, plus a validation composite
 * when an output path is given.
 *
 * Usage: npx tsx scripts/build-outfits.ts [validateOut]
 */
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import sharp from 'sharp'

type Poly = [number, number][]
interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}
interface Pt {
  x: number
  y: number
}

interface ArmCfg {
  shoulder: Pt
  elbow: Pt
  hand: Pt
  upper: Rect
  lower: Rect
  /** lower piece = only skin-coloured pixels (bare forearm + hand) */
  lowerSkin?: boolean
}
interface LegCfg {
  hip: Pt
  knee: Pt
  thigh: Rect
  calf: Rect
}
interface OutfitConfig {
  style: string
  sheet: string
  headTop: number
  feetY: number
  centerX: number
  head: Poly
  torso: Poly
  arms: { L: ArmCfg; R: ArmCfg }
  legs: { L: LegCfg; R: LegCfg }
  face: { eyeL: Pt; eyeR: Pt; mouth: Pt; blushL: Pt; blushR: Pt; eyeRx: number; eyeRy: number }
  hairPivot: Pt
  /** Only dark pixels inside this box count as her hair (keeps neighbours out). */
  hairBox: Rect
}

const SHEET = 'reference/outfits/outfits-sheet.png'

const OUTFITS: OutfitConfig[] = [
  {
    style: 'frock',
    sheet: SHEET,
    headTop: 15,
    feetY: 800,
    centerX: 512,
    head: [[428, 15], [602, 15], [620, 90], [616, 190], [598, 255], [566, 274], [456, 274], [426, 255], [410, 190], [406, 90]],
    torso: [[458, 268], [568, 268], [578, 300], [576, 372], [598, 415], [662, 602], [368, 602], [432, 415], [455, 372]],
    arms: {
      L: {
        shoulder: { x: 452, y: 306 },
        elbow: { x: 400, y: 418 },
        hand: { x: 386, y: 490 },
        upper: { x0: 364, y0: 282, x1: 458, y1: 422 },
        lower: { x0: 356, y0: 416, x1: 418, y1: 516 },
        lowerSkin: true
      },
      R: {
        shoulder: { x: 578, y: 306 },
        elbow: { x: 628, y: 418 },
        hand: { x: 642, y: 490 },
        upper: { x0: 570, y0: 282, x1: 662, y1: 422 },
        lower: { x0: 612, y0: 416, x1: 672, y1: 516 },
        lowerSkin: true
      }
    },
    legs: {
      L: { hip: { x: 470, y: 606 }, knee: { x: 470, y: 692 }, thigh: { x0: 436, y0: 588, x1: 506, y1: 698 }, calf: { x0: 418, y0: 688, x1: 508, y1: 808 } },
      R: { hip: { x: 546, y: 606 }, knee: { x: 546, y: 692 }, thigh: { x0: 508, y0: 588, x1: 582, y1: 698 }, calf: { x0: 508, y0: 688, x1: 600, y1: 808 } }
    },
    face: { eyeL: { x: 470, y: 182 }, eyeR: { x: 553, y: 182 }, mouth: { x: 511, y: 233 }, blushL: { x: 446, y: 214 }, blushR: { x: 578, y: 214 }, eyeRx: 30, eyeRy: 33 },
    hairPivot: { x: 512, y: 60 },
    hairBox: { x0: 345, y0: 10, x1: 680, y1: 400 }
  },
  {
    style: 'croptop',
    sheet: SHEET,
    headTop: 690,
    feetY: 1485,
    centerX: 262,
    head: [[168, 690], [356, 690], [374, 780], [370, 880], [352, 930], [312, 948], [210, 948], [170, 930], [150, 880], [146, 780]],
    torso: [[214, 946], [310, 946], [354, 960], [356, 1090], [350, 1198], [180, 1198], [176, 1090], [178, 960]],
    arms: {
      L: {
        shoulder: { x: 214, y: 976 },
        elbow: { x: 168, y: 1090 },
        hand: { x: 140, y: 1170 },
        upper: { x0: 118, y0: 952, x1: 222, y1: 1094 },
        lower: { x0: 104, y0: 1086, x1: 186, y1: 1204 },
        lowerSkin: true
      },
      R: {
        shoulder: { x: 318, y: 976 },
        elbow: { x: 362, y: 1090 },
        hand: { x: 386, y: 1170 },
        upper: { x0: 310, y0: 952, x1: 410, y1: 1094 },
        lower: { x0: 348, y0: 1086, x1: 428, y1: 1204 },
        lowerSkin: true
      }
    },
    legs: {
      L: { hip: { x: 222, y: 1194 }, knee: { x: 222, y: 1302 }, thigh: { x0: 176, y0: 1190, x1: 264, y1: 1308 }, calf: { x0: 152, y0: 1298, x1: 264, y1: 1492 } },
      R: { hip: { x: 308, y: 1194 }, knee: { x: 308, y: 1302 }, thigh: { x0: 266, y0: 1190, x1: 354, y1: 1308 }, calf: { x0: 266, y0: 1298, x1: 376, y1: 1492 } }
    },
    face: { eyeL: { x: 220, y: 853 }, eyeR: { x: 302, y: 853 }, mouth: { x: 261, y: 905 }, blushL: { x: 194, y: 886 }, blushR: { x: 330, y: 886 }, eyeRx: 30, eyeRy: 33 },
    hairPivot: { x: 262, y: 735 },
    hairBox: { x0: 100, y0: 685, x1: 418, y1: 1075 }
  },
  {
    style: 'hoodie',
    sheet: SHEET,
    headTop: 690,
    feetY: 1492,
    centerX: 780,
    head: [[693, 690], [878, 690], [898, 780], [896, 880], [876, 935], [830, 950], [730, 950], [686, 935], [666, 880], [664, 780]],
    torso: [[700, 936], [828, 930], [880, 962], [884, 1230], [692, 1230], [688, 962]],
    arms: {
      L: {
        shoulder: { x: 700, y: 1000 },
        elbow: { x: 668, y: 1096 },
        hand: { x: 660, y: 1188 },
        upper: { x0: 628, y0: 982, x1: 704, y1: 1100 },
        lower: { x0: 614, y0: 1092, x1: 704, y1: 1210 }
      },
      R: {
        shoulder: { x: 872, y: 1000 },
        elbow: { x: 902, y: 1096 },
        hand: { x: 908, y: 1188 },
        upper: { x0: 866, y0: 982, x1: 944, y1: 1100 },
        lower: { x0: 866, y0: 1092, x1: 952, y1: 1210 }
      }
    },
    legs: {
      L: { hip: { x: 736, y: 1228 }, knee: { x: 736, y: 1322 }, thigh: { x0: 692, y0: 1222, x1: 778, y1: 1328 }, calf: { x0: 684, y0: 1318, x1: 778, y1: 1500 } },
      R: { hip: { x: 822, y: 1228 }, knee: { x: 822, y: 1322 }, thigh: { x0: 780, y0: 1222, x1: 866, y1: 1328 }, calf: { x0: 780, y0: 1318, x1: 876, y1: 1500 } }
    },
    face: { eyeL: { x: 739, y: 853 }, eyeR: { x: 820, y: 853 }, mouth: { x: 779, y: 905 }, blushL: { x: 712, y: 886 }, blushR: { x: 848, y: 886 }, eyeRx: 30, eyeRy: 33 },
    hairPivot: { x: 780, y: 735 },
    hairBox: { x0: 618, y0: 685, x1: 945, y1: 1085 }
  }
]

/** On-screen height (head top → floor) shared with the kurta rig. */
const FIGURE_H = 235.4
const FLOOR_Y = 244
const CENTER_X = 110
const OUT_ROOT = resolve('src/renderer/public/rig/outfits')

const NAMES = [
  'armL-upper',
  'armL-lower',
  'armR-upper',
  'armR-lower',
  'legL-thigh',
  'legL-calf',
  'legR-thigh',
  'legR-calf',
  'head',
  'torso',
  'hair',
  'hair-low'
] as const
const HEAD = 8
const TORSO = 9
const HAIR = 10
const HAIR_LOW = 11

function inPoly(poly: Poly, x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
const inRect = (r: Rect, x: number, y: number): boolean => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1

interface PieceOut {
  file: string
  x: number
  y: number
  w: number
  h: number
}

async function build(cfg: OutfitConfig, validate: boolean): Promise<{ manifest: object; preview?: Buffer }> {
  const { data, info } = await sharp(resolve(cfg.sheet)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  const idx = (x: number, y: number): number => (y * W + x) * 4

  const rects = [
    cfg.arms.L.upper,
    cfg.arms.L.lower,
    cfg.arms.R.upper,
    cfg.arms.R.lower,
    cfg.legs.L.thigh,
    cfg.legs.L.calf,
    cfg.legs.R.thigh,
    cfg.legs.R.calf
  ]
  const pts = [...cfg.head, ...cfg.torso]
  const cx0 = Math.max(0, Math.min(...pts.map((p) => p[0]), ...rects.map((r) => r.x0)) - 60)
  const cx1 = Math.min(W - 1, Math.max(...pts.map((p) => p[0]), ...rects.map((r) => r.x1)) + 60)
  const cy0 = Math.max(0, cfg.headTop - 10)
  const cy1 = Math.min(H - 1, cfg.feetY + 12)

  // ---- background removal: flood-fill near-white from the cell border
  const alpha = new Uint8Array(W * H)
  for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) alpha[y * W + x] = data[idx(x, y) + 3]
  const isWhite = (i: number): boolean => data[i] > 236 && data[i + 1] > 236 && data[i + 2] > 236
  const visited = new Uint8Array(W * H)
  const stack: number[] = []
  for (let x = cx0; x <= cx1; x++) stack.push(x, cy0, x, cy1)
  for (let y = cy0; y <= cy1; y++) stack.push(cx0, y, cx1, y)
  while (stack.length) {
    const y = stack.pop()!
    const x = stack.pop()!
    if (x < cx0 || y < cy0 || x > cx1 || y > cy1) continue
    const p = y * W + x
    if (visited[p]) continue
    visited[p] = 1
    if (!isWhite(p * 4)) continue
    alpha[p] = 0
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1)
  }
  // soften the silhouette edge
  const edge: number[] = []
  for (let y = cy0 + 1; y < cy1; y++)
    for (let x = cx0 + 1; x < cx1; x++) {
      const p = y * W + x
      if (alpha[p] === 0) continue
      if (alpha[p - 1] === 0 || alpha[p + 1] === 0 || alpha[p - W] === 0 || alpha[p + W] === 0) edge.push(p)
    }
  for (const p of edge) alpha[p] = Math.min(alpha[p], 170)

  const isSkin = (i: number): boolean => {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    return r > 170 && g > 105 && b > 70 && r > g + 18 && r - b > 40
  }
  const isHair = (i: number): boolean => {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    return r < 120 && g < 105 && b < 110 && b <= r + 14
  }
  const nearSkin = (x: number, y: number): boolean => {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx
        const yy = y + dy
        if (xx < cx0 || yy < cy0 || xx > cx1 || yy > cy1) continue
        if (alpha[yy * W + xx] > 0 && isSkin(idx(xx, yy))) return true
      }
    return false
  }

  // ---- claim map
  const claim = new Int8Array(W * H).fill(-1)
  const armRects: [number, Rect, boolean][] = [
    [0, cfg.arms.L.upper, false],
    [1, cfg.arms.L.lower, !!cfg.arms.L.lowerSkin],
    [2, cfg.arms.R.upper, false],
    [3, cfg.arms.R.lower, !!cfg.arms.R.lowerSkin]
  ]
  const legRects: [number, Rect][] = [
    [4, cfg.legs.L.thigh],
    [5, cfg.legs.L.calf],
    [6, cfg.legs.R.thigh],
    [7, cfg.legs.R.calf]
  ]
  for (let y = cy0; y <= cy1; y++) {
    for (let x = cx0; x <= cx1; x++) {
      const p = y * W + x
      if (alpha[p] === 0) continue
      const i = p * 4
      const inTorso = inPoly(cfg.torso, x, y)
      let c = -1
      const hairPx = isHair(i) && inRect(cfg.hairBox, x, y)
      for (const [id, r, skinOnly] of armRects) {
        if (!inRect(r, x, y) || hairPx) continue
        if (skinOnly) {
          if (!(isSkin(i) || nearSkin(x, y))) continue
        } else if (inTorso) continue
        if (skinOnly && inTorso && !isSkin(i)) continue
        c = id
        break
      }
      if (c < 0)
        for (const [id, r] of legRects)
          if (inRect(r, x, y) && !inTorso && !hairPx) {
            c = id
            break
          }
      if (c < 0 && inPoly(cfg.head, x, y)) c = HEAD
      if (c < 0 && inTorso) c = TORSO
      if (c < 0 && isHair(i) && inRect(cfg.hairBox, x, y)) c = HAIR
      claim[p] = c
    }
  }

  // ---- hair extension under the head / shoulders (head motion never gaps)
  const fill = new Map<number, number>()
  const torsoTop = Math.min(...cfg.torso.map((p) => p[1]))
  for (let y = cfg.headTop + 20; y < torsoTop + 60 && y <= cy1; y++) {
    let left = -1
    let right = -1
    for (let x = cx0; x < cfg.centerX; x++) if (claim[y * W + x] === HAIR) left = x
    for (let x = cx1; x > cfg.centerX; x--) if (claim[y * W + x] === HAIR) right = x
    for (const [edgeX, step] of [
      [left, 1],
      [right, -1]
    ] as [number, number][]) {
      if (edgeX < 0) continue
      const src = idx(edgeX, y)
      for (let k = 1; k <= 24; k++) {
        const xx = edgeX + step * k
        const p = y * W + xx
        // only behind the head (which moves with the hair) — never under the
        // torso, or the fill peeks out when the hair sways
        if (claim[p] === HEAD) fill.set(p, src)
        else break
      }
    }
  }

  // Hair below the chin rests on the shoulders: it stays with the body
  // instead of travelling with the head, so head motion never drags it out
  // from under the collar.
  const chinY = Math.max(...cfg.head.map((p) => p[1]))
  for (let y = chinY + 6; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) if (claim[y * W + x] === HAIR) claim[y * W + x] = HAIR_LOW

  // ---- write pieces
  const s = FIGURE_H / (cfg.feetY - cfg.headTop)
  const toP = (pt: Pt): Pt => ({
    x: +(CENTER_X + (pt.x - cfg.centerX) * s).toFixed(2),
    y: +(FLOOR_Y + (pt.y - cfg.feetY) * s).toFixed(2)
  })
  const dir = resolve(OUT_ROOT, cfg.style)
  mkdirSync(dir, { recursive: true })
  const pieces: Record<string, PieceOut> = {}
  // Pieces overlap their neighbours by 2px so resampling at cut edges never
  // shows a hairline seam.
  const OVER = 2
  const near = (p: number, id: number): boolean => {
    const x = p % W
    const y = (p - x) / W
    for (let dy = -OVER; dy <= OVER; dy++)
      for (let dx = -OVER; dx <= OVER; dx++) {
        const xx = x + dx
        const yy = y + dy
        if (xx < cx0 || yy < cy0 || xx > cx1 || yy > cy1) continue
        if (claim[yy * W + xx] === id) return true
      }
    return false
  }
  for (let id = 0; id < NAMES.length; id++) {
    let minX = W
    let minY = H
    let maxX = -1
    let maxY = -1
    const mine = new Uint8Array(W * H)
    for (let y = cy0; y <= cy1; y++)
      for (let x = cx0; x <= cx1; x++) {
        const p = y * W + x
        if (alpha[p] === 0) continue
        if (claim[p] === id || (id === HAIR && fill.has(p)) || (claim[p] >= 0 && near(p, id))) mine[p] = 1
      }
    for (let y = cy0; y <= cy1; y++)
      for (let x = cx0; x <= cx1; x++) {
        const p = y * W + x
        if (!mine[p]) continue
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    if (maxX < 0) continue
    const w = maxX - minX + 1
    const h = maxY - minY + 1
    const buf = Buffer.alloc(w * h * 4)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = (minY + y) * W + (minX + x)
        const d = (y * w + x) * 4
        if (mine[p] && !(id === HAIR && fill.has(p) && claim[p] !== HAIR)) {
          const si = p * 4
          buf[d] = data[si]
          buf[d + 1] = data[si + 1]
          buf[d + 2] = data[si + 2]
          buf[d + 3] = alpha[p]
        } else if (id === HAIR && fill.has(p)) {
          const si = fill.get(p)!
          buf[d] = data[si]
          buf[d + 1] = data[si + 1]
          buf[d + 2] = data[si + 2]
          buf[d + 3] = 255
        }
      }
    await sharp(buf, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toFile(resolve(dir, `${NAMES[id]}.png`))
    const tl = toP({ x: minX, y: minY })
    pieces[NAMES[id]] = { file: `${NAMES[id]}.png`, x: tl.x, y: tl.y, w: +(w * s).toFixed(2), h: +(h * s).toFixed(2) }
  }

  /** Average colour of the opaque, non-white, non-outline pixels around a point. */
  const sample = (pt: Pt): string => {
    const cx = Math.round(pt.x)
    const cy = Math.round(pt.y)
    let n = 0
    const acc = [0, 0, 0]
    for (let r = 0; r <= 14 && n < 40; r++) {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          const x = cx + dx
          const y = cy + dy
          if (x < cx0 || y < cy0 || x > cx1 || y > cy1) continue
          const p = y * W + x
          if (alpha[p] < 200) continue
          const i = p * 4
          const lum = (data[i] + data[i + 1] + data[i + 2]) / 3
          if (lum > 236 || lum < 50) continue
          acc[0] += data[i]
          acc[1] += data[i + 1]
          acc[2] += data[i + 2]
          n++
        }
    }
    if (!n) return '#f6c9a6'
    return `#${acc.map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('')}`
  }
  const armJoint = (a: ArmCfg): object => ({
    shoulder: toP(a.shoulder),
    elbow: toP(a.elbow),
    hand: toP(a.hand),
    shoulderColor: sample({ x: a.shoulder.x, y: a.shoulder.y + 10 }),
    elbowColor: sample({ x: a.elbow.x, y: a.elbow.y - 6 }),
    shoulderR: +((a.upper.x1 - a.upper.x0) * 0.32 * s).toFixed(2),
    elbowR: +((a.lower.x1 - a.lower.x0) * 0.2 * s).toFixed(2)
  })
  const legJoint = (l: LegCfg): object => ({
    hip: toP(l.hip),
    knee: toP(l.knee),
    hipColor: sample({ x: l.hip.x, y: l.hip.y + 12 }),
    kneeColor: sample({ x: l.knee.x, y: l.knee.y - 8 }),
    hipR: +((l.thigh.x1 - l.thigh.x0) * 0.26 * s).toFixed(2),
    kneeR: +((l.thigh.x1 - l.thigh.x0) * 0.24 * s).toFixed(2)
  })
  const f = cfg.face
  const manifest = {
    style: cfg.style,
    scale: +s.toFixed(4),
    pieces,
    arms: { L: armJoint(cfg.arms.L), R: armJoint(cfg.arms.R) },
    legs: { L: legJoint(cfg.legs.L), R: legJoint(cfg.legs.R) },
    face: {
      eyeL: toP(f.eyeL),
      eyeR: toP(f.eyeR),
      mouth: toP(f.mouth),
      blushL: toP(f.blushL),
      blushR: toP(f.blushR),
      eyeRx: +(f.eyeRx * s).toFixed(2),
      eyeRy: +(f.eyeRy * s).toFixed(2)
    },
    headPivot: toP({ x: cfg.centerX, y: torsoTop - 6 }),
    hairPivot: toP(cfg.hairPivot),
    hemY: toP({ x: 0, y: cfg.legs.L.hip.y }).y,
    skin: sample({ x: f.mouth.x, y: f.mouth.y - 16 })
  }

  let preview: Buffer | undefined
  if (validate) {
    const SC = 3
    const order = ['hair-low', 'hair', 'legL-thigh', 'legL-calf', 'legR-thigh', 'legR-calf', 'torso', 'head', 'armL-upper', 'armL-lower', 'armR-upper', 'armR-lower']
    const layers: sharp.OverlayOptions[] = []
    for (const n of order) {
      const p = pieces[n]
      if (!p) continue
      const buf = await sharp(resolve(dir, p.file))
        .resize(Math.max(1, Math.round(p.w * SC)), Math.max(1, Math.round(p.h * SC)))
        .png()
        .toBuffer()
      layers.push({ input: buf, left: Math.round(p.x * SC), top: Math.round(p.y * SC) })
    }
    preview = await sharp({
      create: { width: 220 * SC, height: 250 * SC, channels: 4, background: { r: 246, g: 241, b: 252, alpha: 1 } }
    })
      .composite(layers)
      .png()
      .toBuffer()
  }
  return { manifest, preview }
}

async function main(): Promise<void> {
  const validateOut = process.argv[2]
  const all: Record<string, object> = {}
  const previews: Buffer[] = []
  for (const cfg of OUTFITS) {
    const res = await build(cfg, !!validateOut)
    all[cfg.style] = res.manifest
    if (res.preview) previews.push(res.preview)
    console.log(`${cfg.style}: ${Object.keys((res.manifest as { pieces: object }).pieces).length} pieces`)
  }
  writeFileSync(resolve('src/renderer/src/character/rig-outfits.json'), JSON.stringify(all, null, 2))
  console.log('rig-outfits.json written')
  if (validateOut && previews.length) {
    const SC = 3
    await sharp({
      create: {
        width: 220 * SC * previews.length + 20 * (previews.length - 1),
        height: 250 * SC,
        channels: 4,
        background: { r: 230, g: 224, b: 240, alpha: 1 }
      }
    })
      .composite(previews.map((p, i) => ({ input: p, left: i * (220 * SC + 20), top: 0 })))
      .png()
      .toFile(resolve(validateOut))
    console.log(`validation: ${validateOut}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
