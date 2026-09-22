import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import * as THREE from 'three'
import type { OutfitColors } from '@shared/types'
import type { Pose, MouthShape } from './engine/pose'

/**
 * BEARi in real 3D — a procedurally built, fully rigged three.js model of
 * her, to her reference sheet's proportions (chibi, ~3.5 heads):
 *
 *   • soft-lit skin, a painted face that ANIMATES (blink, mouth shapes,
 *     eye tracking, brows, blush) on a curved face shell
 *   • voluminous wavy hair in lobes that sway, round pink glasses, gold hoops
 *   • lavender kurta, white dupatta, leggings, sandals — outfit recolorable
 *   • a real skeleton: shoulders, elbows, hips, knees — every action she
 *     performs in 2D she performs here with depth; she turns toward where
 *     she walks and toward your cursor in true 3D
 *   • real props in her hands (book, steaming mug, wand, teddy)
 *   • key light with soft shadows onto an invisible floor — a true drop shadow
 *
 * Driven purely by the shared Pose from the Animator. Falls back to the 2D
 * performer if WebGL is unavailable or the context is lost.
 *
 * Model space: units ≈ the 2D canvas (feet at y=0, head top ≈ y=215).
 */

const deg = (d: number): number => (d * Math.PI) / 180
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))
const MODEL_H = 215
const BASE_PX = 310

const SKIN = 0xfbe3c9
const HAIR = 0x33231b
const HAIR_HI = 0x4a3427
const GOLD = 0xd9a441
const BOOK = 0x8b6bc9
const PAGE = 0xfff9ee
const MUG = 0xc9a2e0
const TEDDY = 0xc89b6b
const TEDDY_BELLY = 0xe8cba4

interface Rig {
  root: THREE.Group
  body: THREE.Group
  torso: THREE.Group
  head: THREE.Group
  hairSideL: THREE.Group
  hairSideR: THREE.Group
  hairBack: THREE.Group
  shoulderL: THREE.Group
  shoulderR: THREE.Group
  elbowL: THREE.Group
  elbowR: THREE.Group
  handL: THREE.Group
  handR: THREE.Group
  hipL: THREE.Group
  hipR: THREE.Group
  kneeL: THREE.Group
  kneeR: THREE.Group
  kurta: THREE.Mesh
  dupattaTail: THREE.Mesh
  book: THREE.Group
  mug: THREE.Group
  wand: THREE.Group
  teddy: THREE.Group
  steam: THREE.Mesh[]
  star: THREE.Mesh
  face: FacePainter
  materials: { dress: THREE.MeshStandardMaterial; trim: THREE.MeshStandardMaterial; scarf: THREE.MeshStandardMaterial; leggings: THREE.MeshStandardMaterial; shoes: THREE.MeshStandardMaterial; glasses: THREE.MeshStandardMaterial; clip: THREE.MeshStandardMaterial }
}

// ---------------------------------------------------------------- face painter

/** Paints her face onto a canvas texture wrapped on the face shell. */
class FacePainter {
  readonly texture: THREE.CanvasTexture
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private key = ''

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.width = 512
    this.canvas.height = 512
    this.ctx = this.canvas.getContext('2d')!
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.anisotropy = 4
  }

  paint(p: Pose, blushAmt: number): void {
    const open = Math.round(p.eyeOpen * 20) / 20
    const lx = Math.round(p.lookX * 10) / 10
    const ly = Math.round(p.lookY * 10) / 10
    const br = Math.round(p.browRaise * 10) / 10
    const key = `${open}|${lx}|${ly}|${br}|${p.mouth}|${blushAmt.toFixed(2)}|${p.emotion}`
    if (key === this.key) return
    this.key = key

    const c = this.ctx
    c.clearRect(0, 0, 512, 512)

    // blush
    for (const bx of [86, 426]) {
      const g = c.createRadialGradient(bx, 300, 4, bx, 300, 46)
      g.addColorStop(0, `rgba(244,155,165,${0.85 * blushAmt})`)
      g.addColorStop(1, 'rgba(244,155,165,0)')
      c.fillStyle = g
      c.beginPath()
      c.ellipse(bx, 300, 50, 30, 0, 0, Math.PI * 2)
      c.fill()
    }

    // brows
    c.strokeStyle = '#3a2718'
    c.lineWidth = 9
    c.lineCap = 'round'
    const browY = 188 - br * 10
    const sad = p.emotion === 'sad'
    c.beginPath()
    c.moveTo(108, browY + (sad ? 8 : 0))
    c.quadraticCurveTo(150, browY - 16 - br * 6, 192, browY - 4)
    c.stroke()
    c.beginPath()
    c.moveTo(320, browY - 4)
    c.quadraticCurveTo(362, browY - 16 - br * 6, 404, browY + (sad ? 8 : 0))
    c.stroke()

    // eyes
    const sparkle = p.emotion === 'excited' || p.emotion === 'celebrating'
    for (const ex of [156, 356]) {
      const ey = 268
      const px = lx * 12
      const py = ly * 9
      c.save()
      c.translate(ex + px, ey + py)
      c.scale(1, Math.max(0.06, open))
      // iris + pupil
      c.fillStyle = '#2e1b12'
      c.beginPath()
      c.ellipse(0, 0, 40, 46, 0, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = '#5b3a22'
      c.beginPath()
      c.ellipse(0, 5, 31, 36, 0, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = '#2e1b12'
      c.beginPath()
      c.ellipse(0, 6, 17, 21, 0, 0, Math.PI * 2)
      c.fill()
      // highlights
      c.fillStyle = '#ffffff'
      c.beginPath()
      c.arc(-13, -17, 14, 0, Math.PI * 2)
      c.fill()
      c.beginPath()
      c.arc(14, 15, 6.5, 0, Math.PI * 2)
      c.fill()
      if (sparkle) {
        c.fillStyle = '#fff3fa'
        c.beginPath()
        c.arc(19, -19, 5.5, 0, Math.PI * 2)
        c.fill()
      }
      // upper lash
      c.fillStyle = '#2e1b12'
      c.beginPath()
      c.ellipse(0, -2, 44, 50, 0, Math.PI * 1.08, Math.PI * 1.92)
      c.ellipse(0, 2, 40, 46, 0, Math.PI * 1.92, Math.PI * 1.08, true)
      c.fill()
      c.restore()
      if (open < 0.15) {
        c.strokeStyle = '#2e1b12'
        c.lineWidth = 8
        c.beginPath()
        c.moveTo(ex - 34, ey + 6)
        c.quadraticCurveTo(ex, ey + 24, ex + 34, ey + 6)
        c.stroke()
      }
    }

    // nose
    c.strokeStyle = 'rgba(227,174,133,0.85)'
    c.lineWidth = 6
    c.beginPath()
    c.moveTo(247, 318)
    c.quadraticCurveTo(256, 326, 265, 318)
    c.stroke()

    // mouth
    this.mouth(p.mouth)
    this.texture.needsUpdate = true
  }

  private mouth(shape: MouthShape): void {
    const c = this.ctx
    const cx = 256
    const cy = 360
    c.lineCap = 'round'
    switch (shape) {
      case 'openSmile': {
        c.fillStyle = '#7e3d46'
        c.beginPath()
        c.moveTo(cx - 58, cy - 16)
        c.quadraticCurveTo(cx, cy - 2, cx + 58, cy - 16)
        c.bezierCurveTo(cx + 62, cy + 40, cx + 34, cy + 70, cx, cy + 70)
        c.bezierCurveTo(cx - 34, cy + 70, cx - 62, cy + 40, cx - 58, cy - 16)
        c.fill()
        c.fillStyle = '#ffffff'
        c.beginPath()
        c.moveTo(cx - 52, cy - 10)
        c.quadraticCurveTo(cx, cy + 2, cx + 52, cy - 10)
        c.lineTo(cx + 48, cy + 12)
        c.quadraticCurveTo(cx, cy + 24, cx - 48, cy + 12)
        c.fill()
        c.fillStyle = '#e4707f'
        c.beginPath()
        c.ellipse(cx, cy + 48, 28, 17, 0, 0, Math.PI * 2)
        c.fill()
        c.strokeStyle = '#b45a62'
        c.lineWidth = 5
        c.beginPath()
        c.moveTo(cx - 58, cy - 16)
        c.quadraticCurveTo(cx, cy - 2, cx + 58, cy - 16)
        c.stroke()
        break
      }
      case 'o':
        c.fillStyle = '#7e3d46'
        c.beginPath()
        c.ellipse(cx, cy + 6, 17, 22, 0, 0, Math.PI * 2)
        c.fill()
        break
      case 'flat':
        c.strokeStyle = '#b45a62'
        c.lineWidth = 9
        c.beginPath()
        c.moveTo(cx - 28, cy + 2)
        c.lineTo(cx + 28, cy + 2)
        c.stroke()
        break
      case 'sad':
        c.strokeStyle = '#b45a62'
        c.lineWidth = 9
        c.beginPath()
        c.moveTo(cx - 32, cy + 18)
        c.quadraticCurveTo(cx, cy - 12, cx + 32, cy + 18)
        c.stroke()
        break
      case 'grin':
        c.strokeStyle = '#b45a62'
        c.lineWidth = 10
        c.beginPath()
        c.moveTo(cx - 42, cy - 6)
        c.quadraticCurveTo(cx, cy + 30, cx + 42, cy - 6)
        c.stroke()
        break
      case 'sleepy':
        c.fillStyle = '#7e3d46'
        c.beginPath()
        c.ellipse(cx, cy + 6, 12, 9, 0, 0, Math.PI * 2)
        c.fill()
        break
      default:
        c.strokeStyle = '#b45a62'
        c.lineWidth = 9
        c.beginPath()
        c.moveTo(cx - 32, cy - 6)
        c.quadraticCurveTo(cx, cy + 24, cx + 32, cy - 6)
        c.stroke()
    }
  }
}

// ---------------------------------------------------------------- builders

function mat(color: number | string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, ...opts })
}

function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, material)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function group(x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  return g
}

/** Procedural paisley pattern for the kurta. */
function kurtaTexture(dress: string, trim: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const ctx = c.getContext('2d')!
  ctx.fillStyle = dress
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.lineWidth = 1.6
  const paisley = (x: number, y: number, s: number, r: number): void => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(r)
    ctx.scale(s, s)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(8, -3, 10, -13, 5, -18)
    ctx.bezierCurveTo(-1, -23, -10, -17, -8, -9)
    ctx.bezierCurveTo(-7, -3, -4, 1, 0, 0)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(-3, -9)
    ctx.quadraticCurveTo(0, -14, 4, -10)
    ctx.stroke()
    ctx.restore()
  }
  for (let i = 0; i < 26; i++) {
    const x = (i * 97) % 256
    const y = (i * 61 + 30) % 256
    paisley(x, y, 0.9 + (i % 3) * 0.25, (i % 5) * 0.6)
  }
  // hem border
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(0, 224, 256, 22)
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, 226)
  ctx.lineTo(256, 226)
  ctx.moveTo(0, 244)
  ctx.lineTo(256, 244)
  ctx.stroke()
  ctx.fillStyle = trim
  ctx.globalAlpha = 0.35
  ctx.fillRect(0, 246, 256, 10)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.repeat.set(2, 1)
  return t
}

function buildRig(outfit: OutfitColors): Rig {
  const skinMat = mat(SKIN)
  const hairMat = mat(HAIR, { roughness: 0.75 })
  const hairHiMat = mat(HAIR_HI, { roughness: 0.7 })
  const dress = mat(outfit.dress, { map: kurtaTexture(outfit.dress, outfit.dressTrim) })
  const trim = mat(outfit.dressTrim)
  const scarf = mat(outfit.scarf, { roughness: 0.95 })
  const leggings = mat(outfit.leggings)
  const shoes = mat(outfit.shoes)
  const glasses = mat(outfit.glasses, { roughness: 0.4, metalness: 0.15 })
  const clip = mat(outfit.hairAccessory, { roughness: 0.4 })
  const gold = mat(GOLD, { roughness: 0.35, metalness: 0.7 })

  const root = new THREE.Group()
  const body = group(0, 0, 0)
  root.add(body)

  // ------------------------------------------------------------ legs
  const legs: { hip: THREE.Group; knee: THREE.Group }[] = []
  for (const side of [-1, 1]) {
    const hip = group(side * 10, 47, 0)
    const thigh = mesh(new THREE.CapsuleGeometry(6.2, 12, 6, 14), leggings, 0, -8, 0)
    hip.add(thigh)
    const knee = group(0, -16, 0)
    hip.add(knee)
    const calf = mesh(new THREE.CapsuleGeometry(5.6, 10, 6, 14), leggings, 0, -6.5, 0)
    knee.add(calf)
    // foot + sandal
    const foot = mesh(new THREE.SphereGeometry(6, 14, 10), skinMat, 0, -13, 3)
    foot.scale.set(1, 0.55, 1.35)
    knee.add(foot)
    const sole = mesh(new THREE.BoxGeometry(12.5, 2.4, 18), shoes, 0, -15.6, 4)
    knee.add(sole)
    const strap = mesh(new THREE.TorusGeometry(5.2, 1.1, 8, 16), shoes, 0, -13.2, 4)
    strap.rotation.x = Math.PI / 2
    strap.scale.set(1.15, 1.1, 0.5)
    knee.add(strap)
    body.add(hip)
    legs.push({ hip, knee })
  }

  // ------------------------------------------------------------ torso (kurta)
  const torso = group(0, 47, 0)
  body.add(torso)
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(34, 0),
    new THREE.Vector2(33.5, 4),
    new THREE.Vector2(31.5, 26),
    new THREE.Vector2(30, 50),
    new THREE.Vector2(29.5, 66),
    new THREE.Vector2(28, 76),
    new THREE.Vector2(20, 80),
    new THREE.Vector2(0, 80)
  ]
  const kurta = mesh(new THREE.LatheGeometry(profile, 40), dress)
  kurta.scale.set(1, 1, 0.68)
  torso.add(kurta)
  // placket embroidery
  const placket = mesh(new THREE.BoxGeometry(2, 22, 1), mat(0xffffff, { roughness: 0.6 }), 0, 62, 21)
  torso.add(placket)

  // ------------------------------------------------------------ dupatta
  const collar = mesh(new THREE.TorusGeometry(24, 6.5, 12, 36), scarf, 0, 75, 3)
  collar.rotation.x = Math.PI / 2 + deg(12)
  collar.scale.set(1.05, 1, 0.8)
  torso.add(collar)
  const dupattaTail = mesh(new THREE.BoxGeometry(13, 58, 1.6), scarf, -14, 44, 24)
  dupattaTail.rotation.z = deg(-4)
  dupattaTail.rotation.x = deg(6)
  torso.add(dupattaTail)
  const tailR = mesh(new THREE.BoxGeometry(11, 36, 1.6), scarf, 18, 52, 21)
  tailR.rotation.z = deg(7)
  tailR.rotation.x = deg(6)
  torso.add(tailR)

  // ------------------------------------------------------------ arms
  const arms: { shoulder: THREE.Group; elbow: THREE.Group; hand: THREE.Group }[] = []
  for (const side of [-1, 1]) {
    const shoulder = group(side * 35, 121, 4)
    const shoulderCap = mesh(new THREE.SphereGeometry(7.2, 14, 12), dress)
    shoulder.add(shoulderCap)
    const upper = mesh(new THREE.CapsuleGeometry(6.6, 16, 6, 14), dress, 0, -11, 0)
    shoulder.add(upper)
    const elbow = group(0, -23, 0)
    shoulder.add(elbow)
    const cuff = mesh(new THREE.CylinderGeometry(6.4, 6.9, 6, 16), scarf, 0, -1, 0)
    elbow.add(cuff)
    const fore = mesh(new THREE.CapsuleGeometry(4.6, 12, 6, 12), skinMat, 0, -9, 0)
    elbow.add(fore)
    const hand = group(0, -19, 0)
    elbow.add(hand)
    const palm = mesh(new THREE.SphereGeometry(6, 14, 12), skinMat)
    palm.scale.set(1, 1.1, 0.75)
    hand.add(palm)
    body.add(shoulder)
    arms.push({ shoulder, elbow, hand })
  }

  // ------------------------------------------------------------ head
  const neck = mesh(new THREE.CylinderGeometry(8, 9, 16, 16), skinMat, 0, 128, 0)
  body.add(neck)
  const head = group(0, 160, 0)
  body.add(head)
  const skull = mesh(new THREE.SphereGeometry(45, 40, 32), skinMat)
  skull.scale.set(1.02, 0.97, 0.94)
  head.add(skull)
  // ears
  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(7, 12, 10), skinMat, side * 43, -6, -2)
    ear.scale.set(0.5, 1, 0.8)
    head.add(ear)
    const hoop = mesh(new THREE.TorusGeometry(4.2, 1.2, 8, 20), gold, side * 45, -19, 2)
    head.add(hoop)
  }
  // face shell with the painted, animated face
  const face = new FacePainter()
  const faceMat = new THREE.MeshStandardMaterial({
    map: face.texture,
    transparent: true,
    roughness: 0.9,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2
  })
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(45.4, 48, 32, Math.PI / 2 - deg(62), deg(124), deg(40), deg(96)),
    faceMat
  )
  shell.scale.set(1.02, 0.97, 0.94)
  head.add(shell)

  // glasses
  for (const side of [-1, 1]) {
    const ring = mesh(new THREE.TorusGeometry(16.5, 1.7, 10, 40), glasses, side * 18.5, 0, 41)
    ring.castShadow = false
    head.add(ring)
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(16, 32),
      new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.2 })
    )
    lens.position.set(side * 18.5, 0, 40.5)
    head.add(lens)
    const temple = mesh(new THREE.CylinderGeometry(1, 1, 30, 8), glasses, side * 37, 4, 26)
    temple.rotation.x = Math.PI / 2
    temple.rotation.z = side * deg(8)
    temple.castShadow = false
    head.add(temple)
  }
  const bridge = mesh(new THREE.CylinderGeometry(1.2, 1.2, 5, 8), glasses, 0, 2, 41)
  bridge.rotation.z = Math.PI / 2
  head.add(bridge)

  // hair: crown cap (front + top), back hemisphere, temple locks, side
  // waves, back mass
  const crown = mesh(new THREE.SphereGeometry(50, 40, 28, 0, Math.PI * 2, 0, deg(66)), hairMat, 0, 4, -2)
  crown.scale.set(1.05, 1.0, 1.02)
  head.add(crown)
  const backCap = mesh(new THREE.SphereGeometry(50, 40, 24, Math.PI, Math.PI, deg(30), deg(130)), hairMat, 0, 4, -2)
  head.add(backCap)
  // swept bangs: two soft lobes sloping from the centre part down to the
  // temples — gives the M-shaped hairline and an implied parting
  for (const side of [-1, 1]) {
    const bang = mesh(new THREE.SphereGeometry(24, 24, 18), hairMat, side * 20, 36, 30)
    bang.scale.set(1.15, 0.6, 0.75)
    bang.rotation.z = side * deg(-24)
    head.add(bang)
  }
  const parting = mesh(new THREE.SphereGeometry(3, 10, 8), hairHiMat, 0, 46, 33)
  parting.scale.set(0.5, 1.8, 0.6)
  parting.castShadow = false
  head.add(parting)
  // temple locks: hair hugging the sides of the face from the crown down
  for (const side of [-1, 1]) {
    const temple = mesh(new THREE.SphereGeometry(16, 20, 16), hairMat, side * 41, 20, 16)
    temple.scale.set(0.7, 1.5, 0.9)
    head.add(temple)
  }
  // hair clip
  for (const dz of [0, 6]) {
    const pin = mesh(new THREE.BoxGeometry(12, 1.8, 1.4), clip, 34, 33 - dz * 0.9, 24 + dz)
    pin.rotation.z = deg(-28)
    pin.castShadow = false
    head.add(pin)
  }

  const hairSideL = group(-41, 2, 6)
  const hairSideR = group(41, 2, 6)
  for (const [g, side] of [
    [hairSideL, -1],
    [hairSideR, 1]
  ] as [THREE.Group, number][]) {
    // one flowing wave per side: overlapping soft capsules, drifting outward
    const waves = [
      { r: 14, len: 22, y: -4, x: 0, z: 0, tilt: 0.05 },
      { r: 13, len: 18, y: -30, x: side * 4, z: 2, tilt: -0.12 },
      { r: 11.5, len: 14, y: -54, x: side * 7.5, z: 3, tilt: 0.14 }
    ]
    for (const wv of waves) {
      const m = mesh(new THREE.CapsuleGeometry(wv.r, wv.len, 8, 18), hairMat, wv.x, wv.y, wv.z)
      m.scale.set(1, 1, 0.85)
      m.rotation.z = side * wv.tilt
      g.add(m)
    }
    head.add(g)
  }
  const hairBack = group(0, -12, -30)
  const mass = mesh(new THREE.SphereGeometry(46, 32, 24), hairMat, 0, -16, 0)
  mass.scale.set(1.15, 1.3, 0.6)
  hairBack.add(mass)
  for (const side of [-1, 1]) {
    for (const [i, y] of [-56, -76].entries()) {
      const lobe = mesh(new THREE.SphereGeometry(16 - i * 2, 18, 14), hairMat, side * (26 + i * 3), y, 4)
      lobe.scale.set(1, 1.2, 0.7)
      hairBack.add(lobe)
    }
  }
  head.add(hairBack)

  // ------------------------------------------------------------ props
  const book = group(0, 92, 30)
  const bookScale = 1
  for (const side of [-1, 1]) {
    const cover = mesh(new THREE.BoxGeometry(22, 16, 1.4), mat(BOOK, { roughness: 0.6 }), side * 11, 0, 0)
    cover.rotation.y = side * deg(-28)
    book.add(cover)
    const pages = mesh(new THREE.BoxGeometry(20, 14, 1.6), mat(PAGE), side * 10.5, 0.4, 1.2)
    pages.rotation.y = side * deg(-28)
    book.add(pages)
  }
  book.scale.setScalar(bookScale)
  book.visible = false
  torso.add(book)

  const mug = group(0, -4, 6)
  const cup = mesh(new THREE.CylinderGeometry(5.6, 4.8, 12, 20), mat(MUG), 0, 0, 0)
  mug.add(cup)
  const coffee = mesh(new THREE.CylinderGeometry(5.2, 5.2, 1, 20), mat(0x6b4f3b), 0, 5.8, 0)
  coffee.castShadow = false
  mug.add(coffee)
  const handle = mesh(new THREE.TorusGeometry(3.6, 1.2, 8, 20), mat(MUG), 6.2, 0, 0)
  mug.add(handle)
  const steam: THREE.Mesh[] = []
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(2.2 - i * 0.4, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, roughness: 1 })
    )
    s.position.set((i - 1) * 2, 9 + i * 5, 0)
    mug.add(s)
    steam.push(s)
  }
  mug.visible = false

  const wand = group(0, 0, 0)
  const stick = mesh(new THREE.CylinderGeometry(1.1, 1.4, 28, 8), mat(0xb98bd6, { roughness: 0.5 }), 0, 12, 0)
  wand.add(stick)
  const starShape = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 6.5 : 2.8
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) starShape.moveTo(x, y)
    else starShape.lineTo(x, y)
  }
  starShape.closePath()
  const star = mesh(new THREE.ExtrudeGeometry(starShape, { depth: 1.6, bevelEnabled: false }), gold, 0, 29, -0.8)
  wand.add(star)
  wand.visible = false

  const teddy = group(0, 60, 26)
  const tBody = mesh(new THREE.SphereGeometry(9, 16, 12), mat(TEDDY), 0, 0, 0)
  tBody.scale.set(1.05, 1, 0.9)
  teddy.add(tBody)
  const tBelly = mesh(new THREE.SphereGeometry(5.5, 12, 10), mat(TEDDY_BELLY), 0, -1, 7)
  tBelly.scale.set(1, 0.9, 0.5)
  teddy.add(tBelly)
  const tHead = mesh(new THREE.SphereGeometry(7.5, 16, 12), mat(TEDDY), 0, 11, 1)
  teddy.add(tHead)
  const tMuzzle = mesh(new THREE.SphereGeometry(3, 10, 8), mat(TEDDY_BELLY), 0, 9.5, 7)
  tMuzzle.scale.set(1.3, 0.9, 0.7)
  teddy.add(tMuzzle)
  for (const side of [-1, 1]) {
    teddy.add(mesh(new THREE.SphereGeometry(3.2, 10, 8), mat(TEDDY), side * 6.5, 17, 0))
    teddy.add(mesh(new THREE.SphereGeometry(3.4, 10, 8), mat(TEDDY), side * 9.5, -6, 3))
    const eye = mesh(new THREE.SphereGeometry(0.9, 6, 6), mat(0x20140f), side * 2.6, 12.5, 7.6)
    eye.castShadow = false
    teddy.add(eye)
  }
  teddy.visible = false
  torso.add(teddy)

  arms[1].hand.add(mug)
  arms[1].hand.add(wand)

  return {
    root,
    body,
    torso,
    head,
    hairSideL,
    hairSideR,
    hairBack,
    shoulderL: arms[0].shoulder,
    shoulderR: arms[1].shoulder,
    elbowL: arms[0].elbow,
    elbowR: arms[1].elbow,
    handL: arms[0].hand,
    handR: arms[1].hand,
    hipL: legs[0].hip,
    hipR: legs[1].hip,
    kneeL: legs[0].knee,
    kneeR: legs[1].knee,
    kurta,
    dupattaTail,
    book,
    mug,
    wand,
    teddy,
    steam,
    star,
    face,
    materials: { dress, trim, scarf, leggings, shoes, glasses, clip }
  }
}

// ---------------------------------------------------------------- component

export function ModelStage({
  pose,
  outfit,
  characterScale,
  onMissing
}: {
  pose: Pose
  outfit: OutfitColors
  characterScale: number
  onMissing?: () => void
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const poseRef = useRef(pose)
  poseRef.current = pose
  const scaleRef = useRef(characterScale)
  scaleRef.current = characterScale
  const outfitRef = useRef(outfit)

  // Live outfit recolor without rebuilding the model.
  const rigRef = useRef<Rig | null>(null)
  useEffect(() => {
    outfitRef.current = outfit
    const rig = rigRef.current
    if (!rig) return
    rig.materials.dress.color.set(outfit.dress)
    rig.materials.dress.map?.dispose()
    rig.materials.dress.map = kurtaTexture(outfit.dress, outfit.dressTrim)
    rig.materials.dress.needsUpdate = true
    rig.materials.trim.color.set(outfit.dressTrim)
    rig.materials.scarf.color.set(outfit.scarf)
    rig.materials.leggings.color.set(outfit.leggings)
    rig.materials.shoes.color.set(outfit.shoes)
    rig.materials.glasses.color.set(outfit.glasses)
    rig.materials.clip.color.set(outfit.hairAccessory)
  }, [outfit])

  useEffect(() => {
    const canvas = canvasRef.current!
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
    } catch {
      onMissing?.()
      return
    }
    let disposed = false
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x000000, 0)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 2000)
    camera.position.set(0, 60, 900)
    camera.lookAt(0, 0, 0)

    scene.add(new THREE.HemisphereLight(0xfff6ec, 0xcdbde6, 1.25))
    const key = new THREE.DirectionalLight(0xffffff, 1.55)
    key.position.set(-70, 620, 260)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.radius = 5
    key.shadow.bias = -0.0008
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xffe9f2, 0.35)
    fill.position.set(220, 120, 300)
    scene.add(fill)

    const rig = buildRig(outfitRef.current)
    rigRef.current = rig
    scene.add(rig.root)

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 1200), new THREE.ShadowMaterial({ opacity: 0.13 }))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)

    const layout = (): void => {
      const w = window.innerWidth
      const h = window.innerHeight
      renderer.setSize(w, h, false)
      camera.left = -w / 2
      camera.right = w / 2
      camera.top = h / 2
      camera.bottom = -h / 2
      camera.updateProjectionMatrix()
      floor.position.y = -h / 2 + 4
      key.shadow.camera.left = -w / 2
      key.shadow.camera.right = w / 2
      key.shadow.camera.top = h
      key.shadow.camera.bottom = -h
      key.shadow.camera.near = -1000
      key.shadow.camera.far = 3000
      key.shadow.camera.updateProjectionMatrix()
    }
    layout()
    window.addEventListener('resize', layout)

    const onLost = (e: Event): void => {
      e.preventDefault()
      if (!disposed) onMissing?.()
    }
    canvas.addEventListener('webglcontextlost', onLost)

    // ---- animation state
    const s = { turn: 0, blush: 0.07, shoulderFwdL: 0, shoulderFwdR: 0, bookV: 0, mugV: 0, wandV: 0, teddyV: 0 }
    let last = performance.now()
    let raf = 0
    const smooth = (v: number, t: number, dt: number, rate: number): number => v + (t - v) * Math.min(1, dt * rate)
    const tmpQ = new THREE.Quaternion()
    const tmpQ2 = new THREE.Quaternion()

    const loop = (now: number): void => {
      if (disposed) return
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const t = now / 1000
      const p = poseRef.current
      const w = window.innerWidth
      const h = window.innerHeight

      // ---- placement: feet on the floor at pose.x, sized like the 2D wrap
      const scale = (BASE_PX * scaleRef.current) / MODEL_H
      const sit = p.sitPhase
      rig.root.scale.setScalar(scale)
      rig.root.position.set(p.x - w / 2, -h / 2 + 4 + p.lift * 1.0, 0)
      rig.root.rotation.z = deg(-p.bodyTilt)

      // ---- she turns her whole body toward where she walks (true 3D)
      const walking = p.mode === 'walk'
      s.turn = smooth(s.turn, walking ? p.facing * 0.55 : 0, dt, 4)
      rig.body.rotation.y = s.turn
      rig.body.position.y = -30 * sit

      // ---- torso breathing + sit spread
      rig.torso.scale.set(1 + sit * 0.06, 1 + p.breath * 0.012, 1 + sit * 0.06)

      // ---- head: cursor gaze becomes a real turn; tilt; nod
      rig.head.rotation.set(-p.lookY * 0.28 - p.breath * 0.012, p.lookX * 0.5, deg(-p.headTilt))
      rig.head.position.y = 160 + p.breath * 1.2

      // ---- hair: lagging sway from the Animator's springs
      const sway = deg(p.hairSway * 0.6)
      rig.hairSideL.rotation.z = sway + Math.sin(t * 0.9) * 0.02
      rig.hairSideR.rotation.z = sway + Math.sin(t * 0.9 + 1.2) * 0.02
      rig.hairBack.rotation.z = sway * 0.8
      rig.hairBack.rotation.x = Math.sin(t * 0.7) * 0.012
      rig.dupattaTail.rotation.z = deg(-4 + p.scarfSway * 0.5)

      // ---- arms: same channels as the 2D performer; deep elbow bends bring
      //      the hand forward in front of the chest (chin / book / mug)
      const fwdL = clamp(Math.abs(p.elbowL) / 120, 0, 1)
      const fwdR = clamp(Math.abs(p.elbowR) / 120, 0, 1)
      s.shoulderFwdL = smooth(s.shoulderFwdL, fwdL, dt, 7)
      s.shoulderFwdR = smooth(s.shoulderFwdR, fwdR, dt, 7)
      rig.shoulderL.rotation.set(-s.shoulderFwdL * 1.0, 0, deg(-p.armL))
      rig.shoulderR.rotation.set(-s.shoulderFwdR * 1.0, 0, deg(-p.armR))
      rig.elbowL.rotation.set(-s.shoulderFwdL * 0.35, 0, deg(-p.elbowL))
      rig.elbowR.rotation.set(-s.shoulderFwdR * 0.35, 0, deg(-p.elbowR))

      // ---- legs: walk cycle with knees; fold when sitting
      const swing = Math.sin(p.legPhase) * 0.4 * p.legSwing * (1 - sit)
      const kneeA = Math.max(0, Math.sin(p.legPhase)) * 0.55 * p.legSwing * (1 - sit)
      const kneeB = Math.max(0, -Math.sin(p.legPhase)) * 0.55 * p.legSwing * (1 - sit)
      rig.hipL.rotation.set(swing - sit * deg(78), 0, sit * deg(22))
      rig.hipR.rotation.set(-swing - sit * deg(78), 0, -sit * deg(22))
      rig.kneeL.rotation.set(kneeA + sit * deg(96), 0, 0)
      rig.kneeR.rotation.set(kneeB + sit * deg(96), 0, 0)

      // ---- props
      const ph = p.propPhase
      s.bookV = smooth(s.bookV, p.prop === 'book' ? ph : 0, dt, 10)
      s.mugV = smooth(s.mugV, p.prop === 'mug' ? ph : 0, dt, 10)
      s.wandV = smooth(s.wandV, p.prop === 'wand' ? ph : 0, dt, 10)
      s.teddyV = smooth(s.teddyV, p.prop === 'teddy' ? ph : 0, dt, 10)
      rig.book.visible = s.bookV > 0.02
      rig.book.scale.setScalar(0.5 + s.bookV * 0.5)
      rig.book.rotation.x = deg(-32)
      rig.book.position.y = 96 + Math.sin(t * 2) * 0.5
      rig.mug.visible = s.mugV > 0.02
      rig.mug.scale.setScalar(0.5 + s.mugV * 0.5)
      if (rig.mug.visible) {
        // stay upright in world space regardless of the arm's bend
        rig.handR.getWorldQuaternion(tmpQ)
        tmpQ2.copy(tmpQ).invert()
        rig.mug.quaternion.copy(tmpQ2)
        rig.mug.rotation.z += deg(-8)
        for (const [i, st] of rig.steam.entries()) {
          st.position.x = (i - 1) * 2 + Math.sin(t * 1.6 + i * 2) * 1.8
          st.position.y = 9 + i * 5 + ((t * 6 + i * 3) % 6)
          ;(st.material as THREE.MeshStandardMaterial).opacity = 0.25 + Math.sin(t * 2.1 + i) * 0.18
        }
      }
      rig.wand.visible = s.wandV > 0.02
      rig.wand.scale.setScalar(0.5 + s.wandV * 0.5)
      if (rig.wand.visible) {
        rig.handR.getWorldQuaternion(tmpQ)
        tmpQ2.copy(tmpQ).invert()
        rig.wand.quaternion.copy(tmpQ2)
        rig.wand.rotation.z += deg(-36)
        rig.star.rotation.z = t * 2
        rig.star.scale.setScalar(0.85 + Math.sin(t * 6) * 0.15)
      }
      rig.teddy.visible = s.teddyV > 0.02
      rig.teddy.scale.setScalar(0.5 + s.teddyV * 0.5)

      // ---- face
      const blushT =
        p.emotion === 'blushing' ? 0.9 : p.emotion === 'happy' || p.emotion === 'excited' || p.emotion === 'celebrating' ? 0.55 : 0.28
      s.blush = smooth(s.blush, blushT, dt, 4)
      rig.face.paint(p, s.blush)

      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', layout)
      canvas.removeEventListener('webglcontextlost', onLost)
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose()
          const m = o.material as THREE.Material | THREE.Material[]
          for (const mm of Array.isArray(m) ? m : [m]) mm.dispose()
        }
      })
      rig.face.texture.dispose()
      renderer.dispose()
      rigRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  )
}
