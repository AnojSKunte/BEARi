/**
 * Generates the app icon from BEARi's front artwork: a head-and-shoulders
 * crop centered on a soft lavender rounded-square, at the sizes electron-builder
 * needs. Writes build/icon.png (512²) + build/icon-256.png.
 *
 * Usage: npx tsx scripts/make-icon.ts
 */
import { mkdirSync } from 'fs'
import { resolve } from 'path'
import sharp from 'sharp'

const SRC = 'src/renderer/public/puppet/beari-front.png'
const OUT_DIR = 'build'

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })

  const S = 512
  const pad = 46
  const radius = 112

  // Head-and-shoulders crop reads best at small sizes.
  const crop = await sharp(resolve(SRC))
    .extract({ left: 24, top: 96, width: 268, height: 300 })
    .resize(S - pad * 2, S - pad * 2, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()

  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
       <defs>
         <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0%" stop-color="#EAD8F7"/>
           <stop offset="100%" stop-color="#C9A8F0"/>
         </linearGradient>
       </defs>
       <rect x="6" y="6" width="${S - 12}" height="${S - 12}" rx="${radius}" fill="url(#g)"/>
     </svg>`
  )

  await sharp(bg)
    .composite([{ input: crop, top: pad + 8, left: pad }])
    .png()
    .toFile(resolve(OUT_DIR, 'icon.png'))

  await sharp(resolve(OUT_DIR, 'icon.png')).resize(256, 256).toFile(resolve(OUT_DIR, 'icon-256.png'))

  console.log('wrote build/icon.png (512) + build/icon-256.png')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
