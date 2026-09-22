/**
 * Offline verification for the frame renderer.
 *
 * Drives the REAL Animator, the REAL Director and the REAL motion layer at a
 * fixed 60 Hz, rasterises each sampled moment through the same transform the
 * canvas uses (shift, rotate, shear, scale about her feet) and writes a
 * labelled filmstrip per scene. It also reports a smoothness figure: the
 * largest per-tick movement of her head between cuts. A browser tab that is
 * not on screen has its animation clock throttled, so this is the only honest
 * way to check timing and motion.
 *
 * Usage: npx tsx scripts/preview-frames.ts [outPng]
 */
import { mkdirSync } from 'fs'
import { resolve } from 'path'
import sharp from 'sharp'
import { Animator } from '../src/renderer/src/character/engine/animator'
import type { Pose } from '../src/renderer/src/character/engine/pose'
import { FRAMES } from '../src/renderer/src/character/frames/clips'
import type { ClipMeta } from '../src/renderer/src/character/frames/clips'
import { Director, EXT, STRIDE_FRACTION, desired } from '../src/renderer/src/character/frames/director'
import { MotionLayer, turnWidth } from '../src/renderer/src/character/frames/motion'
import type { MotionOut } from '../src/renderer/src/character/frames/motion'

/** On-screen height of the wrap at scale 1, matching App.tsx. */
const BOX_H = 310
const FIG_H = BOX_H * 0.94
const FIG = FIG_H / FRAMES.standH
const STRIDE_PX = FIG_H * STRIDE_FRACTION
const CELL_W = Math.round(EXT.w * FIG) + 8
const CELL_H = Math.round(EXT.h * FIG) + 18
const FLOOR = CELL_H - 6
const DT = 1 / 60

interface Scene {
  name: string
  /** Sample times in seconds. */
  at: number[]
  run: (a: Animator) => void
  /** Extra triggers fired part-way through the scene. */
  pokes?: [number, (a: Animator) => void][]
}

const SCENES: Scene[] = [
  {
    name: 'wave hello (woken up)',
    at: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.95, 1.15, 1.4, 1.8],
    run: (a) => {
      a.sleep()
      for (let i = 0; i < 400; i++) a.tick(1 / 60)
      a.wake()
    }
  },
  {
    name: 'walk right',
    at: [0, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 1.0, 1.2, 1.5],
    run: (a) => {
      a.stageWidth = 2000
      a.walkTo(1800)
    }
  },
  {
    name: 'walk left (turns round)',
    at: [0, 0.08, 0.16, 0.24, 0.4, 0.6, 0.8, 1.0, 1.3, 1.6],
    run: (a) => {
      a.stageWidth = 2000
      a.pose.x = 1500
      a.walkTo(100)
    }
  },
  { name: 'read a book', at: [0, 0.3, 0.6, 0.9, 1.4, 2.0, 2.8, 3.6, 4.4, 5.4], run: (a) => a.forceIdleAction('read', 14) },
  { name: 'coffee', at: [0, 0.3, 0.6, 0.9, 1.2, 1.6, 2.1, 2.6, 3.2, 4.0], run: (a) => a.forceIdleAction('coffee', 11) },
  { name: 'sit down', at: [0, 0.25, 0.5, 0.8, 1.2, 1.8, 2.6, 3.4, 4.2, 5.0], run: (a) => a.forceIdleAction('sit', 10) },
  {
    // dense samples through the jump: the arc, take-off stretch and landing squash
    name: 'celebrate (jump arc)',
    at: [0, 0.18, 0.24, 0.3, 0.36, 0.42, 0.48, 0.56, 0.64, 0.8],
    run: (a) => a.setEmotion('celebrating')
  },
  {
    // sampled past the end of the clip with a second trigger: she should rest
    // briefly and celebrate again rather than standing frozen
    name: 'celebrate (clicked twice)',
    at: [0, 0.4, 1.1, 1.8, 2.6, 3.0, 3.2, 3.5, 3.8, 4.6],
    run: (a) => a.setEmotion('celebrating'),
    pokes: [[1.2, (a) => a.setEmotion('celebrating')]]
  },
  { name: 'thinking', at: [0, 0.2, 0.5, 0.9, 1.4, 2.0, 2.6, 3.2, 3.9, 4.6], run: (a) => a.setThinking(true) },
  { name: 'falling asleep', at: [0, 0.4, 0.8, 1.2, 1.6, 2.2, 2.8, 3.4, 4.2, 5.2], run: (a) => a.sleep() },
  {
    name: 'read, stand up, turn and walk off',
    at: [0, 1.6, 3.1, 3.5, 3.8, 3.95, 4.05, 4.2, 4.5, 5.0],
    run: (a) => {
      a.stageWidth = 2000
      a.forceIdleAction('read', 3)
    },
    pokes: [[3.05, (a) => a.walkTo(1800)]]
  },
  {
    // yanked to the right, then dropped: inertia lean, hover, landing squash
    name: 'dragged and dropped',
    at: [0, 0.1, 0.2, 0.35, 0.5, 0.7, 0.9, 1.0, 1.1, 1.4],
    run: (a) => {
      a.stageWidth = 2000
      a.startDrag()
    },
    pokes: [
      [0.05, (a) => a.dragTo(700)],
      [0.2, (a) => a.dragTo(850)],
      [0.4, (a) => a.dragTo(1000)],
      [0.6, (a) => a.dragTo(1050)],
      [0.9, (a) => a.endDrag()]
    ]
  }
]

interface Cell {
  clip: string
  index: number
  flip: boolean
  turn: number
  m: MotionOut
}

interface Raw {
  data: Buffer
  w: number
  h: number
}

const raws = new Map<string, Raw>()
async function rawOf(clip: string): Promise<Raw> {
  let r = raws.get(clip)
  if (!r) {
    const { data, info } = await sharp(resolve('src/renderer/public/frames', `${clip}.webp`))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    r = { data, w: info.width, h: info.height }
    raws.set(clip, r)
  }
  return r
}

/** 2x3 affine [a b c d e f]: x' = a x + c y + e, y' = b x + d y + f (canvas order). */
type Mat = [number, number, number, number, number, number]
const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5]
]
const inv = (m: Mat): Mat => {
  const det = m[0] * m[3] - m[1] * m[2]
  const a = m[3] / det
  const b = -m[1] / det
  const c = -m[2] / det
  const d = m[0] / det
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])]
}

/** The exact transform FrameBeari builds, feet at (ox, oy) in the cell. */
function cellMatrix(meta: ClipMeta, c: Cell, ox: number, oy: number): Mat {
  let sx = c.m.sx * Math.max(0.02, c.turn)
  if (c.flip) sx = -sx
  let rot = c.m.rot
  if (c.turn < 1) rot += (1 - Math.min(1, c.turn)) * 3 * (c.flip ? -1 : 1)
  const r = (rot * Math.PI) / 180
  let M: Mat = [1, 0, 0, 1, ox + c.m.x, oy - c.m.y]
  M = mul(M, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0])
  M = mul(M, [1, 0, c.m.shear, 1, 0, 0])
  M = mul(M, [sx, 0, 0, c.m.sy, 0, 0])
  M = mul(M, [FIG, 0, 0, FIG, 0, 0])
  M = mul(M, [1, 0, 0, 1, -meta.anchorX, -meta.anchorY])
  return M
}

/** Rasterise one cell by inverse mapping every output pixel (bilinear, premultiplied). */
function rasterise(out: Buffer, outW: number, outH: number, x0: number, raw: Raw, meta: ClipMeta, c: Cell): void {
  const M = cellMatrix(meta, c, x0 + CELL_W / 2, FLOOR)
  const I = inv(M)
  const sx0 = c.index * meta.cellW
  for (let y = 0; y < CELL_H; y++)
    for (let x = x0; x < x0 + CELL_W; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const u = I[0] * px + I[2] * py + I[4] - 0.5
      const v = I[1] * px + I[3] * py + I[5] - 0.5
      if (u < 0 || v < 0 || u >= meta.cellW - 1 || v >= meta.cellH - 1) continue
      const ix = Math.floor(u)
      const iy = Math.floor(v)
      const fx = u - ix
      const fy = v - iy
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy)
          const s = ((iy + dy) * raw.w + sx0 + ix + dx) * 4
          const al = raw.data[s + 3] / 255
          r += raw.data[s] * al * w
          g += raw.data[s + 1] * al * w
          b += raw.data[s + 2] * al * w
          a += al * w
        }
      if (a <= 0.003) continue
      const o = (y * outW + x) * 4
      out[o] = Math.round(r + out[o] * (1 - a))
      out[o + 1] = Math.round(g + out[o + 1] * (1 - a))
      out[o + 2] = Math.round(b + out[o + 2] * (1 - a))
      out[o + 3] = 255
      void outH
    }
}

/** Where her head-top lands on screen, relative to her feet - the smoothness probe. */
function headProbe(meta: ClipMeta, c: Cell): { x: number; y: number } {
  const M = cellMatrix(meta, c, 0, 0)
  const hx = meta.anchorX
  const hy = meta.anchorY - meta.heights[c.index]
  return { x: M[0] * hx + M[2] * hy + M[4], y: M[1] * hx + M[3] * hy + M[5] }
}

async function main(): Promise<void> {
  const out = process.argv[2] ?? 'scratch/frames-anim.png'
  mkdirSync(resolve('scratch'), { recursive: true })

  const strips: Buffer[] = []
  for (const scene of SCENES) {
    const a = new Animator(600)
    a.artActionsOnly = true
    a.stageWidth = 1200
    a.debugEyeOpen = 1
    const dir = new Director()
    const motion = new MotionLayer()
    let t = 0
    let prevX = a.pose.x
    const tick = (): Cell => {
      const moved = a.pose.x - prevX
      prevX = a.pose.x
      dir.update(DT, desired(a.pose as Pose), a.pose.facing === -1, moved, STRIDE_PX)
      const f = dir.frame()
      const meta = FRAMES.clips[f.clip]
      const m = motion.update({
        dt: DT,
        now: t,
        pose: a.pose as Pose,
        dir,
        clip: meta ?? null,
        index: f.index,
        figScale: FIG,
        figureH: FIG_H,
        movedPx: moved,
        stridePx: STRIDE_PX
      })
      const cell = { clip: f.clip, index: f.index, flip: dir.flip, turn: turnWidth(dir.turnT), m }
      a.tick(DT)
      t += DT
      return cell
    }
    // settle at rest first so every scene starts from the same place
    for (let i = 0; i < 30; i++) tick()
    t = 0
    scene.run(a)

    const cells: Cell[] = []
    const pokes = [...(scene.pokes ?? [])]
    let next = 0
    // smoothness: largest head movement between two consecutive ticks that are
    // not a cut and not mid-spin, in px at 60 Hz
    let worst = 0
    let worstAt = 0
    let cutMax = 0
    let prevProbe: { x: number; y: number } | null = null
    let prevKey = ''
    while (next < scene.at.length) {
      while (pokes.length && t >= pokes[0][0]) pokes.shift()![1](a)
      const sampleNow = t >= scene.at[next]
      const cell = tick()
      const meta = FRAMES.clips[cell.clip]
      const probe = headProbe(meta, cell)
      const key = `${cell.clip}${cell.index}${cell.flip}`
      if (prevProbe) {
        const d = Math.hypot(probe.x - prevProbe.x, probe.y - prevProbe.y)
        if (key === prevKey && cell.turn >= 1) {
          if (d > worst) {
            worst = d
            worstAt = t
          }
        } else if (key !== prevKey) cutMax = Math.max(cutMax, d)
      }
      prevProbe = probe
      prevKey = key
      if (sampleNow) {
        cells.push(cell)
        next++
      }
      if (t > 40) break
    }

    // ---- compose the strip
    const W = CELL_W * cells.length
    const buf = Buffer.alloc(W * CELL_H * 4)
    for (let i = 0; i < W * CELL_H; i++) {
      buf[i * 4] = 32
      buf[i * 4 + 1] = 46
      buf[i * 4 + 2] = 58
      buf[i * 4 + 3] = 255
    }
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]
      const meta = FRAMES.clips[c.clip]
      rasterise(buf, W, CELL_H, i * CELL_W, await rawOf(c.clip), meta, c)
    }
    const labels = cells
      .map(
        (c, i) =>
          `<text x="${i * CELL_W + 4}" y="12" font-family="Arial" font-size="10" fill="#cfd8e8">${scene.at[i]}s</text>` +
          `<text x="${i * CELL_W + 4}" y="${CELL_H - 4}" font-family="Arial" font-size="10" fill="#9fe8c0">${c.clip}${c.index}${c.flip ? ' flip' : ''}${c.turn < 0.95 ? ' turn' : ''}</text>` +
          `<line x1="${i * CELL_W}" y1="${FLOOR}" x2="${(i + 1) * CELL_W}" y2="${FLOOR}" stroke="#44607a" stroke-width="1"/>`
      )
      .join('')
    const title = `<text x="6" y="${CELL_H - 16}" font-family="Arial" font-size="13" fill="#fff">${scene.name}</text>`
    strips.push(
      await sharp(buf, { raw: { width: W, height: CELL_H, channels: 4 } })
        .composite([{ input: Buffer.from(`<svg width="${W}" height="${CELL_H}">${labels}${title}</svg>`), left: 0, top: 0 }])
        .png()
        .toBuffer()
    )
    console.log(
      `${scene.name.padEnd(34)} ${cells.map((c) => `${c.clip}${c.index}${c.flip ? 'F' : ''}`).join(' ')}` +
        `\n${''.padEnd(34)} smooth: worst ${worst.toFixed(2)}px/tick at ${worstAt.toFixed(2)}s, biggest cut ${cutMax.toFixed(1)}px`
    )
  }

  const W = CELL_W * 10
  await sharp({
    create: { width: W, height: (CELL_H + 4) * strips.length, channels: 4, background: { r: 18, g: 26, b: 34, alpha: 1 } }
  })
    .composite(strips.map((s, i) => ({ input: s, left: 0, top: i * (CELL_H + 4) })))
    .png()
    .toFile(resolve(out))
  console.log(`\nfilmstrip: ${out}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
