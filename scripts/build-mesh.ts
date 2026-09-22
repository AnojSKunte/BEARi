/**
 * BEARi deform-rig builder.
 *
 * Turns each painted figure into a small number of large layers, each
 * triangulated into a mesh whose vertices are smoothly bound to a skeleton
 * (linear blend skinning). Unlike cutting a character into rigid pieces,
 * a mesh BENDS: vertices near a joint are influenced by both bones, so the
 * silhouette stays continuous and cloth curves instead of snapping.
 *
 * Per figure it produces:
 *   public/rig/mesh/<style>/{body,hair,head,arm-l,arm-r}.png   (layer art)
 *   src/renderer/src/character/rig-mesh.json                   (skeleton + meshes)
 *
 * Occlusion repair: every hole left in a layer by a part that can move away
 * (arms over the body, hair over the shoulders, the head over the neck) is
 * inpainted by push-pull diffusion, so nothing ever reveals a gap.
 *
 * Usage: npx tsx scripts/build-mesh.ts
 */
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import sharp from 'sharp'
import type { BoneDef, MeshLayer, RigData, Vec2 } from '../src/renderer/src/character/mesh/rig'
import { MESH_STRIDE } from '../src/renderer/src/character/mesh/rig'

type Poly = [number, number][]
interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

interface Joints {
  neck: Vec2
  headTop: Vec2
  shoulderL: Vec2
  elbowL: Vec2
  handL: Vec2
  shoulderR: Vec2
  elbowR: Vec2
  handR: Vec2
  hipC: Vec2
  hipL: Vec2
  kneeL: Vec2
  footL: Vec2
  hipR: Vec2
  kneeR: Vec2
  footR: Vec2
  hairRootL: Vec2
  hairTipL: Vec2
  hairRootR: Vec2
  hairTipR: Vec2
  /** Skirt / hem sway anchor and tip (cloth chain). */
  hemRoot?: Vec2
  hemTip?: Vec2
}

interface FigureConfig {
  style: string
  src: string
  /** Region of the source image containing this figure. */
  crop: Rect
  headTop: number
  feetY: number
  centerX: number
  head: Poly
  hairBox: Rect
  armL: Rect | Poly
  armR: Rect | Poly
  /** Garment silhouette — arm masks may not steal from it below the sleeve. */
  torso?: Poly
  /** Regions of the source sheet belonging to a neighbouring figure. */
  exclude?: Rect[]
  joints: Joints
  face: { eyeL: Vec2; eyeR: Vec2; eyeRx: number; eyeRy: number; mouth: Vec2; blushL: Vec2; blushR: Vec2 }
  /** Half-width of an arm — sets how softly the elbow/shoulder blend. */
  armSigma: number
  legSigma: number
  bodySigma: number
}

const SHEET = 'reference/outfits/outfits-sheet.png'
const KURTA = 'src/renderer/public/puppet/beari-front.png'

const FIGURES: FigureConfig[] = [
  {
    style: 'kurta',
    src: KURTA,
    crop: { x0: 0, y0: 0, x1: 315, y1: 549 },
    headTop: 10,
    feetY: 545,
    centerX: 158,
    head: [[66, 10], [242, 10], [260, 55], [264, 130], [256, 195], [252, 245], [236, 258], [206, 270], [158, 276], [110, 270], [80, 258], [58, 244], [50, 196], [45, 130], [50, 55]],
    hairBox: { x0: 0, y0: 0, x1: 315, y1: 470 },
    torso: [[90, 258], [226, 258], [250, 296], [254, 470], [62, 470], [64, 296]],
    armL: [[50, 296], [82, 298], [84, 372], [73, 381], [71, 424], [32, 426], [33, 384], [43, 340]],
    armR: [[212, 298], [260, 296], [265, 340], [265, 384], [272, 425], [230, 427], [223, 381], [211, 372]],
    joints: {
      neck: { x: 158, y: 272 },
      headTop: { x: 158, y: 70 },
      shoulderL: { x: 68, y: 306 },
      elbowL: { x: 75, y: 372 },
      handL: { x: 55, y: 414 },
      shoulderR: { x: 244, y: 306 },
      elbowR: { x: 243, y: 372 },
      handR: { x: 254, y: 414 },
      hipC: { x: 158, y: 452 },
      hipL: { x: 138, y: 458 },
      kneeL: { x: 137, y: 500 },
      footL: { x: 135, y: 538 },
      hipR: { x: 180, y: 458 },
      kneeR: { x: 181, y: 500 },
      footR: { x: 183, y: 538 },
      hairRootL: { x: 66, y: 96 },
      hairTipL: { x: 40, y: 330 },
      hairRootR: { x: 250, y: 92 },
      hairTipR: { x: 278, y: 340 },
      hemRoot: { x: 158, y: 400 },
      hemTip: { x: 158, y: 470 }
    },
    face: {
      eyeL: { x: 95, y: 170 },
      eyeR: { x: 189, y: 169 },
      eyeRx: 23,
      eyeRy: 27,
      mouth: { x: 140.5, y: 219 },
      blushL: { x: 78, y: 196 },
      blushR: { x: 203, y: 196 }
    },
    armSigma: 26,
    legSigma: 30,
    bodySigma: 100
  },
  {
    style: 'frock',
    src: SHEET,
    crop: { x0: 330, y0: 5, x1: 700, y1: 812 },
    headTop: 15,
    feetY: 800,
    centerX: 512,
    head: [[428, 15], [602, 15], [620, 90], [616, 190], [598, 255], [566, 274], [456, 274], [426, 255], [410, 190], [406, 90]],
    hairBox: { x0: 345, y0: 10, x1: 680, y1: 400 },
    armL: { x0: 356, y0: 282, x1: 458, y1: 520 },
    armR: { x0: 570, y0: 282, x1: 672, y1: 520 },
    torso: [[458, 268], [568, 268], [578, 300], [576, 372], [598, 415], [662, 602], [368, 602], [432, 415], [455, 372]],
    exclude: [
      { x0: 320, y0: 676, x1: 402, y1: 820 },
      { x0: 596, y0: 676, x1: 706, y1: 820 }
    ],
    joints: {
      neck: { x: 512, y: 272 },
      headTop: { x: 512, y: 70 },
      shoulderL: { x: 452, y: 306 },
      elbowL: { x: 400, y: 418 },
      handL: { x: 386, y: 490 },
      shoulderR: { x: 578, y: 306 },
      elbowR: { x: 628, y: 418 },
      handR: { x: 642, y: 490 },
      hipC: { x: 512, y: 600 },
      hipL: { x: 470, y: 606 },
      kneeL: { x: 470, y: 692 },
      footL: { x: 470, y: 792 },
      hipR: { x: 546, y: 606 },
      kneeR: { x: 546, y: 692 },
      footR: { x: 546, y: 792 },
      hairRootL: { x: 432, y: 110 },
      hairTipL: { x: 392, y: 400 },
      hairRootR: { x: 592, y: 106 },
      hairTipR: { x: 632, y: 400 },
      hemRoot: { x: 512, y: 470 },
      hemTip: { x: 512, y: 600 }
    },
    face: {
      eyeL: { x: 470, y: 182 },
      eyeR: { x: 553, y: 182 },
      eyeRx: 30,
      eyeRy: 33,
      mouth: { x: 511, y: 233 },
      blushL: { x: 446, y: 214 },
      blushR: { x: 578, y: 214 }
    },
    armSigma: 34,
    legSigma: 34,
    bodySigma: 130
  },
  {
    style: 'croptop',
    src: SHEET,
    crop: { x0: 80, y0: 680, x1: 450, y1: 1500 },
    headTop: 690,
    feetY: 1485,
    centerX: 262,
    head: [[168, 690], [356, 690], [374, 780], [370, 880], [352, 930], [312, 948], [210, 948], [170, 930], [150, 880], [146, 780]],
    hairBox: { x0: 100, y0: 685, x1: 418, y1: 1075 },
    armL: { x0: 104, y0: 952, x1: 222, y1: 1196 },
    armR: { x0: 310, y0: 952, x1: 428, y1: 1196 },
    torso: [[212, 944], [312, 944], [360, 958], [364, 1090], [360, 1220], [166, 1220], [162, 1090], [172, 958]],
    // the frock figure's shoes intrude into this crop window
    exclude: [{ x0: 396, y0: 676, x1: 452, y1: 836 }],
    joints: {
      neck: { x: 262, y: 946 },
      headTop: { x: 262, y: 745 },
      shoulderL: { x: 214, y: 976 },
      elbowL: { x: 168, y: 1090 },
      handL: { x: 140, y: 1170 },
      shoulderR: { x: 318, y: 976 },
      elbowR: { x: 362, y: 1090 },
      handR: { x: 386, y: 1170 },
      hipC: { x: 265, y: 1190 },
      hipL: { x: 222, y: 1194 },
      kneeL: { x: 222, y: 1302 },
      footL: { x: 222, y: 1476 },
      hipR: { x: 308, y: 1194 },
      kneeR: { x: 308, y: 1302 },
      footR: { x: 308, y: 1476 },
      hairRootL: { x: 176, y: 786 },
      hairTipL: { x: 130, y: 1070 },
      hairRootR: { x: 348, y: 782 },
      hairTipR: { x: 392, y: 1070 }
    },
    face: {
      eyeL: { x: 220, y: 853 },
      eyeR: { x: 302, y: 853 },
      eyeRx: 30,
      eyeRy: 33,
      mouth: { x: 261, y: 905 },
      blushL: { x: 194, y: 886 },
      blushR: { x: 330, y: 886 }
    },
    armSigma: 34,
    legSigma: 34,
    bodySigma: 130
  },
  {
    style: 'hoodie',
    src: SHEET,
    crop: { x0: 600, y0: 680, x1: 970, y1: 1510 },
    headTop: 690,
    feetY: 1492,
    centerX: 780,
    head: [[693, 690], [878, 690], [898, 780], [896, 880], [876, 935], [830, 950], [730, 950], [686, 935], [666, 880], [664, 780]],
    hairBox: { x0: 618, y0: 685, x1: 945, y1: 1085 },
    armL: { x0: 614, y0: 982, x1: 706, y1: 1214 },
    armR: { x0: 864, y0: 982, x1: 956, y1: 1214 },
    torso: [[700, 936], [828, 930], [880, 962], [884, 1230], [692, 1230], [688, 962]],
    exclude: [{ x0: 596, y0: 676, x1: 616, y1: 836 }],
    joints: {
      neck: { x: 780, y: 940 },
      headTop: { x: 780, y: 745 },
      shoulderL: { x: 700, y: 1000 },
      elbowL: { x: 668, y: 1096 },
      handL: { x: 660, y: 1188 },
      shoulderR: { x: 872, y: 1000 },
      elbowR: { x: 902, y: 1096 },
      handR: { x: 908, y: 1188 },
      hipC: { x: 780, y: 1224 },
      hipL: { x: 736, y: 1228 },
      kneeL: { x: 736, y: 1322 },
      footL: { x: 736, y: 1484 },
      hipR: { x: 822, y: 1228 },
      kneeR: { x: 822, y: 1322 },
      footR: { x: 822, y: 1484 },
      hairRootL: { x: 694, y: 786 },
      hairTipL: { x: 648, y: 1080 },
      hairRootR: { x: 870, y: 782 },
      hairTipR: { x: 914, y: 1080 },
      hemRoot: { x: 780, y: 1120 },
      hemTip: { x: 780, y: 1230 }
    },
    face: {
      eyeL: { x: 739, y: 853 },
      eyeR: { x: 820, y: 853 },
      eyeRx: 30,
      eyeRy: 33,
      mouth: { x: 779, y: 905 },
      blushL: { x: 712, y: 886 },
      blushR: { x: 848, y: 886 }
    },
    armSigma: 34,
    legSigma: 34,
    bodySigma: 130
  }
]

const OUT_ROOT = resolve('src/renderer/public/rig/mesh')
/** Mesh cell size in figure pixels — smaller = smoother deformation. */
const CELL = 7

// ------------------------------------------------------------------ helpers

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
const isRect = (m: Rect | Poly): m is Rect => !Array.isArray(m)
const inMask = (m: Rect | Poly, x: number, y: number): boolean => (isRect(m) ? inRect(m, x, y) : inPoly(m, x, y))

/** Shortest distance from a point to a segment. */
function segDist(px: number, py: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  let t = len2 > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}

// ------------------------------------------------------------------ skeleton

function buildBones(j: Joints, cfg: FigureConfig): BoneDef[] {
  const bones: BoneDef[] = []
  const push = (
    name: string,
    parent: string | null,
    head: Vec2,
    tail: Vec2,
    layers: string[],
    sigma: number,
    chain?: BoneDef['chain']
  ): void => {
    bones.push({ name, parent, head, tail, layers, sigma, chain })
  }

  // --- spine: pelvis → chest → neck → head
  push('pelvis', null, j.hipC, { x: j.hipC.x, y: j.hipC.y - 40 }, ['body'], cfg.bodySigma)
  const chestY = (j.shoulderL.y + j.shoulderR.y) / 2
  push('chest', 'pelvis', { x: j.hipC.x, y: (j.hipC.y + chestY) / 2 }, { x: j.hipC.x, y: chestY }, ['body'], cfg.bodySigma)
  push('neck', 'chest', j.neck, j.headTop, ['body', 'head', 'hair'], cfg.armSigma * 1.6)
  push('head', 'neck', j.neck, j.headTop, ['head', 'hair'], 1e5)

  // --- arms (shoulder → elbow → hand). The shoulder bones carry the shoulder
  // lift but bind NO skin: if they did, vertices near the shoulder would take
  // only half the arm's rotation and the sleeve would tear diagonally.
  push('shoulderL', 'chest', j.shoulderL, j.elbowL, [], 1)
  push('upperArmL', 'shoulderL', j.shoulderL, j.elbowL, ['arm-l'], cfg.armSigma * 1.5)
  push('foreArmL', 'upperArmL', j.elbowL, j.handL, ['arm-l'], cfg.armSigma)
  push('shoulderR', 'chest', j.shoulderR, j.elbowR, [], 1)
  push('upperArmR', 'shoulderR', j.shoulderR, j.elbowR, ['arm-r'], cfg.armSigma * 1.5)
  push('foreArmR', 'upperArmR', j.elbowR, j.handR, ['arm-r'], cfg.armSigma)

  // --- legs (hip → knee → foot)
  push('thighL', 'pelvis', j.hipL, j.kneeL, ['body'], cfg.legSigma)
  push('calfL', 'thighL', j.kneeL, j.footL, ['body'], cfg.legSigma)
  push('thighR', 'pelvis', j.hipR, j.kneeR, ['body'], cfg.legSigma)
  push('calfR', 'thighR', j.kneeR, j.footR, ['body'], cfg.legSigma)

  // --- hair chains: springy overlapping action
  const hairChain = { stiffness: 120, damping: 9, gravity: 0.05, maxAngle: 0.32 }
  const midL = { x: (j.hairRootL.x + j.hairTipL.x) / 2, y: (j.hairRootL.y + j.hairTipL.y) / 2 }
  const midR = { x: (j.hairRootR.x + j.hairTipR.x) / 2, y: (j.hairRootR.y + j.hairTipR.y) / 2 }
  push('hairL1', 'head', j.hairRootL, midL, ['hair'], cfg.armSigma * 2.4, hairChain)
  push('hairL2', 'hairL1', midL, j.hairTipL, ['hair'], cfg.armSigma * 2.4, hairChain)
  push('hairR1', 'head', j.hairRootR, midR, ['hair'], cfg.armSigma * 2.4, hairChain)
  push('hairR2', 'hairR1', midR, j.hairTipR, ['hair'], cfg.armSigma * 2.4, hairChain)

  // --- hem / skirt cloth chain
  if (j.hemRoot && j.hemTip) {
    push('hem', 'pelvis', j.hemRoot, j.hemTip, ['body'], cfg.legSigma * 2.2, {
      stiffness: 90,
      damping: 8,
      gravity: 0.04,
      maxAngle: 0.2
    })
  }
  return bones
}

// ------------------------------------------------------------------ builder

interface LayerBuffers {
  rgba: Uint8ClampedArray
  minX: number
  minY: number
  maxX: number
  maxY: number
}

async function buildFigure(cfg: FigureConfig): Promise<RigData> {
  const { data, info } = await sharp(resolve(cfg.src)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  const idx = (x: number, y: number): number => (y * W + x) * 4
  const cx0 = Math.max(0, cfg.crop.x0)
  const cy0 = Math.max(0, cfg.crop.y0)
  const cx1 = Math.min(W - 1, cfg.crop.x1)
  const cy1 = Math.min(H - 1, cfg.crop.y1)

  // ---- background removal (border flood fill of near-white)
  const alpha = new Uint8Array(W * H)
  for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) alpha[y * W + x] = data[idx(x, y) + 3]
  const isWhite = (i: number): boolean => data[i] > 234 && data[i + 1] > 234 && data[i + 2] > 234
  const seen = new Uint8Array(W * H)
  const stack: number[] = []
  for (let x = cx0; x <= cx1; x++) stack.push(x, cy0, x, cy1)
  for (let y = cy0; y <= cy1; y++) stack.push(cx0, y, cx1, y)
  while (stack.length) {
    const y = stack.pop()!
    const x = stack.pop()!
    if (x < cx0 || y < cy0 || x > cx1 || y > cy1) continue
    const p = y * W + x
    if (seen[p]) continue
    seen[p] = 1
    if (!isWhite(p * 4)) continue
    alpha[p] = 0
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1)
  }

  // ---- alpha matting.
  // A hard flood fill leaves the anti-aliased rim of the painting fully
  // opaque, so every silhouette carries a white fringe and reads as a cut-out.
  // Estimate real coverage at the rim from the local interior colour, then
  // un-premultiply back to the paint colour so edges are as soft as the art.
  {
    const nearBg = new Uint8Array(W * H)
    for (let y = cy0 + 1; y < cy1; y++)
      for (let x = cx0 + 1; x < cx1; x++) {
        const p = y * W + x
        if (alpha[p] === 0) continue
        if (alpha[p - 1] === 0 || alpha[p + 1] === 0 || alpha[p - W] === 0 || alpha[p + W] === 0) nearBg[p] = 1
      }
    for (let r = 0; r < 2; r++) {
      const grow: number[] = []
      for (let y = cy0 + 1; y < cy1; y++)
        for (let x = cx0 + 1; x < cx1; x++) {
          const p = y * W + x
          if (alpha[p] === 0 || nearBg[p]) continue
          if (nearBg[p - 1] === 1 || nearBg[p + 1] === 1 || nearBg[p - W] === 1 || nearBg[p + W] === 1) grow.push(p)
        }
      for (const p of grow) nearBg[p] = 1
    }
    const src = Uint8ClampedArray.from(data)
    for (let y = cy0 + 1; y < cy1; y++)
      for (let x = cx0 + 1; x < cx1; x++) {
        const p = y * W + x
        if (!nearBg[p]) continue
        let fg: number[] | null = null
        for (let rad = 1; rad <= 4 && !fg; rad++)
          for (let dy = -rad; dy <= rad && !fg; dy++)
            for (let dx = -rad; dx <= rad; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
              const qx = x + dx
              const qy = y + dy
              if (qx < cx0 || qy < cy0 || qx > cx1 || qy > cy1) continue
              const q = qy * W + qx
              if (alpha[q] === 0 || nearBg[q]) continue
              fg = [src[q * 4], src[q * 4 + 1], src[q * 4 + 2]]
              break
            }
        if (!fg) continue
        let bestDen = 0
        let a = 1
        for (let c = 0; c < 3; c++) {
          const den = 255 - fg[c]
          if (den > bestDen) {
            bestDen = den
            a = (255 - src[p * 4 + c]) / den
          }
        }
        if (bestDen < 24) continue
        a = Math.max(0, Math.min(1, a))
        if (a < 0.03) {
          alpha[p] = 0
          continue
        }
        alpha[p] = Math.round(a * 255)
        for (let c = 0; c < 3; c++) data[p * 4 + c] = Math.max(0, Math.min(255, (src[p * 4 + c] - 255 * (1 - a)) / a))
      }
  }

  // ---- despeckle: drop stray islands left behind by the matte
  {
    const seenC = new Uint8Array(W * H)
    for (let y = cy0; y <= cy1; y++)
      for (let x = cx0; x <= cx1; x++) {
        const start = y * W + x
        if (seenC[start] || alpha[start] === 0) continue
        const comp: number[] = []
        const q = [start]
        seenC[start] = 1
        while (q.length) {
          const p = q.pop()!
          comp.push(p)
          const px = p % W
          const py = (p - px) / W
          for (const n of [p - 1, p + 1, p - W, p + W]) {
            const nx = n % W
            const ny = (n - nx) / W
            if (nx < cx0 || ny < cy0 || nx > cx1 || ny > cy1) continue
            if (Math.abs(nx - px) + Math.abs(ny - py) !== 1) continue
            if (seenC[n] || alpha[n] === 0) continue
            seenC[n] = 1
            q.push(n)
          }
        }
        if (comp.length < 150) for (const p of comp) alpha[p] = 0
      }
  }

  // ---- hair mask by morphological opening.
  // A plain "dark pixel" test also catches the garment's dark outline strokes.
  // Eroding then dilating keeps only solid dark MASSES (hair) and removes
  // strokes, which are only a couple of pixels wide.
  const darkPx = (i: number): boolean => {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    return r < 128 && g < 112 && b < 116 && b <= r + 10 && g <= r + 4
  }
  const hairMask = new Uint8Array(W * H)
  {
    const dark = new Uint8Array(W * H)
    for (let y = cy0; y <= cy1; y++)
      for (let x = cx0; x <= cx1; x++) {
        const p = y * W + x
        if (alpha[p] > 0 && inRect(cfg.hairBox, x, y) && darkPx(p * 4)) dark[p] = 1
      }
    const ER = 3
    const eroded = new Uint8Array(W * H)
    for (let y = cy0 + ER; y <= cy1 - ER; y++)
      for (let x = cx0 + ER; x <= cx1 - ER; x++) {
        if (!dark[y * W + x]) continue
        let ok = true
        for (let dy = -ER; dy <= ER && ok; dy++)
          for (let dx = -ER; dx <= ER; dx++) {
            if (dx * dx + dy * dy > ER * ER) continue
            if (!dark[(y + dy) * W + (x + dx)]) {
              ok = false
              break
            }
          }
        if (ok) eroded[y * W + x] = 1
      }
    // Opening BY RECONSTRUCTION: flood out from the eroded seeds through the
    // dark mask. This recovers each retained hair mass in full — including
    // its thin tapering tips — while thin outline strokes, which have no
    // seed, are dropped entirely. A plain opening would chop the tips into
    // blobs.
    const queue: number[] = []
    for (let p = 0; p < W * H; p++)
      if (eroded[p]) {
        hairMask[p] = 1
        queue.push(p)
      }
    while (queue.length) {
      const p = queue.pop()!
      const x = p % W
      const y = (p - x) / W
      for (const q of [p - 1, p + 1, p - W, p + W]) {
        const qx = q % W
        const qy = (q - qx) / W
        if (qx < cx0 || qy < cy0 || qx > cx1 || qy > cy1) continue
        if (Math.abs(qx - x) + Math.abs(qy - y) !== 1) continue
        if (hairMask[q] || !dark[q]) continue
        hairMask[q] = 1
        queue.push(q)
      }
    }
  }

  // ---- layer assignment: body | hair | head | arm-l | arm-r
  const armLen = Math.hypot(cfg.joints.handL.x - cfg.joints.shoulderL.x, cfg.joints.handL.y - cfg.joints.shoulderL.y)
  const shoulderHole = armLen * 0.14
  // Below the sleeve, an arm mask may not claim garment pixels — otherwise a
  // strip of skirt or jeans rides up with the arm when it lifts.
  const sleeveR = armLen * 0.42
  const armOk = (x: number, y: number, shoulder: Vec2): boolean =>
    !cfg.torso || !inPoly(cfg.torso, x, y) || Math.hypot(x - shoulder.x, y - shoulder.y) < sleeveR
  for (const ex of cfg.exclude ?? []) {
    for (let y = Math.max(cy0, ex.y0); y <= Math.min(cy1, ex.y1); y++)
      for (let x = Math.max(cx0, ex.x0); x <= Math.min(cx1, ex.x1); x++) alpha[y * W + x] = 0
  }
  const LAYER_NAMES = ['body', 'hair', 'head', 'arm-l', 'arm-r'] as const
  type LayerName = (typeof LAYER_NAMES)[number]
  const owner = new Int8Array(W * H).fill(-1)
  for (let y = cy0; y <= cy1; y++) {
    for (let x = cx0; x <= cx1; x++) {
      const p = y * W + x
      if (alpha[p] === 0) continue
      const hairPx = hairMask[p] === 1
      const headPx = inPoly(cfg.head, x, y)
      // A disk around each shoulder pivot stays with the BODY, so the arm's
      // inner boundary is a circular arc centred on its own pivot — rotating
      // the arm can then never open a wedge at the shoulder.
      const dL = Math.hypot(x - cfg.joints.shoulderL.x, y - cfg.joints.shoulderL.y)
      const dR = Math.hypot(x - cfg.joints.shoulderR.x, y - cfg.joints.shoulderR.y)
      let l: LayerName
      if (headPx) l = 'head'
      else if (hairPx) l = 'hair'
      else if (inMask(cfg.armL, x, y) && dL > shoulderHole && armOk(x, y, cfg.joints.shoulderL)) l = 'arm-l'
      else if (inMask(cfg.armR, x, y) && dR > shoulderHole && armOk(x, y, cfg.joints.shoulderR)) l = 'arm-r'
      else l = 'body'
      owner[p] = LAYER_NAMES.indexOf(l)
    }
  }

  // ---- per-layer RGBA extraction, with a 2px feather so edges never alias
  const layerBuf: Record<string, LayerBuffers> = {}
  for (let li = 0; li < LAYER_NAMES.length; li++) {
    const name = LAYER_NAMES[li]
    let minX = W
    let minY = H
    let maxX = -1
    let maxY = -1
    const mine = new Uint8Array(W * H)
    for (let y = cy0; y <= cy1; y++)
      for (let x = cx0; x <= cx1; x++) {
        const p = y * W + x
        if (owner[p] !== li) continue
        mine[p] = 255
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    if (maxX < 0) continue
    // Grow each layer a little into its neighbours so rotated joints always
    // overlap — but never absorb hair, whose dark pixels would then rotate
    // with an arm and read as a stray blob.
    // A single pixel of overlap, and only from fully opaque interior pixels.
    // Identical opaque pixels drawn twice are invisible (c + c·(1−1) = c);
    // matted silhouette pixels drawn twice are NOT — they darken into a
    // double outline. Three pixels of overlap also rode along with a lifting
    // arm as a visible sliver.
    const GROW = 1
    for (let g = 0; g < GROW; g++) {
      const add: number[] = []
      for (let y = Math.max(cy0 + 1, minY - 1); y <= Math.min(cy1 - 1, maxY + 1); y++)
        for (let x = Math.max(cx0 + 1, minX - 1); x <= Math.min(cx1 - 1, maxX + 1); x++) {
          const p = y * W + x
          if (mine[p] || alpha[p] < 250) continue
          if (name !== 'hair' && hairMask[p] === 1) continue
          if (mine[p - 1] === 255 || mine[p + 1] === 255 || mine[p - W] === 255 || mine[p + W] === 255) add.push(p)
        }
      for (const p of add) {
        mine[p] = 200
        const x = p % W
        const y = (p - x) / W
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
    const pad = 4
    minX = Math.max(cx0, minX - pad)
    minY = Math.max(cy0, minY - pad)
    maxX = Math.min(cx1, maxX + pad)
    maxY = Math.min(cy1, maxY + pad)
    const w = maxX - minX + 1
    const h = maxY - minY + 1
    const rgba = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = (minY + y) * W + (minX + x)
        if (!mine[p]) continue
        const s = p * 4
        const d = (y * w + x) * 4
        rgba[d] = data[s]
        rgba[d + 1] = data[s + 1]
        rgba[d + 2] = data[s + 2]
        rgba[d + 3] = Math.min(alpha[p], mine[p] === 200 ? 255 : 255)
      }
    layerBuf[name] = { rgba, minX, minY, maxX, maxY }
  }

  // ---- occlusion repair: inpaint the body (and hair) where covering layers
  //      were removed, so moving an arm or turning the head never shows a hole
  /**
   * Confidence-weighted diffusion inpaint. Original pixels have full
   * confidence; each filled pixel inherits a fraction of its sources'. The
   * weighted 5×5 average pulls strongly from real paint and only weakly from
   * other guesses, which keeps large fills smooth instead of building up the
   * ring-shaped banding a naive neighbour average produces.
   */
  const inpaint = (buf: LayerBuffers, holeTest: (x: number, y: number) => boolean, rounds: number): void => {
    const w = buf.maxX - buf.minX + 1
    const h = buf.maxY - buf.minY + 1
    const a = buf.rgba
    const conf = new Float32Array(w * h)
    for (let i = 0; i < w * h; i++) conf[i] = a[i * 4 + 3] > 40 ? 1 : 0
    const R = 2
    for (let r = 0; r < rounds; r++) {
      const snap = new Uint8ClampedArray(a)
      const snapConf = Float32Array.from(conf)
      let filled = 0
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const pi = y * w + x
          if (snapConf[pi] > 0) continue
          const gx = buf.minX + x
          const gy = buf.minY + y
          if (!holeTest(gx, gy)) continue
          let wsum = 0
          let csum = 0
          const acc = [0, 0, 0]
          for (let dy = -R; dy <= R; dy++)
            for (let dx = -R; dx <= R; dx++) {
              const nx = x + dx
              const ny = y + dy
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
              const ni = ny * w + nx
              const c = snapConf[ni]
              if (c <= 0) continue
              const wgt = (c * c) / (1 + dx * dx + dy * dy)
              const s = ni * 4
              acc[0] += snap[s] * wgt
              acc[1] += snap[s + 1] * wgt
              acc[2] += snap[s + 2] * wgt
              wsum += wgt
              csum += c
            }
          if (wsum <= 0) continue
          const d = pi * 4
          a[d] = acc[0] / wsum
          a[d + 1] = acc[1] / wsum
          a[d + 2] = acc[2] / wsum
          a[d + 3] = 255
          conf[pi] = Math.min(0.92, (csum / (R * 2 + 1) ** 2) * 3.2)
          filled++
        }
      if (!filled) break
    }
  }
  // A layer may only be repaired where the ORIGINAL painting had pixels, and
  // only within a band of the head silhouette — otherwise the fill runs away
  // across the whole head-shaped hole and smears across the character.
  const origOpaque = (x: number, y: number): boolean => alpha[y * W + x] > 0
  /** Inside the head silhouette, but only within `band` px of its edge. */
  const headEdgeBand = (x: number, y: number, band: number): boolean => {
    if (!inPoly(cfg.head, x, y)) return false
    for (let i = 0, j = cfg.head.length - 1; i < cfg.head.length; j = i++) {
      const d = segDist(x, y, { x: cfg.head[j][0], y: cfg.head[j][1] }, { x: cfg.head[i][0], y: cfg.head[i][1] })
      if (d <= band) return true
    }
    return false
  }
  // The body must exist under the arms (wide hole — needs many rounds) and a
  // little way under the hair and chin (narrow bands — few rounds, so a big
  // hair-shaped hole never gets filled with guesswork).
  if (layerBuf.body) {
    // Only where the GARMENT continues behind the arm (inside the torso
    // silhouette). Where the arm hangs over empty background, nothing is
    // filled — otherwise an arm-shaped smear is left behind when it lifts,
    // which reads as a ghost arm.
    const inTorso = (x: number, y: number): boolean => (cfg.torso ? inPoly(cfg.torso, x, y) : true)
    inpaint(
      layerBuf.body,
      (x, y) => origOpaque(x, y) && inTorso(x, y) && (inMask(cfg.armL, x, y) || inMask(cfg.armR, x, y)) && !inPoly(cfg.head, x, y),
      30
    )
    inpaint(layerBuf.body, (x, y) => origOpaque(x, y) && (headEdgeBand(x, y, 14) || (hairMask[y * W + x] === 1 && inTorso(x, y))), 9)
  }
  // hair must exist just behind the head edge so a head turn never opens a gap
  if (layerBuf.hair) inpaint(layerBuf.hair, (x, y) => origOpaque(x, y) && headEdgeBand(x, y, 20), 20)

  // ---- write layer PNGs
  const dir = resolve(OUT_ROOT, cfg.style)
  mkdirSync(dir, { recursive: true })
  const bones = buildBones(cfg.joints, cfg)
  const layers: MeshLayer[] = []

  for (const name of LAYER_NAMES) {
    const buf = layerBuf[name]
    if (!buf) continue
    const w = buf.maxX - buf.minX + 1
    const h = buf.maxY - buf.minY + 1
    await sharp(Buffer.from(buf.rgba.buffer, buf.rgba.byteOffset, buf.rgba.length), {
      raw: { width: w, height: h, channels: 4 }
    })
      .png()
      .toFile(resolve(dir, `${name}.png`))

    // ---- triangulate: grid cells that contain any opaque pixel
    const opaqueAt = (gx: number, gy: number): boolean => {
      const x = Math.round(gx) - buf.minX
      const y = Math.round(gy) - buf.minY
      if (x < 0 || y < 0 || x >= w || y >= h) return false
      return buf.rgba[(y * w + x) * 4 + 3] > 8
    }
    const cellHasArt = (gx: number, gy: number): boolean => {
      for (let sy = 0; sy <= CELL; sy += CELL / 2)
        for (let sx = 0; sx <= CELL; sx += CELL / 2) if (opaqueAt(gx + sx, gy + sy)) return true
      return false
    }
    const allowed = bones.map((b, i) => ({ b, i })).filter(({ b }) => b.layers.includes(name))
    const vertMap = new Map<string, number>()
    const verts: number[] = []
    const indices: number[] = []
    const vertexAt = (gx: number, gy: number): number => {
      const key = `${gx}|${gy}`
      const hit = vertMap.get(key)
      if (hit !== undefined) return hit
      // ---- skin weights: gaussian falloff on distance to each allowed bone
      const scored = allowed
        .map(({ b, i }) => {
          const d = segDist(gx, gy, b.head, b.tail)
          return { i, w: Math.exp(-(d * d) / (2 * b.sigma * b.sigma)) }
        })
        .filter((s) => s.w > 1e-4)
        .sort((a, b2) => b2.w - a.w)
        .slice(0, 4)
      let total = scored.reduce((s, v) => s + v.w, 0)
      if (total <= 0) {
        // fall back to the single nearest allowed bone
        let best = allowed[0]?.i ?? 0
        let bestD = Infinity
        for (const { b, i } of allowed) {
          const d = segDist(gx, gy, b.head, b.tail)
          if (d < bestD) {
            bestD = d
            best = i
          }
        }
        scored.push({ i: best, w: 1 })
        total = 1
      }
      const id = verts.length / MESH_STRIDE
      verts.push(gx, gy, (gx - buf.minX) / w, (gy - buf.minY) / h)
      for (let k = 0; k < 4; k++) verts.push(scored[k]?.i ?? 0)
      for (let k = 0; k < 4; k++) verts.push((scored[k]?.w ?? 0) / total)
      vertMap.set(key, id)
      return id
    }
    for (let gy = buf.minY; gy < buf.maxY; gy += CELL)
      for (let gx = buf.minX; gx < buf.maxX; gx += CELL) {
        if (!cellHasArt(gx, gy)) continue
        const x1 = Math.min(gx + CELL, buf.maxX)
        const y1 = Math.min(gy + CELL, buf.maxY)
        const a = vertexAt(gx, gy)
        const b = vertexAt(x1, gy)
        const c = vertexAt(x1, y1)
        const d = vertexAt(gx, y1)
        indices.push(a, b, c, a, c, d)
      }
    layers.push({ name, file: `${name}.png`, ox: buf.minX, oy: buf.minY, tw: w, th: h, verts, indices })
  }

  // face skin tone, sampled just under an eye
  const si = idx(Math.round(cfg.face.eyeL.x), Math.round(cfg.face.eyeL.y + cfg.face.eyeRy + 6))
  const skin = `#${[data[si], data[si + 1], data[si + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`

  return {
    style: cfg.style,
    figure: { w: W, h: H, centerX: cfg.centerX, headTop: cfg.headTop, feetY: cfg.feetY },
    bones,
    layers,
    face: cfg.face,
    skin
  }
}

async function main(): Promise<void> {
  const all: Record<string, RigData> = {}
  for (const cfg of FIGURES) {
    const rig = await buildFigure(cfg)
    all[cfg.style] = rig
    const tris = rig.layers.reduce((s, l) => s + l.indices.length / 3, 0)
    const vs = rig.layers.reduce((s, l) => s + l.verts.length / MESH_STRIDE, 0)
    console.log(`${cfg.style}: ${rig.layers.length} layers, ${vs} verts, ${tris} triangles, ${rig.bones.length} bones`)
  }
  // Round aggressively — sub-pixel positions and 3-decimal weights are far
  // below what is visible, and it roughly halves the bundled rig.
  const json = JSON.stringify(all, (k, v) => {
    if (typeof v !== 'number') return v
    if (k === 'verts') return v
    return Math.round(v * 1000) / 1000
  }).replace(/"verts":\[[^\]]*\]/g, (m) =>
    m.replace(/-?\d+\.\d+/g, (n) => String(Math.round(parseFloat(n) * 1000) / 1000))
  )
  writeFileSync(resolve('src/renderer/src/character/rig-mesh.json'), json)
  const kb = Math.round(json.length / 1024)
  console.log(`rig-mesh.json written (${kb} KB)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
