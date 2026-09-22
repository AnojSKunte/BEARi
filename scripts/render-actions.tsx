/**
 * Action choreography preview — drives the REAL Animator through every
 * action and renders the resulting frames through the REAL Beari renderer,
 * producing a labeled grid PNG for visual iteration. No app launch needed.
 *
 * Usage: npx tsx scripts/render-actions.tsx <outPng>
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { Animator } from '../src/renderer/src/character/engine/animator'
import { Beari } from '../src/renderer/src/character/Beari'
import { DEFAULT_OUTFIT } from '../src/shared/types'

interface Scene {
  name: string
  run: (a: Animator) => void
  seconds: number
}

const tick = (a: Animator, seconds: number): void => {
  const steps = Math.round(seconds / 0.016)
  for (let i = 0; i < steps; i++) a.tick(0.016)
}

const SCENES: Scene[] = [
  { name: 'idle', run: () => {}, seconds: 1.2 },
  {
    name: 'wave',
    run: (a) => {
      a.sleep()
      tick(a, 0.4)
      a.wake()
    },
    seconds: 0.62
  },
  { name: 'think', run: (a) => a.setThinking(true), seconds: 1.3 },
  { name: 'read', run: (a) => a.forceIdleAction('read', 12), seconds: 2.6 },
  { name: 'read-flip', run: (a) => a.forceIdleAction('read', 12), seconds: 3.35 },
  { name: 'coffee-sip', run: (a) => a.forceIdleAction('coffee', 12), seconds: 1.25 },
  { name: 'coffee-hold', run: (a) => a.forceIdleAction('coffee', 12), seconds: 2.6 },
  { name: 'magic', run: (a) => a.forceIdleAction('magic', 10), seconds: 1.6 },
  { name: 'sit', run: (a) => a.forceIdleAction('sit', 10), seconds: 2.2 },
  { name: 'stretch', run: (a) => a.forceIdleAction('stretch', 8), seconds: 1.5 },
  { name: 'dance', run: (a) => a.forceIdleAction('dance', 8), seconds: 1.35 },
  { name: 'glasses', run: (a) => a.forceIdleAction('adjustGlasses', 6), seconds: 0.9 },
  {
    name: 'walk-stride',
    run: (a) => {
      a.stageWidth = 2000
      a.walkTo(1600)
    },
    seconds: 0.6
  },
  {
    name: 'walk-pass',
    run: (a) => {
      a.stageWidth = 2000
      a.walkTo(1600)
    },
    seconds: 0.78
  },
  { name: 'sleep', run: (a) => a.sleep(), seconds: 3 },
  { name: 'celebrate', run: (a) => a.setEmotion('celebrating'), seconds: 0.55 },
  {
    name: 'drag',
    run: (a) => {
      a.startDrag()
      a.dragTo(120)
    },
    seconds: 1
  }
]

async function main(): Promise<void> {
  const out = process.argv[2] ?? 'scratch/actions.png'
  const CW = 300
  const CH = 360
  const cols = 6
  const rows = Math.ceil(SCENES.length / cols)
  const frames: { name: string; png: Buffer }[] = []

  for (const scene of SCENES) {
    const a = new Animator(110)
    a.stageWidth = 220
    if (scene.name !== 'sleep') a.debugEyeOpen = 1
    scene.run(a)
    tick(a, scene.seconds)
    const pose = { ...a.pose, x: 110 }
    const style = (process.argv[3] ?? 'kurta') as 'kurta' | 'frock' | 'croptop' | 'hoodie'
    const markup = renderToStaticMarkup(React.createElement(Beari, { pose, outfit: DEFAULT_OUTFIT, style }))
      .replace('width="100%" height="100%"', 'x="0" y="0" width="220" height="250"')
      // inline painted layers so the offline rasterizer can see them
      .replace(/href="\.\/(rig\/[^"]+)"/g, (_m, rel: string) => {
        const file = resolve('src/renderer/public', rel)
        const b64 = readFileSync(file).toString('base64')
        return `href="data:image/png;base64,${b64}"`
      })
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 250" width="${CW}" height="${Math.round((CW / 220) * 250)}">` +
      `<rect width="220" height="250" fill="#F6F1FC"/>` +
      markup +
      '</svg>'
    frames.push({ name: scene.name, png: await sharp(Buffer.from(svg)).png().toBuffer() })
  }

  const label = Buffer.from(
    `<svg width="${cols * CW}" height="${rows * CH}">${frames
      .map(
        (f, i) =>
          `<text x="${(i % cols) * CW + CW / 2}" y="${Math.floor(i / cols) * CH + CH - 8}" text-anchor="middle" font-family="Segoe UI" font-size="17" fill="#555">${f.name}</text>`
      )
      .join('')}</svg>`
  )
  await sharp({
    create: { width: cols * CW, height: rows * CH, channels: 4, background: { r: 238, g: 233, b: 246, alpha: 1 } }
  })
    .composite([
      ...frames.map((f, i) => ({
        input: f.png,
        left: (i % cols) * CW,
        top: Math.floor(i / cols) * CH + 6
      })),
      { input: label, left: 0, top: 0 }
    ])
    .png()
    .toFile(resolve(out))
  console.log(`actions preview: ${out}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
