/**
 * Dev tool: renders BEARi (the React SVG component) into a PNG character
 * sheet so her look can be reviewed and iterated without launching the app.
 *
 * Usage: npx tsx scripts/render-sheet.tsx [outPath]
 */
import { mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import { Beari } from '../src/renderer/src/character/Beari'
import { restPose } from '../src/renderer/src/character/engine/pose'
import type { Pose } from '../src/renderer/src/character/engine/pose'
import { DEFAULT_OUTFIT } from '../src/shared/types'

const CELL_W = 220
const CELL_H = 250
const COLS = 5

function posed(mutate: (p: Pose) => void): Pose {
  const p = restPose(110)
  mutate(p)
  return p
}

const VARIANTS: { label: string; pose: Pose; outfit?: typeof DEFAULT_OUTFIT }[] = [
  { label: 'Rest', pose: posed(() => {}) },
  {
    label: 'Happy',
    pose: posed((p) => {
      p.emotion = 'happy'
      p.mouth = 'openSmile'
      p.browRaise = 0.5
      p.armR = -160
    })
  },
  {
    label: 'Thinking',
    pose: posed((p) => {
      p.emotion = 'thinking'
      p.mouth = 'flat'
      p.armR = -128
      p.lookX = 0.35
      p.lookY = -0.7
      p.headTilt = -5
    })
  },
  {
    label: 'Excited',
    pose: posed((p) => {
      p.emotion = 'excited'
      p.mouth = 'openSmile'
      p.browRaise = 1
      p.armL = 150
      p.armR = -150
      p.lift = 8
    })
  },
  {
    label: 'Confused',
    pose: posed((p) => {
      p.emotion = 'confused'
      p.mouth = 'o'
      p.browRaise = 0.7
      p.headTilt = 8
    })
  },
  {
    label: 'Sad',
    pose: posed((p) => {
      p.emotion = 'sad'
      p.mouth = 'sad'
      p.browRaise = -0.8
      p.lookY = 0.5
    })
  },
  {
    label: 'Blushing',
    pose: posed((p) => {
      p.emotion = 'blushing'
      p.mouth = 'grin'
      p.lookX = -0.4
      p.headTilt = 4
    })
  },
  {
    label: 'Walk',
    pose: posed((p) => {
      p.legPhase = 1.2
      p.legSwing = 1
      p.lift = 4
      p.bodyTilt = 2
      p.armL = 14
      p.armR = 10
      p.hairSway = -8
      p.scarfSway = -10
    })
  },
  {
    label: 'Sleep',
    pose: posed((p) => {
      p.sitting = true
      p.eyeOpen = 0
      p.emotion = 'sleepy'
      p.mouth = 'sleepy'
      p.headTilt = 14
      p.bodyTilt = 4
    })
  },
  {
    label: 'Look left',
    pose: posed((p) => {
      p.lookX = -1
      p.lookY = 0.2
    })
  },
  {
    label: 'Blink mid',
    pose: posed((p) => {
      p.eyeOpen = 0.35
    })
  },
  {
    label: 'Facing left',
    pose: posed((p) => {
      p.facing = -1
    })
  },
  {
    label: 'Blue outfit',
    pose: posed((p) => {
      p.emotion = 'happy'
      p.mouth = 'openSmile'
    }),
    outfit: {
      ...DEFAULT_OUTFIT,
      dress: '#7EA8E8',
      dressTrim: '#5E86C8',
      hairAccessory: '#5E86C8'
    }
  }
]

function main(): void {
  const rows = Math.ceil(VARIANTS.length / COLS)
  const cells = VARIANTS.map((v, i) => {
    const x = (i % COLS) * CELL_W
    const y = Math.floor(i / COLS) * (CELL_H + 22)
    const markup = renderToStaticMarkup(
      React.createElement(Beari, { pose: v.pose, outfit: v.outfit ?? DEFAULT_OUTFIT })
    ).replace('width="100%" height="100%"', `x="${x}" y="${y}" width="${CELL_W}" height="${CELL_H}"`)
    const label = `<text x="${x + CELL_W / 2}" y="${y + CELL_H + 15}" text-anchor="middle" font-family="Segoe UI" font-size="13" fill="#5b4a78">${v.label}</text>`
    return markup + label
  })

  const totalW = COLS * CELL_W
  const totalH = rows * (CELL_H + 22)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW * 2}" height="${totalH * 2}">` +
    `<rect width="${totalW}" height="${totalH}" fill="#F5EFFC"/>` +
    cells.join('') +
    '</svg>'

  const out = resolve(process.argv[2] ?? 'scratch/beari-sheet.png')
  mkdirSync(dirname(out), { recursive: true })
  sharp(Buffer.from(svg))
    .png()
    .toFile(out)
    .then(() => console.log(`written: ${out}`))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}

main()
