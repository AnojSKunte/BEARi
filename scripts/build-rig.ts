/**
 * Rig builder — cuts BEARi's front artwork (316×550) into animatable layers
 * for the living-rig renderer, Live2D-style:
 *
 *   hair-l / hair-r  — the big back-hair masses (sway with lag)
 *   body             — kurta, dupatta, right arm, legs, sandals
 *   arm-l            — her waving arm (viewer-left), pivoted at the shoulder
 *   head             — face, bangs, glasses, earrings (tilt / turn / nod)
 *
 * Occlusion repair so parts can move without tearing:
 *   • hair extended ~12px inward under the head silhouette
 *   • scarf cloned up under the chin
 *   • kurta shoulder patched where the sleeve was lifted
 *
 * Outputs src/renderer/public/rig/*.png + manifest.json, and a validation
 * composite (rest pose + exploded preview) for visual QA.
 *
 * Usage: npx tsx scripts/build-rig.ts [validateOut]
 */
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import sharp from 'sharp'

const SRC = 'src/renderer/public/puppet/beari-front.png'
const OUT_DIR = resolve('src/renderer/public/rig')

type Poly = [number, number][]

const HEAD: Poly = [
  [66, 10], [242, 10], [260, 55], [264, 130], [256, 195], [252, 240],
  [236, 254], [206, 264], [158, 271], [110, 264], [80, 252], [58, 238],
  [50, 196], [45, 130], [50, 55]
]
const ARM_L: Poly = [
  [52, 299], [80, 301], [82, 371], [71, 379], [69, 421], [34, 423], [35, 383], [45, 340]
]
const HAIR_L: Poly = [
  [0, 25], [80, 25], [70, 110], [52, 190], [54, 250], [68, 292], [58, 318],
  [44, 356], [28, 475], [0, 475]
]
const HAIR_R: Poly = [
  [236, 25], [316, 25], [316, 475], [286, 475], [268, 420], [256, 370],
  [250, 330], [260, 300], [254, 250], [256, 190], [246, 110]
]

/**
 * Pivots in design-space coordinates. Hair pivots sit at the crown, inside
 * each mass's attachment point — the roots stay anchored under the head and
 * only the lengths sway, like real hair.
 */
const PIVOTS = {
  'hair-l': { x: 58, y: 80 },
  'hair-r': { x: 252, y: 74 },
  body: { x: 158, y: 545 },
  torso: { x: 158, y: 470 },
  'arm-l': { x: 68, y: 308 },
  head: { x: 158, y: 252 }
}

function inPoly(poly: Poly, x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

async function main(): Promise<void> {
  const { data, info } = await sharp(resolve(SRC)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  const idx = (x: number, y: number): number => (y * W + x) * 4

  // ---- claim map: 0 none/bg, 1 arm-l, 2 head, 3 hair-l, 4 hair-r, 5 body
  const claim = new Uint8Array(W * H)
  const isHairColor = (i: number): boolean => {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    return r < 135 && g < 122 && b < 128 && b <= r + 12
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y)
      if (data[i + 3] < 8) continue
      const p = y * W + x
      if (inPoly(ARM_L, x, y)) claim[p] = 1
      else if (inPoly(HEAD, x, y)) claim[p] = 2
      else if (inPoly(HAIR_L, x, y) && (y < 300 || isHairColor(i))) claim[p] = 3
      else if (inPoly(HAIR_R, x, y) && (y < 300 || isHairColor(i))) claim[p] = 4
      else claim[p] = 5
    }
  }

  // ---- build per-part RGBA buffers (full canvas, cropped at save time)
  const parts: Record<string, Uint8ClampedArray> = {}
  for (const name of ['arm-l', 'head', 'hair-l', 'hair-r', 'body']) parts[name] = new Uint8ClampedArray(W * H * 4)
  const CODE: Record<number, string> = { 1: 'arm-l', 2: 'head', 3: 'hair-l', 4: 'hair-r', 5: 'body' }
  for (let p = 0; p < W * H; p++) {
    const c = claim[p]
    if (!c) continue
    const buf = parts[CODE[c]]
    buf[p * 4] = data[p * 4]
    buf[p * 4 + 1] = data[p * 4 + 1]
    buf[p * 4 + 2] = data[p * 4 + 2]
    buf[p * 4 + 3] = data[p * 4 + 3]
  }

  // ---- occlusion repair -------------------------------------------------

  // 1. Hair: extend each row ~12px inward under the head, so head motion
  //    never exposes a gap between face edge and back hair.
  const extendHair = (buf: Uint8ClampedArray, side: 'l' | 'r'): void => {
    const DEPTH = 28
    for (let y = 25; y < 360; y++) {
      if (side === 'l') {
        let edge = -1
        for (let x = W - 1; x >= 0; x--) {
          if (buf[idx(x, y) + 3] > 100) { edge = x; break }
        }
        if (edge < 0) continue
        const s = idx(edge, y)
        for (let x = edge + 1; x <= Math.min(W - 1, edge + DEPTH); x++) {
          const t = idx(x, y)
          if (buf[t + 3] === 0) { buf[t] = buf[s]; buf[t + 1] = buf[s + 1]; buf[t + 2] = buf[s + 2]; buf[t + 3] = 255 }
        }
      } else {
        let edge = -1
        for (let x = 0; x < W; x++) {
          if (buf[idx(x, y) + 3] > 100) { edge = x; break }
        }
        if (edge < 0) continue
        const s = idx(edge, y)
        for (let x = edge - 1; x >= Math.max(0, edge - DEPTH); x--) {
          const t = idx(x, y)
          if (buf[t + 3] === 0) { buf[t] = buf[s]; buf[t + 1] = buf[s + 1]; buf[t + 2] = buf[s + 2]; buf[t + 3] = 255 }
        }
      }
    }
  }
  extendHair(parts['hair-l'], 'l')
  extendHair(parts['hair-r'], 'r')

  // Crown fill: raise each hair column up under the head's painted crown so
  // head rotation reveals dark hair behind it instead of a transparent gap.
  // Strictly limited to pixels hidden behind the head at rest.
  const headBuf = parts.head
  const crownFill = (buf: Uint8ClampedArray): void => {
    for (let x = 0; x < W; x++) {
      let top = -1
      for (let y = 12; y < 140; y++) {
        if (buf[idx(x, y) + 3] > 100) { top = y; break }
      }
      if (top < 20 || top > 130) continue
      const s = idx(x, top)
      for (let y = top - 1; y >= 10; y--) {
        const t2 = idx(x, y)
        if (buf[t2 + 3] === 0 && headBuf[t2 + 3] > 0) {
          buf[t2] = buf[s]; buf[t2 + 1] = buf[s + 1]; buf[t2 + 2] = buf[s + 2]; buf[t2 + 3] = 255
        }
      }
    }
  }
  crownFill(parts['hair-l'])
  crownFill(parts['hair-r'])

  // 2. Body: clone the scarf up under the chin (head tilt cover).
  const body = parts.body
  for (let y = 246; y <= 276; y++) {
    for (let x = 96; x <= 220; x++) {
      const t = idx(x, y)
      if (body[t + 3] !== 0) continue
      const s = idx(x, Math.min(H - 1, y + 24))
      if (body[s + 3] > 100) { body[t] = body[s]; body[t + 1] = body[s + 1]; body[t + 2] = body[s + 2]; body[t + 3] = 255 }
    }
  }
  // 3. Body: patch the kurta shoulder where the sleeve was removed.
  for (let y = 299; y <= 320; y++) {
    for (let x = 54; x <= 88; x++) {
      const t = idx(x, y)
      if (body[t + 3] !== 0) continue
      const s = idx(Math.min(W - 1, x + 32), y + 6)
      if (body[s + 3] > 100) { body[t] = body[s]; body[t + 1] = body[s + 1]; body[t + 2] = body[s + 2]; body[t + 3] = 255 }
    }
  }

  // ---- torso: the painted kurta + dupatta alone (both arms and the legs
  //      removed) — the hybrid performer attaches animated limbs to it.
  // The painting isn't symmetric — her right sleeve sits further in and the
  // hand holds the dupatta end, so the polygon is traced, not mirrored.
  const ARM_R: Poly = [
    [214, 301], [258, 299], [263, 340], [263, 383], [270, 422], [232, 424], [225, 380], [213, 371]
  ]
  const torso = new Uint8ClampedArray(body)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = idx(x, y)
      if (y < 236 || y > 472 || inPoly(ARM_R, x, y) || (torso[t + 3] > 0 && isHairColor(t))) torso[t + 3] = 0
    }
  }
  // patch the right shoulder like the left
  for (let y = 299; y <= 320; y++) {
    for (let x = W - 88; x <= W - 54; x++) {
      const t = idx(x, y)
      if (torso[t + 3] !== 0) continue
      const s = idx(Math.max(0, x - 32), y + 6)
      if (torso[s + 3] > 100) { torso[t] = torso[s]; torso[t + 1] = torso[s + 1]; torso[t + 2] = torso[s + 2]; torso[t + 3] = 255 }
    }
  }
  parts.torso = torso

  // ---- save cropped parts + manifest ------------------------------------
  mkdirSync(OUT_DIR, { recursive: true })
  interface Entry { file: string; x: number; y: number; w: number; h: number; pivotX: number; pivotY: number }
  const manifest: { design: { w: number; h: number }; parts: Record<string, Entry> } = {
    design: { w: W, h: H },
    parts: {}
  }
  for (const [name, buf] of Object.entries(parts)) {
    let minX = W, minY = H, maxX = 0, maxY = 0
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (buf[idx(x, y) + 3] > 0) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    const w = maxX - minX + 1
    const h = maxY - minY + 1
    const crop = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = idx(minX + x, minY + y)
        const d = (y * w + x) * 4
        crop[d] = buf[s]; crop[d + 1] = buf[s + 1]; crop[d + 2] = buf[s + 2]; crop[d + 3] = buf[s + 3]
      }
    }
    await sharp(Buffer.from(crop.buffer), { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toFile(resolve(OUT_DIR, `${name}.png`))
    const pivot = PIVOTS[name as keyof typeof PIVOTS]
    manifest.parts[name] = { file: `${name}.png`, x: minX, y: minY, w, h, pivotX: pivot.x, pivotY: pivot.y }
    console.log(`${name}.png  ${w}x${h} @ (${minX},${minY})`)
  }
  writeFileSync(resolve(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
  // Bundled copy — fetch() is blocked on file:// in packaged builds, so the
  // renderer imports the manifest instead of fetching it.
  writeFileSync(
    resolve('src/renderer/src/character/rig-manifest.json'),
    JSON.stringify(manifest, null, 2)
  )
  console.log(`manifest.json written — ${Object.keys(manifest.parts).length} parts`)

  // ---- validation composite --------------------------------------------
  const validateOut = process.argv[2]
  if (!validateOut) return
  const order = ['hair-l', 'hair-r', 'body', 'arm-l', 'head']
  const layer = (name: string, dx = 0, dy = 0): sharp.OverlayOptions => ({
    input: resolve(OUT_DIR, `${name}.png`),
    left: manifest.parts[name].x + dx,
    top: manifest.parts[name].y + dy
  })
  const rest = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite(order.map((n) => layer(n)))
    .png()
    .toBuffer()
  // "stress" preview: head shifted, hair swung, arm dropped — shows seams.
  const stress = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([
      layer('hair-l', -7, 2),
      layer('hair-r', 7, 2),
      layer('body'),
      layer('arm-l', -4, 3),
      layer('head', 7, -4)
    ])
    .png()
    .toBuffer()
  const original = await sharp(resolve(SRC)).flatten({ background: '#ffffff' }).png().toBuffer()
  await sharp({ create: { width: W * 3 + 20, height: H, channels: 4, background: { r: 240, g: 236, b: 248, alpha: 1 } } })
    .composite([
      { input: original, left: 0, top: 0 },
      { input: rest, left: W + 10, top: 0 },
      { input: stress, left: W * 2 + 20, top: 0 }
    ])
    .png()
    .toFile(resolve(validateOut))
  console.log(`validation: ${validateOut} (original | recomposed | stressed)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
