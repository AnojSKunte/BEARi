/**
 * Sprite builder: turns reference artwork (character on a light background)
 * into a transparent-background sprite for the app.
 *
 * Removes the background by flood-filling from the image border (so white
 * clothing inside the character is preserved), trims, and writes the sprite
 * into the renderer's public assets.
 *
 * Usage:
 *   npx tsx scripts/build-sprites.ts --in reference/beari-sheet.png
 *     [--crop x,y,w,h] [--tol 42] [--out src/renderer/public/sprites/beari-main.png]
 */
import { mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import sharp from 'sharp'

interface Args {
  in: string
  out: string
  crop?: { x: number; y: number; w: number; h: number }
  tol: number
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const input = get('--in')
  if (!input) {
    console.error('Missing --in <file>')
    process.exit(1)
  }
  const cropRaw = get('--crop')
  return {
    in: resolve(input),
    out: resolve(get('--out') ?? 'src/renderer/public/sprites/beari-main.png'),
    tol: Number(get('--tol') ?? 42),
    crop: cropRaw
      ? (() => {
          const [x, y, w, h] = cropRaw.split(',').map(Number)
          return { x, y, w, h }
        })()
      : undefined
  }
}

async function main(): Promise<void> {
  const args = parseArgs()

  let img = sharp(args.in)
  if (args.crop) {
    img = img.extract({ left: args.crop.x, top: args.crop.y, width: args.crop.w, height: args.crop.h })
  }
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info

  const idx = (x: number, y: number): number => (y * width + x) * 4

  // Background reference color: average of the four corners.
  const corners = [idx(0, 0), idx(width - 1, 0), idx(0, height - 1), idx(width - 1, height - 1)]
  const bg = [0, 1, 2].map((c) => corners.reduce((s, i) => s + data[i + c], 0) / 4)

  const isBgLike = (i: number): boolean => {
    const dr = data[i] - bg[0]
    const dg = data[i + 1] - bg[1]
    const db = data[i + 2] - bg[2]
    return Math.sqrt(dr * dr + dg * dg + db * db) < args.tol
  }

  // BFS flood fill from every border pixel.
  const visited = new Uint8Array(width * height)
  const queue: number[] = []
  for (let x = 0; x < width; x++) {
    queue.push(x, 0, x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    queue.push(0, y, width - 1, y)
  }

  let cleared = 0
  while (queue.length) {
    const y = queue.pop()!
    const x = queue.pop()!
    if (x < 0 || y < 0 || x >= width || y >= height) continue
    const p = y * width + x
    if (visited[p]) continue
    visited[p] = 1
    const i = p * 4
    if (!isBgLike(i)) continue
    data[i + 3] = 0
    cleared++
    queue.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1)
  }

  // Soften the cutout edge: any opaque pixel adjacent to a cleared pixel
  // gets partial alpha for a 1px anti-aliased rim.
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = idx(x, y)
      if (data[i + 3] === 0) continue
      const nbs = [idx(x - 1, y), idx(x + 1, y), idx(x, y - 1), idx(x, y + 1)]
      if (nbs.some((n) => data[n + 3] === 0)) data[i + 3] = 190
    }
  }

  mkdirSync(dirname(args.out), { recursive: true })
  await sharp(data, { raw: { width, height, channels: 4 } })
    .trim({ threshold: 1 })
    .png()
    .toFile(args.out)

  console.log(`sprite written: ${args.out} (${cleared} bg px cleared of ${width * height})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
