import type { JSX } from 'react'
import type { OutfitColors, OutfitStyle } from '@shared/types'
import type { Pose } from './engine/pose'
import outfitRigsJson from './rig-outfits.json'

/** Geometry emitted by scripts/build-outfits.ts for a painted outfit figure. */
interface RigPiece {
  file: string
  x: number
  y: number
  w: number
  h: number
}
interface RigPt {
  x: number
  y: number
}
interface RigArm {
  shoulder: RigPt
  elbow: RigPt
  hand: RigPt
  shoulderColor: string
  elbowColor: string
  shoulderR: number
  elbowR: number
}
interface RigLeg {
  hip: RigPt
  knee: RigPt
  hipColor: string
  kneeColor: string
  hipR: number
  kneeR: number
}
interface OutfitRig {
  style: string
  scale: number
  pieces: Record<string, RigPiece>
  arms: { L: RigArm; R: RigArm }
  legs: { L: RigLeg; R: RigLeg }
  face: { eyeL: RigPt; eyeR: RigPt; mouth: RigPt; blushL: RigPt; blushR: RigPt; eyeRx: number; eyeRy: number }
  headPivot: RigPt
  hairPivot: RigPt
  hemY: number
  skin: string
}
const OUTFIT_RIGS = outfitRigsJson as unknown as Record<string, OutfitRig>

/** Hue (0‥360) of a hex colour. */
function hueOf(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return 0
  let h = 0
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return ((h * 60) % 360 + 360) % 360
}

/**
 * BEARi — the painted performer.
 *
 * Identity comes straight from her painting: the head (face, glasses, bangs,
 * earrings), both back-hair masses AND her kurta torso are her actual
 * reference artwork, cut by scripts/build-rig.ts. Animated vector limbs are
 * attached to the painting at its own joints: two-segment arms whose hands
 * really reach things, legs with knees that really step, eased sitting, and
 * props that appear in her hands. Alternative outfits (frock, crop top &
 * jeans, hoodie) are drawn as vector garments on the same body.
 *
 * Canvas: 220 × 250, floor at y=244, centred at x=110. Painted layers map
 * from their 316×550 space with
 *   X = 110 + (px − 158)·K,   Y = 244 + (py − 545)·K,   K = 0.44
 * (painted feet ↔ the floor).
 */

const K = 0.44
const mx = (px: number): number => 110 + (px - 158) * K
const my = (py: number): number => 244 + (py - 545) * K

const ART = {
  head: { href: './rig/head.png', x: mx(45), y: my(10), w: 219 * K, h: 261 * K },
  hairL: { href: './rig/hair-l.png', x: mx(0), y: my(24), w: 96 * K, h: 314 * K, px: mx(58), py: my(80) },
  hairR: { href: './rig/hair-r.png', x: mx(222), y: my(14), w: 94 * K, h: 425 * K, px: mx(252), py: my(74) },
  torso: { href: './rig/torso.png', x: mx(14), y: my(246), w: 291 * K, h: 227 * K }
}
const EYE_L = { x: mx(95), y: my(170) }
const EYE_R = { x: mx(189), y: my(169) }
const EYE_RX = 23 * K
const EYE_RY = 27 * K
const MOUTH = { x: mx(140.5), y: my(219) }
const BLUSH_L = { x: mx(78), y: my(196) }
const BLUSH_R = { x: mx(203), y: my(196) }
const HEAD_PIVOT = { x: mx(158), y: my(252) }

/** Joints, in performer space — measured on the painting. */
const SHOULDER_Y = 139.5
const SHOULDER_L = 70.5
const SHOULDER_R = 149.5
const ELBOW_DY = 26
const HAND_DY = 45
const HIP_Y = 207
const KNEE_Y = 225
const HIP_L = 101
const HIP_R = 120
const HEM_Y = 211
const KURTA_HUE = 270 // her painted kurta's hue

const C = {
  skin: '#FBE3C9',
  skinShade: '#EFC49F',
  skinDeep: '#E3AE85',
  lidSkin: '#FBB48C',
  lash: '#4A2D20',
  mouthIn: '#7E3D46',
  tongue: '#E4707F',
  teeth: '#FFFFFF',
  lip: '#B45A62',
  blush: '#F49BA5',
  gold: '#D9A441',
  soleDark: '#7A4E33',
  bookCover: '#8B6BC9',
  bookCoverDeep: '#6E4FA8',
  page: '#FFF9EE',
  pageShade: '#F0E6D2',
  mug: '#C9A2E0',
  mugDeep: '#A87FC6',
  teddy: '#C89B6B',
  teddyDeep: '#A87C4F',
  teddyBelly: '#E8CBA4',
  hairShadow: '#20140F',
  ink: '#4A3A55'
} as const

interface BeariProps {
  pose: Pose
  outfit: OutfitColors
  style?: OutfitStyle
}

type SleeveKind = 'threeQuarter' | 'long' | 'puff' | 'short'
type LegKind = 'leggings' | 'tights' | 'jeans'
type ShoeKind = 'sandal' | 'maryjane' | 'sneaker'

const STYLE_SPEC: Record<OutfitStyle, { sleeve: SleeveKind; leg: LegKind; shoe: ShoeKind }> = {
  kurta: { sleeve: 'threeQuarter', leg: 'leggings', shoe: 'sandal' },
  frock: { sleeve: 'puff', leg: 'tights', shoe: 'maryjane' },
  croptop: { sleeve: 'short', leg: 'jeans', shoe: 'sneaker' },
  hoodie: { sleeve: 'long', leg: 'leggings', shoe: 'sneaker' }
}

const shade = (hex: string, amt: number): string => {
  const n = parseInt(hex.replace('#', ''), 16)
  const ch = (v: number): number => Math.max(0, Math.min(255, Math.round(v + amt)))
  const r = ch((n >> 16) & 255)
  const g = ch((n >> 8) & 255)
  const b = ch(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** Eyelid: a skin dome sliding down over the eye, clipped to the eye ellipse. */
function lidPath(cx: number, cy: number, blink: number): string {
  if (blink < 0.03) return ''
  const top = -EYE_RY
  const coverY = top + blink * EYE_RY * 2
  const steps = 12
  const right: string[] = []
  const left: string[] = []
  for (let s = 0; s <= steps; s++) {
    const yy = top + (coverY - top) * (s / steps)
    const xx = EYE_RX * Math.sqrt(Math.max(0, 1 - (yy / EYE_RY) ** 2))
    right.push(`${(cx + xx).toFixed(2)},${(cy + yy).toFixed(2)}`)
    left.push(`${(cx - xx).toFixed(2)},${(cy + yy).toFixed(2)}`)
  }
  return `M ${right.join(' L ')} L ${left.reverse().join(' L ')} Z`
}

function lashPath(cx: number, cy: number, blink: number): string {
  if (blink < 0.14) return ''
  const coverY = cy - EYE_RY + blink * EYE_RY * 2
  return `M ${cx - 8.4},${coverY - 0.9} Q ${cx},${coverY + 2.2} ${cx + 8.4},${coverY - 0.9}`
}

// ---------------------------------------------------------------- props

function Book({ t, phase }: { t: number; phase: number }): JSX.Element {
  const flip = (t % 3.2) / 0.55
  const flipping = flip < 1
  const flipX = flipping ? 16 - 32 * flip : 0
  const flipH = flipping ? Math.sin(flip * Math.PI) * 10 : 0
  return (
    <g transform={`translate(110 160) scale(${(0.5 + phase * 0.5) * 1.3})`} opacity={phase}>
      <path d="M-24,2 C-14,-4 -4,-5 0,-3 C4,-5 14,-4 24,2 L24,12 C14,7 4,6 0,8 C-4,6 -14,7 -24,12 Z" fill={C.bookCover} />
      <path d="M-24,2 C-14,-4 -4,-5 0,-3 L0,8 C-4,6 -14,7 -24,12 Z" fill={C.bookCoverDeep} opacity="0.45" />
      <path d="M-21,2.5 C-12,-2.5 -3.5,-3.4 0,-1.6 L0,6.5 C-3.5,4.8 -12,5.5 -21,9.5 Z" fill={C.page} />
      <path d="M21,2.5 C12,-2.5 3.5,-3.4 0,-1.6 L0,6.5 C3.5,4.8 12,5.5 21,9.5 Z" fill={C.pageShade} />
      <path d="M21,2.5 C12,-2.5 3.5,-3.4 0,-1.6 L0,5 C3.5,3.4 12,4 21,8 Z" fill={C.page} />
      <g stroke="#C9BBA4" strokeWidth="0.9" strokeLinecap="round" fill="none">
        <path d="M-17,2.2 C-11,-0.6 -5,-1.4 -2.5,-0.4" />
        <path d="M-17,4.6 C-11,1.8 -5,1 -2.5,2" />
        <path d="M17,2.2 C11,-0.6 5,-1.4 2.5,-0.4" />
        <path d="M17,4.6 C11,1.8 5,1 2.5,2" />
      </g>
      {flipping && (
        <path
          d={`M0,-1.6 C${flipX * 0.5},${-3 - flipH} ${flipX},${-2.5 - flipH} ${flipX},-0.5 L${flipX},5 C${flipX * 0.6},3 ${flipX * 0.3},4.5 0,6.5 Z`}
          fill={C.page}
          opacity="0.96"
        />
      )}
      <path d="M0,-3 L0,8" stroke={C.bookCoverDeep} strokeWidth="1" opacity="0.5" />
    </g>
  )
}

function Mug({ t, phase }: { t: number; phase: number }): JSX.Element {
  const wisp = (offset: number): string => {
    const w = Math.sin(t * 1.6 + offset) * 1.6
    return `M0,0 C${w - 1.5},-4 ${w + 1.5},-7 ${w},-11`
  }
  return (
    <g transform={`scale(${(0.5 + phase * 0.5) * 1.15})`} opacity={phase}>
      <path d="M-6.5,-9 L6.5,-9 L5.6,3.5 Q0,5.5 -5.6,3.5 Z" fill={C.mug} />
      <path d="M2,-9 L6.5,-9 L5.6,3.5 Q3,4.5 1,4.4 Z" fill={C.mugDeep} opacity="0.5" />
      <ellipse cx="0" cy="-9" rx="6.5" ry="2.2" fill="#8A6A52" />
      <ellipse cx="0" cy="-9.4" rx="5.2" ry="1.6" fill="#6B4F3B" />
      <path d="M6,-6.5 Q11,-6 10,-1.5 Q9.4,1.5 5.4,1.5" fill="none" stroke={C.mug} strokeWidth="2.4" />
      <path d="M-5.5,-7.5 L-4.6,1.5" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
      <g transform="translate(0 -12)" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" fill="none">
        <path d={wisp(0)} opacity={0.35 + Math.sin(t * 2.1) * 0.2} />
        <g transform="translate(3.4 1)">
          <path d={wisp(2.2)} opacity={0.3 + Math.sin(t * 2.1 + 1.4) * 0.18} />
        </g>
      </g>
    </g>
  )
}

function Wand({ t, phase }: { t: number; phase: number }): JSX.Element {
  const tw = 0.75 + Math.sin(t * 6) * 0.25
  return (
    <g transform={`rotate(-38) scale(${0.5 + phase * 0.5})`} opacity={phase}>
      <path d="M-1.4,2 L1.4,2 L1,-20 L-1,-20 Z" fill="#B98BD6" />
      <path d="M-0.2,2 L1.4,2 L1,-20 L0.2,-20 Z" fill="#9A6BBE" opacity="0.6" />
      <g transform="translate(0 -24)">
        <path
          d="M0,-6.5 L1.9,-2 L6.6,-1.7 L3,1.5 L4.1,6.2 L0,3.6 L-4.1,6.2 L-3,1.5 L-6.6,-1.7 L-1.9,-2 Z"
          fill={C.gold}
          opacity={tw}
        />
        <circle cx="0" cy="0" r="1.6" fill="#FFE9AF" opacity={tw} />
        <circle cx="7.5" cy="-6" r="1.1" fill="#FFE9AF" opacity={0.4 + Math.sin(t * 5 + 1) * 0.35} />
        <circle cx="-7" cy="4" r="0.9" fill="#FFE9AF" opacity={0.4 + Math.sin(t * 5 + 2.6) * 0.35} />
      </g>
    </g>
  )
}

function Teddy({ phase }: { phase: number }): JSX.Element {
  return (
    <g transform={`translate(110 196) scale(${0.6 + phase * 0.4})`} opacity={phase}>
      <circle cx="-8" cy="-13" r="3.4" fill={C.teddy} />
      <circle cx="8" cy="-13" r="3.4" fill={C.teddy} />
      <circle cx="-8" cy="-13" r="1.6" fill={C.teddyBelly} />
      <circle cx="8" cy="-13" r="1.6" fill={C.teddyBelly} />
      <circle cx="0" cy="-10" r="8.6" fill={C.teddy} />
      <ellipse cx="0" cy="1" rx="10" ry="9" fill={C.teddy} />
      <ellipse cx="0" cy="2.5" rx="6" ry="5.5" fill={C.teddyBelly} />
      <ellipse cx="-9" cy="6" rx="3.4" ry="2.6" fill={C.teddyDeep} />
      <ellipse cx="9" cy="6" rx="3.4" ry="2.6" fill={C.teddyDeep} />
      <ellipse cx="0" cy="-8.5" rx="3" ry="2.2" fill={C.teddyBelly} />
      <circle cx="-3.2" cy="-11.5" r="1" fill={C.hairShadow} />
      <circle cx="3.2" cy="-11.5" r="1" fill={C.hairShadow} />
      <path d="M-1.2,-8.5 Q0,-7.3 1.2,-8.5" stroke={C.hairShadow} strokeWidth="0.9" fill="none" strokeLinecap="round" />
    </g>
  )
}

// ---------------------------------------------------------------- limbs

/** Footwear drawn under the calf's foot; origin = foot centre (0, 0). */
function Shoe({ kind, outfit }: { kind: ShoeKind; outfit: OutfitColors }): JSX.Element {
  switch (kind) {
    case 'maryjane':
      return (
        <g>
          <path d="M-8,-3 Q-9.5,3.5 -2,4 L7.5,4 Q10,1.5 8,-1.5 Q3,-4.6 -3,-4.4 Q-7,-4.2 -8,-3 Z" fill={outfit.shoes} />
          <path d="M-7.5,3 L8,3" stroke={C.soleDark} strokeWidth="1.3" strokeLinecap="round" />
          <path d="M-4,-2.8 Q0,-1.4 4,-2.8" stroke={shade(outfit.shoes, -40)} strokeWidth="1.3" fill="none" strokeLinecap="round" />
          <circle cx="0" cy="-2.2" r="0.9" fill="#FFFFFF" opacity="0.8" />
        </g>
      )
    case 'sneaker':
      return (
        <g>
          <path d="M-9,-2 Q-10.5,4 -2,4.5 L8.5,4.5 Q11,2 9,-1 Q5,-6 -1,-5.6 Q-7,-5 -9,-2 Z" fill="#FFFFFF" />
          <path d="M-9.5,2.4 Q-3,4.8 9.5,3.2 L9,4.5 L-2,4.5 Q-10.5,4 -9.5,2.4 Z" fill={shade(outfit.shoes, 30)} opacity="0.9" />
          <path d="M-9.5,2.6 L9.8,2.2" stroke={C.soleDark} strokeWidth="0.9" strokeLinecap="round" opacity="0.5" />
          <path d="M-4,-3.6 L3,-1.4 M-3,-1.6 L3.5,0.3" stroke={outfit.shoes} strokeWidth="1.1" strokeLinecap="round" opacity="0.85" />
          <path d="M6,-3.5 Q8.5,-2.4 8.8,0" stroke={outfit.shoes} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.8" />
        </g>
      )
    default:
      return (
        <g>
          <ellipse cx="0.5" cy="-1" rx="7.4" ry="4.2" fill={C.skin} />
          <path d="M-4.5,1 L-3,2.1 M0,1.5 L1,2.5" stroke={C.skinDeep} strokeWidth="0.9" strokeLinecap="round" />
          <path d="M-8.5,1.5 Q-9,6 -2,6 L8,6 Q10.5,3.3 7.5,0.7 L-6.5,-0.3 Z" fill={outfit.shoes} />
          <path d="M-8,5 L8.3,5" stroke={C.soleDark} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M0.5,-5 L0.5,0" stroke={outfit.shoes} strokeWidth="2" strokeLinecap="round" />
          <path d="M-5,-2 Q0.5,-5.5 6,-2" stroke={outfit.shoes} strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      )
  }
}

/** One articulated leg: thigh (hip pivot) → knee → calf + foot + shoe. */
function Leg({
  hipX,
  hipRot,
  kneeRot,
  kind,
  shoe,
  outfit
}: {
  hipX: number
  hipRot: number
  kneeRot: number
  kind: LegKind
  shoe: ShoeKind
  outfit: OutfitColors
}): JSX.Element {
  const hw = kind === 'jeans' ? 7.2 : 6.6
  const l = hipX - hw
  const r = hipX + hw
  const fill = outfit.leggings
  const edge = kind === 'jeans' ? shade(outfit.leggings, -46) : shade(outfit.leggings, -34)
  const seam = kind === 'jeans' ? shade(outfit.leggings, -42) : shade(outfit.leggings, -22)
  return (
    <g transform={`rotate(${hipRot} ${hipX} ${HIP_Y})`}>
      <path
        d={`M${l},${HIP_Y - 8} L${l},${KNEE_Y - 1} Q${l},${KNEE_Y + 3} ${hipX},${KNEE_Y + 3} Q${r},${KNEE_Y + 3} ${r},${KNEE_Y - 1} L${r},${HIP_Y - 8} Z`}
        fill={fill}
        stroke={edge}
        strokeWidth="0.9"
        strokeOpacity="0.55"
      />
      {kind === 'jeans' && <path d={`M${hipX},${HIP_Y - 4} L${hipX},${KNEE_Y}`} stroke={seam} strokeWidth="0.8" opacity="0.6" />}
      <g transform={`rotate(${kneeRot} ${hipX} ${KNEE_Y})`}>
        <path
          d={`M${l + 0.4},${KNEE_Y - 3} L${l + 0.4},${237} Q${l + 0.4},${240.5} ${hipX},${240.5} Q${r - 0.4},${240.5} ${r - 0.4},${237} L${r - 0.4},${KNEE_Y - 3} Z`}
          fill={fill}
          stroke={edge}
          strokeWidth="0.9"
          strokeOpacity="0.55"
        />
        <path d={`M${l + 2},${KNEE_Y} L${l + 2},${235}`} stroke={seam} strokeWidth="1.2" strokeLinecap="round" opacity="0.35" />
        {kind === 'leggings' && (
          <path d={`M${l + 1},${233} Q${hipX},${235} ${r - 1},${233} M${l + 1},${236.5} Q${hipX},${238.5} ${r - 1},${236.5}`} stroke={seam} strokeWidth="1" fill="none" />
        )}
        {kind === 'jeans' && (
          <path d={`M${l + 0.4},${236} L${r - 0.4},${236}`} stroke={seam} strokeWidth="1.1" opacity="0.7" />
        )}
        <g transform={`translate(${hipX} 240)`}>
          <Shoe kind={shoe} outfit={outfit} />
        </g>
      </g>
    </g>
  )
}

/**
 * One articulated arm: shoulder pivot → upper arm → elbow pivot → forearm →
 * hand, with a style-specific sleeve and an optional prop in the hand.
 * A fabric disc sits under every joint so rotation never opens a gap.
 */
function Arm({
  x,
  shoulderRot,
  elbowRot,
  sleeve,
  outfit,
  prop,
  propCounter = 0
}: {
  x: number
  shoulderRot: number
  elbowRot: number
  sleeve: SleeveKind
  outfit: OutfitColors
  prop?: JSX.Element | null
  propCounter?: number
}): JSX.Element {
  const sy = SHOULDER_Y
  const ey = sy + ELBOW_DY
  const hy = sy + HAND_DY
  const w = 6.8
  const l = x - w
  const r = x + w
  // Slightly lifted + soft plum edge, matching the painting's kurta rendering.
  const dress = sleeve === 'threeQuarter' ? shade(outfit.dress, 5) : outfit.dress
  const dark = sleeve === 'threeQuarter' ? '#9A82BD' : shade(dress, -26)
  const covered = sleeve === 'threeQuarter' || sleeve === 'long'
  const upperFill = sleeve === 'short' || sleeve === 'puff' ? C.skin : dress
  return (
    <g transform={`rotate(${shoulderRot} ${x} ${sy})`}>
      {/* upper arm (skin for bare styles, sleeve otherwise) */}
      <path
        d={`M${l + 1.2},${sy} Q${l + 1.2},${sy - 7} ${x},${sy - 7} Q${r - 1.2},${sy - 7} ${r - 1.2},${sy} L${r - 1.2},${ey - 1} Q${r - 1.2},${ey + 4} ${x},${ey + 4} Q${l + 1.2},${ey + 4} ${l + 1.2},${ey - 1} Z`}
        fill={upperFill}
        stroke={upperFill === C.skin ? C.skinShade : dark}
        strokeWidth="0.9"
        strokeOpacity="0.55"
      />
      {/* sleeve caps for the bare styles */}
      {sleeve === 'puff' && (
        <path
          d={`M${l - 2},${sy + 2} Q${l - 3},${sy - 9} ${x},${sy - 9.5} Q${r + 3},${sy - 9} ${r + 2},${sy + 2} Q${r + 1},${sy + 9} ${x},${sy + 8.5} Q${l - 1},${sy + 9} ${l - 2},${sy + 2} Z`}
          fill={dress}
          stroke={dark}
          strokeWidth="0.9"
          strokeOpacity="0.5"
        />
      )}
      {sleeve === 'short' && (
        <path
          d={`M${l - 0.5},${sy - 4} Q${l - 0.5},${sy - 8} ${x},${sy - 8} Q${r + 0.5},${sy - 8} ${r + 0.5},${sy - 4} L${r + 1},${sy + 9} Q${x},${sy + 11.5} ${l - 1},${sy + 9} Z`}
          fill={dress}
          stroke={dark}
          strokeWidth="0.9"
          strokeOpacity="0.5"
        />
      )}
      {covered && <path d={`M${l + 2.4},${sy + 2} L${l + 2.4},${ey - 3}`} stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" opacity="0.22" />}

      <g transform={`rotate(${elbowRot} ${x} ${ey})`}>
        {/* elbow disc keeps the joint closed at any bend */}
        <circle cx={x} cy={ey} r={6.2} fill={covered ? dress : C.skin} />
        {/* forearm */}
        <path d={`M${x - 4.2},${ey - 2} L${x - 4.2},${hy - 6} Q${x - 4.2},${hy - 2} ${x},${hy - 2} Q${x + 4.2},${hy - 2} ${x + 4.2},${hy - 6} L${x + 4.2},${ey - 2} Z`} fill={C.skin} />
        {/* long sleeve continues over the forearm */}
        {sleeve === 'long' && (
          <g>
            <path d={`M${l + 1.6},${ey - 4} L${l + 1.6},${hy - 9} Q${x},${hy - 6} ${r - 1.6},${hy - 9} L${r - 1.6},${ey - 4} Z`} fill={dress} stroke={dark} strokeWidth="0.9" strokeOpacity="0.5" />
            <path d={`M${l + 1.8},${hy - 11} L${r - 1.8},${hy - 11} L${r - 1.8},${hy - 7} Q${x},${hy - 4.5} ${l + 1.8},${hy - 7} Z`} fill={shade(dress, -14)} />
            <path d={`M${l + 3.5},${hy - 10.5} L${l + 3.5},${hy - 7} M${x},${hy - 10} L${x},${hy - 6} M${r - 3.5},${hy - 10.5} L${r - 3.5},${hy - 7}`} stroke={dark} strokeWidth="0.7" opacity="0.5" />
          </g>
        )}
        {/* three-quarter sleeve: white cuff at the elbow */}
        {sleeve === 'threeQuarter' && (
          <g>
            <path d={`M${l + 0.8},${ey - 5} L${r - 0.8},${ey - 5} L${r - 0.8},${ey + 4} Q${x},${ey + 7.5} ${l + 0.8},${ey + 4} Z`} fill="#FFFFFF" opacity="0.92" />
            <path d={`M${l + 0.8},${ey - 5} L${r - 0.8},${ey - 5} L${r - 0.8},${ey - 1.5} Q${x},${ey + 0.5} ${l + 0.8},${ey - 1.5} Z`} fill={outfit.dressTrim} opacity="0.35" />
          </g>
        )}
        {/* hand */}
        <path
          d={`M${x - 5.8},${hy - 3} Q${x - 6.2},${hy + 4} ${x},${hy + 4.3} Q${x + 6.2},${hy + 4} ${x + 5.8},${hy - 3} Q${x + 2.8},${hy - 5} ${x},${hy - 4.8} Q${x - 2.8},${hy - 5} ${x - 5.8},${hy - 3} Z`}
          fill={C.skin}
        />
        <path d={`M${x - 5.8},${hy - 2.6} Q${x - 7.2},${hy - 1.4} ${x - 6.6},${hy + 0.4}`} stroke={C.skinDeep} strokeWidth="1" fill="none" strokeLinecap="round" />
        {prop && <g transform={`translate(${x} ${hy}) rotate(${propCounter})`}>{prop}</g>}
      </g>
    </g>
  )
}

// ---------------------------------------------------------------- garments

/** Vector garment bodies for the non-painted styles (torso region 118‥212). */
function Garment({ style, outfit, sit, breath }: { style: OutfitStyle; outfit: OutfitColors; sit: number; breath: number }): JSX.Element | null {
  const dress = outfit.dress
  const dark = shade(dress, -28)
  const light = shade(dress, 22)
  const ink = C.ink
  const flare = 1 + sit * 0.1
  if (style === 'frock') {
    return (
      <g>
        {/* bodice */}
        <path
          d="M78,132 C78,124 92,120 110,120 C128,120 142,124 142,132 L145,166 L75,166 Z"
          fill={dress}
          stroke={dark}
          strokeWidth="1"
          strokeOpacity="0.55"
        />
        {/* skirt, flared */}
        <g transform={`scale(${flare} 1)`} style={{ transformOrigin: '110px 166px' }}>
          <path d="M75,166 L145,166 C152,182 158,198 160,212 Q110,222 60,212 C62,198 68,182 75,166 Z" fill={dress} stroke={dark} strokeWidth="1" strokeOpacity="0.55" />
          <path d="M62,207 Q110,217 158,207 L160,212 Q110,222 60,212 Z" fill={light} opacity="0.75" />
          <g stroke={dark} strokeWidth="0.9" opacity="0.35" fill="none">
            <path d="M90,168 L83,210" />
            <path d="M110,168 L110,214" />
            <path d="M130,168 L137,210" />
          </g>
          <g fill="#FFFFFF" opacity="0.6">
            <circle cx="96" cy="186" r="1.3" />
            <circle cx="118" cy="196" r="1.3" />
            <circle cx="140" cy="188" r="1.1" />
            <circle cx="80" cy="197" r="1.1" />
            <circle cx="126" cy="178" r="1" />
            <circle cx="104" cy="204" r="1" />
          </g>
        </g>
        {/* peter-pan collar */}
        <path d="M94,122 Q102,132 110,133 Q118,132 126,122 Q118,126 110,126.5 Q102,126 94,122 Z" fill="#FFFFFF" stroke={ink} strokeWidth="0.7" strokeOpacity="0.35" />
        {/* waist sash + bow */}
        <path d="M76,162 Q110,169 144,162 L144.5,168 Q110,175 75.5,168 Z" fill={outfit.dressTrim} />
        <g transform="translate(110 166)">
          <path d="M-9,-4 Q-14,0 -9,4 L-1,1 L-1,-1 Z" fill={outfit.dressTrim} stroke={shade(outfit.dressTrim, -30)} strokeWidth="0.7" />
          <path d="M9,-4 Q14,0 9,4 L1,1 L1,-1 Z" fill={outfit.dressTrim} stroke={shade(outfit.dressTrim, -30)} strokeWidth="0.7" />
          <circle cx="0" cy="0" r="2.4" fill={shade(outfit.dressTrim, -20)} />
        </g>
        {/* neck */}
        <path d="M100,112 L120,112 L121,124 Q110,128 99,124 Z" fill={C.skin} />
      </g>
    )
  }
  if (style === 'croptop') {
    const denim = outfit.leggings
    const denimDark = shade(denim, -46)
    return (
      <g>
        {/* neck + midriff skin */}
        <path d="M100,112 L120,112 L121,124 Q110,128 99,124 Z" fill={C.skin} />
        <path d="M82,160 Q110,166 138,160 L138,182 Q110,188 82,182 Z" fill={C.skin} />
        <ellipse cx="110" cy="172" rx="2.2" ry="1.3" fill={C.skinShade} opacity="0.7" />
        {/* crop top */}
        <path
          d="M80,132 C80,124 94,119 110,119 C126,119 140,124 140,132 L141,166 Q110,172 79,166 Z"
          fill={dress}
          stroke={dark}
          strokeWidth="1"
          strokeOpacity="0.55"
        />
        <path d="M80,160 Q110,166 140,160 L141,166 Q110,172 79,166 Z" fill={dark} opacity="0.35" />
        <path d="M100,121 Q110,128 120,121" stroke={dark} strokeWidth="1" fill="none" strokeOpacity="0.5" />
        {/* little heart */}
        <path d="M110,150 C107,145 100,147 103,152 C106,156 110,158 110,158 C110,158 114,156 117,152 C120,147 113,145 110,150 Z" fill="#FFFFFF" opacity="0.85" />
        {/* high-waist jeans */}
        <g transform={`scale(${flare} 1)`} style={{ transformOrigin: '110px 180px' }}>
          <path d="M80,178 Q110,184 140,178 L145,214 Q110,222 75,214 Z" fill={denim} stroke={denimDark} strokeWidth="1" strokeOpacity="0.6" />
          <path d="M80,178 Q110,184 140,178 L140.5,184 Q110,190 79.5,184 Z" fill={denimDark} opacity="0.35" />
          <circle cx="110" cy="182" r="1.4" fill={C.gold} />
          <path d="M110,186 L110,214" stroke={denimDark} strokeWidth="0.9" opacity="0.6" />
          <path d="M84,190 Q92,188 96,196 M136,190 Q128,188 124,196" stroke={denimDark} strokeWidth="0.9" fill="none" opacity="0.55" />
        </g>
      </g>
    )
  }
  if (style === 'hoodie') {
    return (
      <g>
        {/* hood, resting behind the neck */}
        <path d="M84,126 C84,108 96,100 110,100 C124,100 136,108 136,126 Q110,136 84,126 Z" fill={dark} />
        <path d="M90,126 C90,112 98,106 110,106 C122,106 130,112 130,126 Q110,133 90,126 Z" fill={shade(dress, -12)} />
        {/* body */}
        <path
          d="M74,134 C74,124 90,118 110,118 C130,118 146,124 146,134 L150,208 Q110,218 70,208 Z"
          fill={dress}
          stroke={dark}
          strokeWidth="1"
          strokeOpacity="0.55"
        />
        <path d="M70,203 Q110,212 150,203 L150,208 Q110,218 70,208 Z" fill={shade(dress, -14)} />
        <path d="M76,205 L76,209 M86,207 L86,211 M96,208.5 L96,212.5 M110,209.5 L110,213.5 M124,208.5 L124,212.5 M134,207 L134,211 M144,205 L144,209" stroke={dark} strokeWidth="0.7" opacity="0.5" />
        {/* kangaroo pocket */}
        <path d="M88,176 L132,176 L134,200 Q110,205 86,200 Z" fill={shade(dress, -8)} stroke={dark} strokeWidth="0.9" strokeOpacity="0.5" />
        {/* drawstrings */}
        <path d="M104,128 Q102,150 100,160 M116,128 Q118,150 120,160" stroke="#FFFFFF" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.9" />
        <circle cx="100" cy="161" r="1.3" fill="#FFFFFF" />
        <circle cx="120" cy="161" r="1.3" fill="#FFFFFF" />
        {/* neckline */}
        <path d="M98,124 Q110,132 122,124" stroke={dark} strokeWidth="1.2" fill="none" strokeOpacity="0.6" />
        {breath > 2 && null}
      </g>
    )
  }
  return null
}

// ---------------------------------------------------------------- painted outfit rig

/** Shared per-frame motion values for both rig flavours. */
function deriveMotion(pose: Pose): {
  sit: number
  legRotL: number
  legRotR: number
  kneeL: number
  kneeR: number
  bodyDrop: number
  blink: number
  lash: number
  blushOpacity: number
  mouthOpen: boolean
  mouthScale: number
} {
  const sit = pose.sitPhase
  const walkSwing = Math.sin(pose.legPhase) * 22 * pose.legSwing * (1 - sit)
  const happy = pose.emotion === 'happy' || pose.emotion === 'excited' || pose.emotion === 'celebrating'
  const squint = pose.emotion === 'blushing' ? 0.2 : happy ? 0.1 : pose.emotion === 'sleepy' ? 0.35 : 0
  const blink = Math.max(0, Math.min(1, 1 - pose.eyeOpen + squint))
  return {
    sit,
    legRotL: sit * 72 + walkSwing,
    legRotR: sit * -72 - walkSwing,
    kneeL: sit * -104 + Math.max(0, Math.sin(pose.legPhase)) * 26 * pose.legSwing * (1 - sit),
    kneeR: sit * 104 + Math.max(0, -Math.sin(pose.legPhase)) * 26 * pose.legSwing * (1 - sit),
    bodyDrop: sit * 30,
    blink,
    lash: blink >= 0.14 ? Math.min(1, (blink - 0.14) / 0.4) : 0,
    blushOpacity: pose.emotion === 'blushing' ? 0.95 : happy ? 0.5 : 0.12,
    mouthOpen: pose.talking || pose.mouth === 'openSmile' || pose.mouth === 'o',
    mouthScale: pose.mouth === 'o' ? 0.55 : 1
  }
}

function lidPathR(cx: number, cy: number, rx: number, ry: number, blink: number): string {
  if (blink < 0.03) return ''
  const top = -ry
  const coverY = top + blink * ry * 2
  const steps = 12
  const right: string[] = []
  const left: string[] = []
  for (let s = 0; s <= steps; s++) {
    const yy = top + (coverY - top) * (s / steps)
    const xx = rx * Math.sqrt(Math.max(0, 1 - (yy / ry) ** 2))
    right.push(`${(cx + xx).toFixed(2)},${(cy + yy).toFixed(2)}`)
    left.push(`${(cx - xx).toFixed(2)},${(cy + yy).toFixed(2)}`)
  }
  return `M ${right.join(' L ')} L ${left.reverse().join(' L ')} Z`
}

function PaintedRig({ rig, pose }: { rig: OutfitRig; pose: Pose }): JSX.Element {
  const m = deriveMotion(pose)
  const base = `./rig/outfits/${rig.style}/`
  const P = (name: string): JSX.Element | null => {
    const p = rig.pieces[name]
    return p ? <image href={base + p.file} x={p.x} y={p.y} width={p.w} height={p.h} /> : null
  }
  const breathLift = pose.breath * 1.5
  const hairRot = pose.hairSway * 0.5
  const headTransform = `translate(${(pose.lookX * 3.5).toFixed(2)} ${(-breathLift + pose.lookY * 2.5).toFixed(2)}) rotate(${pose.headTilt.toFixed(2)} ${rig.headPivot.x} ${rig.headPivot.y})`
  const t = pose.actionTime
  const ph = pose.propPhase
  const f = rig.face
  const aL = rig.arms.L
  const aR = rig.arms.R
  const lL = rig.legs.L
  const lR = rig.legs.R
  const lashR = (cx: number, cy: number): string => {
    if (m.blink < 0.14) return ''
    const coverY = cy - f.eyeRy + m.blink * f.eyeRy * 2
    return `M ${cx - f.eyeRx * 0.8},${coverY - 0.9} Q ${cx},${coverY + 2.2} ${cx + f.eyeRx * 0.8},${coverY - 0.9}`
  }
  const propR = pose.prop === 'mug' ? <Mug t={t} phase={ph} /> : pose.prop === 'wand' ? <Wand t={t} phase={ph} /> : null
  const propCounter = pose.prop === 'mug' ? -(pose.armR + pose.elbowR) * 0.9 : pose.prop === 'wand' ? -(pose.armR + pose.elbowR) : 0

  // Joint discs fade in with the bend — invisible at rest, gap-filling in motion.
  const discA = (deg: number): number => Math.min(1, Math.abs(deg) / 10)
  const Leg = ({ l, hipRot, kneeRot, side }: { l: RigLeg; hipRot: number; kneeRot: number; side: 'L' | 'R' }): JSX.Element => (
    <g transform={`rotate(${hipRot} ${l.hip.x} ${l.hip.y})`}>
      <circle cx={l.hip.x} cy={l.hip.y} r={l.hipR} fill={l.hipColor} opacity={discA(hipRot)} />
      {P(`leg${side}-thigh`)}
      <g transform={`rotate(${kneeRot} ${l.knee.x} ${l.knee.y})`}>
        <circle cx={l.knee.x} cy={l.knee.y} r={l.kneeR} fill={l.kneeColor} opacity={discA(kneeRot)} />
        {P(`leg${side}-calf`)}
      </g>
    </g>
  )
  const Arm = ({ a, shoulderRot, elbowRot, side, prop, counter }: { a: RigArm; shoulderRot: number; elbowRot: number; side: 'L' | 'R'; prop?: JSX.Element | null; counter?: number }): JSX.Element => (
    <g transform={`rotate(${shoulderRot} ${a.shoulder.x} ${a.shoulder.y})`}>
      <circle cx={a.shoulder.x} cy={a.shoulder.y} r={a.shoulderR} fill={a.shoulderColor} opacity={discA(shoulderRot)} />
      {P(`arm${side}-upper`)}
      <g transform={`rotate(${elbowRot} ${a.elbow.x} ${a.elbow.y})`}>
        <circle cx={a.elbow.x} cy={a.elbow.y} r={a.elbowR} fill={a.elbowColor} opacity={discA(elbowRot)} />
        {P(`arm${side}-lower`)}
        {prop && <g transform={`translate(${a.hand.x} ${a.hand.y}) rotate(${counter ?? 0})`}>{prop}</g>}
      </g>
    </g>
  )

  return (
    <svg viewBox="0 0 220 250" width="100%" height="100%" style={{ overflow: 'visible' }}>
      <defs>
        <radialGradient id="cheekG2">
          <stop offset="0%" stopColor={C.blush} stopOpacity="0.9" />
          <stop offset="100%" stopColor={C.blush} stopOpacity="0" />
        </radialGradient>
        <filter id="lidSoft2" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="0.5" />
        </filter>
        <filter id="chinShadow2" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>
      <ellipse cx="110" cy="244" rx={40 - pose.lift * 0.4} ry="5" fill="#3A2C4D" opacity={Math.max(0.06, 0.14 - pose.lift * 0.002)} />
      <g transform={`translate(0 ${-pose.lift}) rotate(${pose.bodyTilt} 110 244)`}>
        <g transform={pose.facing === -1 ? 'scale(-1 1) translate(-220 0)' : undefined}>
          <g transform={`translate(0 ${m.bodyDrop})`}>
            {/* lower hair rests on the shoulders — stays with the body, only sways */}
            <g transform={`rotate(${hairRot * 0.7} ${rig.headPivot.x} ${rig.headPivot.y})`}>{P('hair-low')}</g>
            {/* upper hair — same transform as the head, swaying from the crown */}
            <g transform={headTransform}>
              <g transform={`rotate(${hairRot} ${rig.hairPivot.x} ${rig.hairPivot.y})`}>{P('hair')}</g>
            </g>
            {/* legs */}
            <Leg l={lL} hipRot={m.legRotL} kneeRot={m.kneeL} side="L" />
            <Leg l={lR} hipRot={m.legRotR} kneeRot={m.kneeR} side="R" />
            {/* neck + torso */}
            <ellipse cx={rig.headPivot.x} cy={rig.headPivot.y + 4} rx="9" ry="8" fill={rig.skin} />
            <g transform={`scale(${1 + m.sit * 0.05} ${1 + pose.breath * 0.008})`} style={{ transformOrigin: `110px ${rig.hemY}px` }}>
              {P('torso')}
            </g>
            <ellipse cx={rig.headPivot.x} cy={rig.headPivot.y + 3} rx="16" ry="4" fill="#3A2C4D" opacity="0.16" filter="url(#chinShadow2)" />
            {pose.prop === 'teddy' && <Teddy phase={ph} />}
            {/* head + face */}
            <g transform={headTransform}>
              {P('head')}
              <ellipse cx={f.blushL.x} cy={f.blushL.y} rx="6.5" ry="4" fill="url(#cheekG2)" opacity={m.blushOpacity} />
              <ellipse cx={f.blushR.x} cy={f.blushR.y} rx="6.5" ry="4" fill="url(#cheekG2)" opacity={m.blushOpacity} />
              <g filter="url(#lidSoft2)">
                <path d={lidPathR(f.eyeL.x, f.eyeL.y, f.eyeRx, f.eyeRy, m.blink)} fill={rig.skin} />
                <path d={lidPathR(f.eyeR.x, f.eyeR.y, f.eyeRx, f.eyeRy, m.blink)} fill={rig.skin} />
              </g>
              <path d={lashR(f.eyeL.x, f.eyeL.y)} stroke={C.lash} strokeWidth="1.1" fill="none" strokeLinecap="round" strokeOpacity={m.lash} />
              <path d={lashR(f.eyeR.x, f.eyeR.y)} stroke={C.lash} strokeWidth="1.1" fill="none" strokeLinecap="round" strokeOpacity={m.lash} />
              {m.mouthOpen && (
                <g transform={`translate(${f.mouth.x} ${f.mouth.y}) scale(${m.mouthScale * 0.8})`}>
                  <path d="M-7.5,-2.6 Q0,0 7.5,-2.6 C8,5.5 4.4,9.5 0,9.5 C-4.4,9.5 -8,5.5 -7.5,-2.6 Z" fill={C.mouthIn} />
                  <path d="M-6.6,-1.6 Q0,0.4 6.6,-1.6 L6.2,1.4 Q0,3 -6.2,1.4 Z" fill={C.teeth} />
                  <ellipse cx="0" cy="6.3" rx="3.6" ry="2.3" fill={C.tongue} />
                  <path d="M-7.5,-2.6 Q0,0 7.5,-2.6" stroke={C.lip} strokeWidth="0.9" fill="none" strokeLinecap="round" />
                </g>
              )}
            </g>
            {/* arms over everything */}
            <Arm a={aL} shoulderRot={pose.armL} elbowRot={pose.elbowL} side="L" />
            <Arm a={aR} shoulderRot={pose.armR} elbowRot={pose.elbowR} side="R" prop={propR} counter={propCounter} />
            {pose.prop === 'book' && (
              <g transform="translate(0 -10)">
                <Book t={t} phase={ph} />
              </g>
            )}
          </g>
        </g>
      </g>
    </svg>
  )
}

// ---------------------------------------------------------------- character

export function Beari({ pose, outfit, style = 'kurta' }: BeariProps): JSX.Element {
  const paintedRig = style !== 'kurta' ? OUTFIT_RIGS[style] : undefined
  if (paintedRig) return <PaintedRig rig={paintedRig} pose={pose} />
  const spec = STYLE_SPEC[style]
  const breathLift = pose.breath * 1.5
  const hairRot = pose.hairSway * 0.5
  const sit = pose.sitPhase

  const walkSwing = Math.sin(pose.legPhase) * 22 * pose.legSwing * (1 - sit)
  const legRotL = sit * 72 + walkSwing
  const legRotR = sit * -72 - walkSwing
  const kneeL = sit * -104 + Math.max(0, Math.sin(pose.legPhase)) * 26 * pose.legSwing * (1 - sit)
  const kneeR = sit * 104 + Math.max(0, -Math.sin(pose.legPhase)) * 26 * pose.legSwing * (1 - sit)
  const bodyDrop = sit * 30

  const happy = pose.emotion === 'happy' || pose.emotion === 'excited' || pose.emotion === 'celebrating'
  const blushOpacity = pose.emotion === 'blushing' ? 0.95 : happy ? 0.5 : 0.12
  const squint = pose.emotion === 'blushing' ? 0.2 : happy ? 0.1 : pose.emotion === 'sleepy' ? 0.35 : 0
  const blink = Math.max(0, Math.min(1, 1 - pose.eyeOpen + squint))
  const lash = blink >= 0.14 ? Math.min(1, (blink - 0.14) / 0.4) : 0
  const mouthOpen = pose.talking || pose.mouth === 'openSmile' || pose.mouth === 'o'
  const mouthScale = pose.mouth === 'o' ? 0.55 : 1

  // Painted kurta follows the dress colour by hue rotation.
  const hue = hueOf(outfit.dress)
  const hueDelta = Math.round(hue - KURTA_HUE)
  const tint = style === 'kurta' && Math.abs(hueDelta) > 4

  const t = pose.actionTime
  const ph = pose.propPhase
  const mugProp = pose.prop === 'mug' ? <Mug t={t} phase={ph} /> : null
  const wandProp = pose.prop === 'wand' ? <Wand t={t} phase={ph} /> : null

  // Head and hair share one transform — they are one object, so nothing gaps.
  const headTransform = `translate(${(pose.lookX * 3.5).toFixed(2)} ${(-breathLift + pose.lookY * 2.5).toFixed(2)}) rotate(${pose.headTilt.toFixed(2)} ${HEAD_PIVOT.x} ${HEAD_PIVOT.y})`

  return (
    <svg viewBox="0 0 220 250" width="100%" height="100%" style={{ overflow: 'visible' }}>
      <defs>
        <radialGradient id="cheekG">
          <stop offset="0%" stopColor={C.blush} stopOpacity="0.9" />
          <stop offset="100%" stopColor={C.blush} stopOpacity="0" />
        </radialGradient>
        <filter id="lidSoft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
        <filter id="chinShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        {tint && (
          <filter id="torsoTint">
            <feColorMatrix type="hueRotate" values={String(hueDelta)} />
          </filter>
        )}
        {/* back hair stops at the shoulders — below that the painting's hair
            lay over the body; the torso covers it */}
        <clipPath id="hairClip">
          <path d="M10,0 L210,0 L210,150 Q195,164 175,168 L155,172 L65,172 L45,168 Q25,164 10,150 Z" />
        </clipPath>
      </defs>

      {/* ground shadow */}
      <ellipse
        cx="110"
        cy="244"
        rx={48 - pose.lift * 0.4}
        ry="5.5"
        fill="#3A2C4D"
        opacity={Math.max(0.06, 0.14 - pose.lift * 0.002)}
      />

      <g transform={`translate(0 ${-pose.lift}) rotate(${pose.bodyTilt} 110 244)`}>
        <g transform={pose.facing === -1 ? 'scale(-1 1) translate(-220 0)' : undefined}>
          <g transform={`translate(0 ${bodyDrop})`}>
            {/* ===================================== HAIR — moves with the head */}
            <g clipPath="url(#hairClip)">
              <g transform={headTransform}>
                <g transform={`rotate(${hairRot} ${ART.hairL.px} ${ART.hairL.py})`}>
                  <image href={ART.hairL.href} x={ART.hairL.x} y={ART.hairL.y} width={ART.hairL.w} height={ART.hairL.h} />
                </g>
                <g transform={`rotate(${hairRot * 0.9} ${ART.hairR.px} ${ART.hairR.py})`}>
                  <image href={ART.hairR.href} x={ART.hairR.x} y={ART.hairR.y} width={ART.hairR.w} height={ART.hairR.h} />
                </g>
              </g>
            </g>

            {/* ===================================== LEGS */}
            <Leg hipX={HIP_L} hipRot={legRotL} kneeRot={kneeL} kind={spec.leg} shoe={spec.shoe} outfit={outfit} />
            <Leg hipX={HIP_R} hipRot={legRotR} kneeRot={kneeR} kind={spec.leg} shoe={spec.shoe} outfit={outfit} />

            {/* ===================================== BODY */}
            <g transform={`scale(${1 + sit * 0.06} ${1 + pose.breath * 0.008})`} style={{ transformOrigin: `110px ${HEM_Y}px` }}>
              {style === 'kurta' ? (
                <image
                  href={ART.torso.href}
                  x={ART.torso.x}
                  y={ART.torso.y}
                  width={ART.torso.w}
                  height={ART.torso.h}
                  filter={tint ? 'url(#torsoTint)' : undefined}
                />
              ) : (
                <Garment style={style} outfit={outfit} sit={sit} breath={pose.breath} />
              )}
              {/* shoulder discs — fabric behind the arm joints */}
              <circle cx={SHOULDER_L} cy={SHOULDER_Y} r={7.2} fill={spec.sleeve === 'puff' || spec.sleeve === 'short' ? outfit.dress : outfit.dress} opacity={style === 'kurta' ? 0 : 1} />
              <circle cx={SHOULDER_R} cy={SHOULDER_Y} r={7.2} fill={outfit.dress} opacity={style === 'kurta' ? 0 : 1} />
            </g>
            {/* soft chin shadow onto the collar — sits the head on the body */}
            <ellipse cx="110" cy="124" rx="22" ry="5" fill="#3A2C4D" opacity="0.16" filter="url(#chinShadow)" />

            {pose.prop === 'teddy' && <Teddy phase={ph} />}

            {/* ===================================== HEAD — her painted face, alive */}
            <g transform={headTransform}>
              <image href={ART.head.href} x={ART.head.x} y={ART.head.y} width={ART.head.w} height={ART.head.h} />
              <ellipse cx={BLUSH_L.x} cy={BLUSH_L.y} rx="7.5" ry="4.6" fill="url(#cheekG)" opacity={blushOpacity} />
              <ellipse cx={BLUSH_R.x} cy={BLUSH_R.y} rx="7.5" ry="4.6" fill="url(#cheekG)" opacity={blushOpacity} />
              <g filter="url(#lidSoft)">
                <path d={lidPath(EYE_L.x, EYE_L.y, blink)} fill={C.lidSkin} />
                <path d={lidPath(EYE_R.x, EYE_R.y, blink)} fill={C.lidSkin} />
              </g>
              <path d={lashPath(EYE_L.x, EYE_L.y, blink)} stroke={C.lash} strokeWidth="1.2" fill="none" strokeLinecap="round" strokeOpacity={lash} />
              <path d={lashPath(EYE_R.x, EYE_R.y, blink)} stroke={C.lash} strokeWidth="1.2" fill="none" strokeLinecap="round" strokeOpacity={lash} />
              {mouthOpen && (
                <g transform={`translate(${MOUTH.x} ${MOUTH.y}) scale(${mouthScale})`}>
                  <path d="M-7.5,-2.6 Q0,0 7.5,-2.6 C8,5.5 4.4,9.5 0,9.5 C-4.4,9.5 -8,5.5 -7.5,-2.6 Z" fill={C.mouthIn} />
                  <path d="M-6.6,-1.6 Q0,0.4 6.6,-1.6 L6.2,1.4 Q0,3 -6.2,1.4 Z" fill={C.teeth} />
                  <ellipse cx="0" cy="6.3" rx="3.6" ry="2.3" fill={C.tongue} />
                  <path d="M-7.5,-2.6 Q0,0 7.5,-2.6" stroke={C.lip} strokeWidth="0.9" fill="none" strokeLinecap="round" />
                </g>
              )}
            </g>

            {/* ===================================== ARMS (over everything) */}
            <Arm x={SHOULDER_L} shoulderRot={pose.armL} elbowRot={pose.elbowL} sleeve={spec.sleeve} outfit={outfit} />
            <Arm
              x={SHOULDER_R}
              shoulderRot={pose.armR}
              elbowRot={pose.elbowR}
              sleeve={spec.sleeve}
              outfit={outfit}
              prop={mugProp ?? wandProp}
              propCounter={mugProp ? -(pose.armR + pose.elbowR) * 0.9 : wandProp ? -(pose.armR + pose.elbowR) : 0}
            />

            {pose.prop === 'book' && <Book t={t} phase={ph} />}
          </g>
        </g>
      </g>
    </svg>
  )
}
