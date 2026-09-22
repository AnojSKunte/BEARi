/**
 * Slices the BEARi reference sheets into named section files
 * (reference/sections/<sheet>/<section>.png) at original quality.
 *
 * Usage: npx tsx scripts/slice-reference.ts
 */
import { mkdirSync } from 'fs'
import { resolve } from 'path'
import sharp from 'sharp'

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const SHEETS: Record<string, { file: string; sections: Record<string, Box> }> = {
  'sheet-1-identity': {
    file: 'reference/sheet-1-character-identity.png',
    sections: {
      'hero-waving': { x: 250, y: 25, w: 430, h: 450 },
      'brand-card': { x: 20, y: 75, w: 235, h: 255 },
      'view-angles-front-side-back': { x: 700, y: 15, w: 725, h: 415 },
      'expressions-8': { x: 700, y: 445, w: 725, h: 460 },
      'color-palette': { x: 20, y: 495, w: 660, h: 130 },
      'outfit-details': { x: 20, y: 650, w: 660, h: 245 },
      personality: { x: 20, y: 905, w: 760, h: 165 },
      'about-beari': { x: 790, y: 905, w: 645, h: 165 }
    }
  },
  'sheet-2-actions': {
    file: 'reference/sheet-2-poses-actions-moods.png',
    sections: {
      turnaround: { x: 8, y: 8, w: 524, h: 224 },
      'expressions-21': { x: 8, y: 236, w: 524, h: 352 },
      'emotion-effects': { x: 8, y: 590, w: 524, h: 180 },
      'full-body-poses-15': { x: 538, y: 8, w: 500, h: 494 },
      'wardrobe-color-variations': { x: 538, y: 506, w: 500, h: 262 },
      'interactions-fun-actions': { x: 1042, y: 8, w: 486, h: 468 },
      'daily-moods': { x: 1042, y: 478, w: 486, h: 290 },
      'animated-action-sequence': { x: 8, y: 770, w: 700, h: 146 },
      'size-previews': { x: 712, y: 770, w: 410, h: 146 },
      'extra-accessories': { x: 1124, y: 770, w: 404, h: 146 },
      'personality-likes-dislikes': { x: 8, y: 916, w: 1520, h: 104 }
    }
  },
  'sheet-3-library': {
    file: 'reference/sheet-3-detailed-library.png',
    sections: {
      turnaround: { x: 8, y: 8, w: 512, h: 254 },
      'hand-poses': { x: 8, y: 266, w: 512, h: 224 },
      movements: { x: 8, y: 492, w: 512, h: 148 },
      'cursor-interactions': { x: 8, y: 648, w: 512, h: 170 },
      'wardrobe-outfits': { x: 8, y: 834, w: 562, h: 186 },
      'full-body-poses': { x: 528, y: 8, w: 512, h: 338 },
      'activities-contextual': { x: 528, y: 350, w: 512, h: 276 },
      'emotional-reactions': { x: 528, y: 628, w: 550, h: 170 },
      'fun-actions': { x: 572, y: 800, w: 514, h: 138 },
      'color-variations-strip': { x: 572, y: 940, w: 514, h: 80 },
      'expressions-18': { x: 1044, y: 8, w: 488, h: 390 },
      'idle-animations-loopable': { x: 1044, y: 400, w: 488, h: 228 },
      'magical-thinking-effects': { x: 1078, y: 630, w: 454, h: 224 },
      'accessories-props': { x: 1104, y: 856, w: 428, h: 164 }
    }
  },
  'sheet-4-master': {
    file: 'reference/sheet-4-master-numbered.png',
    sections: {
      turnaround: { x: 8, y: 4, w: 526, h: 248 },
      'expressions-24': { x: 540, y: 4, w: 540, h: 464 },
      'full-body-poses-20': { x: 1086, y: 4, w: 448, h: 530 },
      'actions-activities': { x: 8, y: 440, w: 512, h: 338 },
      'interactions-environment': { x: 536, y: 490, w: 548, h: 264 },
      'emotion-effects-overlays': { x: 1086, y: 538, w: 448, h: 198 },
      'wardrobe-variations': { x: 8, y: 780, w: 526, h: 200 },
      'mouth-shapes': { x: 8, y: 982, w: 512, h: 42 },
      'animated-action-sequence': { x: 536, y: 764, w: 472, h: 196 },
      'eye-states': { x: 536, y: 962, w: 550, h: 60 },
      'cursor-interactions': { x: 1004, y: 756, w: 530, h: 168 },
      'size-previews': { x: 1196, y: 928, w: 338, h: 94 }
    }
  }
}

async function main(): Promise<void> {
  for (const [sheetName, sheet] of Object.entries(SHEETS)) {
    const outDir = resolve('reference/sections', sheetName)
    mkdirSync(outDir, { recursive: true })
    const img = sharp(resolve(sheet.file))
    const meta = await img.metadata()
    for (const [name, box] of Object.entries(sheet.sections)) {
      const left = Math.max(0, box.x)
      const top = Math.max(0, box.y)
      const width = Math.min(box.w, (meta.width ?? 0) - left)
      const height = Math.min(box.h, (meta.height ?? 0) - top)
      await sharp(resolve(sheet.file))
        .extract({ left, top, width, height })
        .png()
        .toFile(resolve(outDir, `${name}.png`))
    }
    console.log(`${sheetName}: ${Object.keys(sheet.sections).length} sections`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
