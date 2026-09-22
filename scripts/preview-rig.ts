/**
 * Offline rig preview — recomposes the rig layers at animation keyframes
 * (rest, wave, walk lean, head turn, sleepy slump) using the same pivot
 * math as the renderer, so rig quality can be checked without launching
 * the app.
 *
 * Usage: npx tsx scripts/preview-rig.ts <outPng>
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import sharp from 'sharp'

const RIG = resolve('src/renderer/public/rig')

interface Part {
  file: string
  x: number
  y: number
  w: number
  h: number
  pivotX: number
  pivotY: number
}
const manifest = JSON.parse(readFileSync(resolve(RIG, 'manifest.json'), 'utf-8')) as {
  design: { w: number; h: number }
  parts: Record<string, Part>
}

interface KeyPose {
  name: string
  rot: Record<string, number>
  shift: Record<string, [number, number]>
}

const POSES: KeyPose[] = [
  { name: 'rest', rot: {}, shift: {} },
  {
    name: 'wave',
    rot: { 'arm-l': 155, head: -5, 'hair-l': 4, 'hair-r': 3 },
    shift: { head: [-2, -2] }
  },
  {
    name: 'walk-lean',
    rot: { 'hair-l': -8, 'hair-r': -7, head: 2 },
    shift: { head: [4, 0] }
  },
  {
    name: 'look-left',
    rot: { head: -6, 'hair-l': 3, 'hair-r': 3.5 },
    shift: { head: [-7, 2] }
  },
  {
    name: 'sleepy',
    rot: { head: 7, 'hair-l': 3, 'hair-r': 2.5 },
    shift: { head: [2, 10] }
  }
]

async function renderPose(pose: KeyPose): Promise<Buffer> {
  const { design } = manifest
  const layers: sharp.OverlayOptions[] = []
  for (const name of ['hair-l', 'hair-r', 'body', 'arm-l', 'head']) {
    const p = manifest.parts[name]
    const deg = pose.rot[name] ?? 0
    const [sx, sy] = pose.shift[name] ?? [0, 0]
    if (deg === 0) {
      layers.push({ input: resolve(RIG, p.file), left: p.x + sx, top: p.y + sy })
      continue
    }
    // rotate around the part's pivot: rotate about center, then re-anchor
    const rotated = await sharp(resolve(RIG, p.file))
      .rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
    const meta = await sharp(rotated).metadata()
    const nw = meta.width ?? p.w
    const nh = meta.height ?? p.h
    const cx = p.x + p.w / 2
    const cy = p.y + p.h / 2
    const rad = (deg * Math.PI) / 180
    const vx = p.pivotX - cx
    const vy = p.pivotY - cy
    const rvx = vx * Math.cos(rad) - vy * Math.sin(rad)
    const rvy = vx * Math.sin(rad) + vy * Math.cos(rad)
    const left = Math.round(p.pivotX - rvx - nw / 2) + (pose.shift[name]?.[0] ?? 0)
    const top = Math.round(p.pivotY - rvy - nh / 2) + (pose.shift[name]?.[1] ?? 0)
    layers.push({ input: rotated, left, top })
  }
  return sharp({
    create: { width: design.w, height: design.h, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
  })
    .composite(layers)
    .png()
    .toBuffer()
}

async function main(): Promise<void> {
  const out = process.argv[2] ?? 'scratch/rig-preview.png'
  const { design } = manifest
  const frames: Buffer[] = []
  for (const pose of POSES) frames.push(await renderPose(pose))
  const gap = 12
  await sharp({
    create: {
      width: (design.w + gap) * frames.length,
      height: design.h + 28,
      channels: 4,
      background: { r: 240, g: 236, b: 248, alpha: 1 }
    }
  })
    .composite([
      ...frames.map((f, i) => ({ input: f, left: i * (design.w + gap), top: 0 })),
      {
        input: Buffer.from(
          `<svg width="${(design.w + gap) * frames.length}" height="24">${POSES.map(
            (p, i) =>
              `<text x="${i * (design.w + gap) + design.w / 2}" y="17" text-anchor="middle" font-family="Segoe UI" font-size="15" fill="#444">${p.name}</text>`
          ).join('')}</svg>`
        ),
        left: 0,
        top: design.h + 2
      }
    ])
    .png()
    .toFile(resolve(out))
  console.log(`preview: ${out}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
