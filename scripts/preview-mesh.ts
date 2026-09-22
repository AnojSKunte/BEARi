/**
 * Offline verification for the deform rig.
 *
 * Runs the REAL Animator and the REAL skinning math, rasterizes the deformed
 * meshes on the CPU (barycentric triangle fill with bilinear texture
 * sampling) and writes a labelled contact sheet. This lets every pose be
 * inspected for gaps, stretching and silhouette breaks without launching the
 * app or a browser.
 *
 * Usage: npx tsx scripts/preview-mesh.ts <outPng> [style] [--wire]
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import sharp from 'sharp'
import { Animator } from '../src/renderer/src/character/engine/animator'
import type { Pose } from '../src/renderer/src/character/engine/pose'
import { RigController } from '../src/renderer/src/character/mesh/animate'
import type { RigData } from '../src/renderer/src/character/mesh/rig'
import { MESH_STRIDE, matApply } from '../src/renderer/src/character/mesh/rig'

const RIGS = JSON.parse(readFileSync(resolve('src/renderer/src/character/rig-mesh.json'), 'utf8')) as Record<string, RigData>

const CW = 300
const CH = 366
const TARGET_H = 300
const FLOOR = 344
const CXP = 150

interface Tex {
  data: Buffer
  w: number
  h: number
}

async function loadTextures(style: string, rig: RigData): Promise<Record<string, Tex>> {
  const out: Record<string, Tex> = {}
  for (const l of rig.layers) {
    const p = resolve('src/renderer/public/rig/mesh', style, l.file)
    const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    out[l.name] = { data, w: info.width, h: info.height }
  }
  return out
}

/** Draw one skinned layer into an RGBA canvas. */
function drawLayer(
  canvas: Float32Array,
  rig: RigData,
  ctrl: RigController,
  layerName: string,
  tex: Tex,
  toCanvas: (x: number, y: number) => [number, number],
  wire: boolean
): void {
  const layer = rig.layers.find((l) => l.name === layerName)
  if (!layer) return
  const { verts, indices } = layer
  const n = verts.length / MESH_STRIDE
  const px = new Float32Array(n)
  const py = new Float32Array(n)
  const uu = new Float32Array(n)
  const vv = new Float32Array(n)
  // --- skin every vertex (linear blend skinning)
  for (let i = 0; i < n; i++) {
    const o = i * MESH_STRIDE
    const x = verts[o]
    const y = verts[o + 1]
    let sx = 0
    let sy = 0
    for (let k = 0; k < 4; k++) {
      const w = verts[o + 8 + k]
      if (w <= 0) continue
      const b = ctrl.rt[verts[o + 4 + k]]
      if (!b) continue
      const p = matApply(b.skin, x, y)
      sx += p.x * w
      sy += p.y * w
    }
    const [cx, cy] = toCanvas(sx, sy)
    px[i] = cx
    py[i] = cy
    uu[i] = verts[o + 2]
    vv[i] = verts[o + 3]
  }
  const sample = (u: number, v: number, out: number[]): void => {
    const fx = Math.min(tex.w - 1.001, Math.max(0, u * tex.w - 0.5))
    const fy = Math.min(tex.h - 1.001, Math.max(0, v * tex.h - 0.5))
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0
    out[0] = out[1] = out[2] = out[3] = 0
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const w = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty)
        const s = ((y0 + dy) * tex.w + (x0 + dx)) * 4
        const a = tex.data[s + 3] / 255
        out[0] += tex.data[s] * a * w
        out[1] += tex.data[s + 1] * a * w
        out[2] += tex.data[s + 2] * a * w
        out[3] += a * w
      }
  }
  const rgba = [0, 0, 0, 0]
  for (let t = 0; t < indices.length; t += 3) {
    const i0 = indices[t]
    const i1 = indices[t + 1]
    const i2 = indices[t + 2]
    const x0 = px[i0]
    const y0 = py[i0]
    const x1 = px[i1]
    const y1 = py[i1]
    const x2 = px[i2]
    const y2 = py[i2]
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if (Math.abs(area) < 1e-9) continue
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)))
    const maxX = Math.min(CW - 1, Math.ceil(Math.max(x0, x1, x2)))
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)))
    const maxY = Math.min(CH - 1, Math.ceil(Math.max(y0, y1, y2)))
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const cxp = x + 0.5
        const cyp = y + 0.5
        let w0 = ((x1 - cxp) * (y2 - cyp) - (x2 - cxp) * (y1 - cyp)) / area
        let w1 = ((x2 - cxp) * (y0 - cyp) - (x0 - cxp) * (y2 - cyp)) / area
        let w2 = 1 - w0 - w1
        if (w0 < -0.002 || w1 < -0.002 || w2 < -0.002) continue
        w0 = Math.max(0, w0)
        w1 = Math.max(0, w1)
        w2 = Math.max(0, w2)
        sample(uu[i0] * w0 + uu[i1] * w1 + uu[i2] * w2, vv[i0] * w0 + vv[i1] * w1 + vv[i2] * w2, rgba)
        const a = rgba[3]
        if (a <= 0.004) continue
        const o = (y * CW + x) * 4
        canvas[o] = rgba[0] + canvas[o] * (1 - a)
        canvas[o + 1] = rgba[1] + canvas[o + 1] * (1 - a)
        canvas[o + 2] = rgba[2] + canvas[o + 2] * (1 - a)
        canvas[o + 3] = a + canvas[o + 3] * (1 - a)
      }
    if (wire) {
      const line = (ax: number, ay: number, bx: number, by: number): void => {
        const steps = Math.ceil(Math.hypot(bx - ax, by - ay))
        for (let s = 0; s <= steps; s++) {
          const x = Math.round(ax + ((bx - ax) * s) / steps)
          const y = Math.round(ay + ((by - ay) * s) / steps)
          if (x < 0 || y < 0 || x >= CW || y >= CH) continue
          const o = (y * CW + x) * 4
          canvas[o] = 255
          canvas[o + 1] = 40
          canvas[o + 2] = 90
          canvas[o + 3] = 1
        }
      }
      line(x0, y0, x1, y1)
      line(x1, y1, x2, y2)
      line(x2, y2, x0, y0)
    }
  }
}

const tick = (a: Animator, seconds: number, ctrl?: RigController): void => {
  const steps = Math.round(seconds / 0.016)
  for (let i = 0; i < steps; i++) {
    a.tick(0.016)
    ctrl?.update(a.pose as Pose, 0.016)
  }
}

interface Scene {
  name: string
  run: (a: Animator) => void
  seconds: number
}
const SCENES: Scene[] = [
  { name: 'idle', run: () => {}, seconds: 1.2 },
  { name: 'wave', run: (a) => { a.sleep(); tick(a, 0.4); a.wake() }, seconds: 0.75 },
  { name: 'think', run: (a) => a.setThinking(true), seconds: 1.4 },
  { name: 'read', run: (a) => a.forceIdleAction('read', 12), seconds: 2.6 },
  { name: 'coffee-sip', run: (a) => a.forceIdleAction('coffee', 12), seconds: 1.3 },
  { name: 'magic', run: (a) => a.forceIdleAction('magic', 10), seconds: 1.6 },
  { name: 'sit', run: (a) => a.forceIdleAction('sit', 10), seconds: 2.2 },
  { name: 'stretch', run: (a) => a.forceIdleAction('stretch', 8), seconds: 1.5 },
  { name: 'dance', run: (a) => a.forceIdleAction('dance', 8), seconds: 1.35 },
  { name: 'glasses', run: (a) => a.forceIdleAction('adjustGlasses', 6), seconds: 0.9 },
  { name: 'walk-stride', run: (a) => { a.stageWidth = 2000; a.walkTo(1600) }, seconds: 0.6 },
  { name: 'walk-pass', run: (a) => { a.stageWidth = 2000; a.walkTo(1600) }, seconds: 0.78 },
  { name: 'sleep', run: (a) => a.sleep(), seconds: 3 },
  { name: 'celebrate', run: (a) => a.setEmotion('celebrating'), seconds: 0.55 },
  { name: 'drag', run: (a) => { a.startDrag(); a.dragTo(120) }, seconds: 1 },
  // mid-motion frames — where ghosting and slivers show up
  { name: 'wave-rising', run: (a) => { a.sleep(); tick(a, 0.4); a.wake() }, seconds: 0.38 },
  { name: 'drag-mid', run: (a) => { a.startDrag(); a.dragTo(120) }, seconds: 0.3 },
  { name: 'stretch-mid', run: (a) => a.forceIdleAction('stretch', 8), seconds: 0.5 },
  { name: 'walk-far', run: (a) => { a.stageWidth = 2000; a.walkTo(1600) }, seconds: 1.9 }
]

async function main(): Promise<void> {
  const out = process.argv[2] ?? 'scratch/mesh.png'
  const style = process.argv[3] ?? 'kurta'
  const wire = process.argv.includes('--wire')
  const rig = RIGS[style]
  if (!rig) throw new Error(`no rig for style ${style}`)
  const tex = await loadTextures(style, rig)
  const scale = TARGET_H / (rig.figure.feetY - rig.figure.headTop)
  const toCanvas = (x: number, y: number): [number, number] => [
    CXP + (x - rig.figure.centerX) * scale,
    FLOOR + (y - rig.figure.feetY) * scale
  ]
  const order = ['body', 'hair', 'head', 'arm-l', 'arm-r']

  const frames: Buffer[] = []
  for (const scene of SCENES) {
    const a = new Animator(110)
    a.stageWidth = 220
    if (scene.name !== 'sleep') a.debugEyeOpen = 1
    const ctrl = new RigController(rig)
    scene.run(a)
    tick(a, scene.seconds, ctrl)
    const canvas = new Float32Array(CW * CH * 4)
    for (const name of order) {
      const t = tex[name]
      if (t) drawLayer(canvas, rig, ctrl, name, t, toCanvas, wire)
    }
    const px = Buffer.alloc(CW * CH * 4)
    for (let i = 0; i < CW * CH; i++) {
      const a2 = canvas[i * 4 + 3]
      const bg = 246
      px[i * 4] = Math.round(canvas[i * 4] + bg * (1 - a2))
      px[i * 4 + 1] = Math.round(canvas[i * 4 + 1] + 241 * (1 - a2))
      px[i * 4 + 2] = Math.round(canvas[i * 4 + 2] + 252 * (1 - a2))
      px[i * 4 + 3] = 255
    }
    frames.push(await sharp(px, { raw: { width: CW, height: CH, channels: 4 } }).png().toBuffer())
  }

  const cols = 5
  const rows = Math.ceil(frames.length / cols)
  const label = Buffer.from(
    `<svg width="${cols * CW}" height="${rows * CH}">${SCENES.map(
      (s, i) =>
        `<text x="${(i % cols) * CW + CW / 2}" y="${Math.floor(i / cols) * CH + CH - 6}" text-anchor="middle" font-family="Segoe UI" font-size="17" fill="#555">${s.name}</text>`
    ).join('')}</svg>`
  )
  await sharp({ create: { width: cols * CW, height: rows * CH, channels: 4, background: { r: 236, g: 231, b: 245, alpha: 1 } } })
    .composite([
      ...frames.map((f, i) => ({ input: f, left: (i % cols) * CW, top: Math.floor(i / cols) * CH })),
      { input: label, left: 0, top: 0 }
    ])
    .png()
    .toFile(resolve(out))
  console.log(`mesh preview: ${out}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
