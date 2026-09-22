/**
 * Dev tool: renders a single BEARi pose to PNG (white background).
 * Used to test the sprite pipeline end-to-end until real artwork exists.
 *
 * Usage: npx tsx scripts/render-pose.tsx [outPath]
 */
import { mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import { Beari } from '../src/renderer/src/character/Beari'
import { restPose } from '../src/renderer/src/character/engine/pose'
import { DEFAULT_OUTFIT } from '../src/shared/types'

const pose = restPose(110)
pose.emotion = 'happy'
pose.mouth = 'openSmile'

const markup = renderToStaticMarkup(
  React.createElement(Beari, { pose, outfit: DEFAULT_OUTFIT })
).replace('width="100%" height="100%"', 'x="0" y="0" width="220" height="250"')

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 250" width="880" height="1000">' +
  '<rect width="220" height="250" fill="#FFFFFF"/>' +
  markup +
  '</svg>'

const out = resolve(process.argv[2] ?? 'scratch/beari-pose.png')
mkdirSync(dirname(out), { recursive: true })
sharp(Buffer.from(svg))
  .png()
  .toFile(out)
  .then(() => console.log(`written: ${out}`))
