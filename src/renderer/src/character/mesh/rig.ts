/**
 * BEARi deform rig — shared skeleton math for the mesh renderer and the
 * offline mesh builder.
 *
 * The character is NOT cut into rigid pieces. She is a small number of large
 * painted layers, each triangulated into a mesh whose vertices are bound to a
 * skeleton with smooth per-vertex weights (linear blend skinning — the same
 * technique Live2D and Spine use). A vertex near a joint is influenced by
 * both bones, so the art bends instead of pivoting: no gaps, and fabric
 * curves the way cloth does.
 *
 * All geometry lives in "figure space": the painted image's own pixel
 * coordinates. The renderer maps that to the 220×250 stage at draw time.
 */

export interface Vec2 {
  x: number
  y: number
}

/** 2×3 affine matrix: x' = a·x + c·y + e,  y' = b·x + d·y + f. */
export type Mat = [number, number, number, number, number, number]

export const matIdentity = (): Mat => [1, 0, 0, 1, 0, 0]

export function matMul(m: Mat, n: Mat): Mat {
  // returns m ∘ n  (apply n first, then m)
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5]
  ]
}

export const matApply = (m: Mat, x: number, y: number): Vec2 => ({
  x: m[0] * x + m[2] * y + m[4],
  y: m[1] * x + m[3] * y + m[5]
})

export function matTRS(tx: number, ty: number, rot: number, sx = 1, sy = 1): Mat {
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  return [c * sx, s * sx, -s * sy, c * sy, tx, ty]
}

export function matInvert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2]
  const id = Math.abs(det) < 1e-9 ? 0 : 1 / det
  const a = m[3] * id
  const b = -m[1] * id
  const c = -m[2] * id
  const d = m[0] * id
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])]
}

/** A bone: a directed segment in figure space, optionally parented. */
export interface BoneDef {
  name: string
  parent: string | null
  /** Joint origin (rotation pivot) in figure space. */
  head: Vec2
  /** Far end — defines the bone's rest direction and length. */
  tail: Vec2
  /** Layers this bone may influence. */
  layers: string[]
  /** Gaussian falloff radius (figure px) for skin weights. */
  sigma: number
  /** Dynamic chain (hair / skirt / scarf) — driven by springs, not by pose. */
  chain?: { stiffness: number; damping: number; gravity: number; maxAngle: number }
}

export interface MeshLayer {
  name: string
  file: string
  /** Texture pixel rect this layer's image occupies within figure space. */
  ox: number
  oy: number
  tw: number
  th: number
  /** Interleaved vertex data (see MESH_STRIDE): x, y, u, v, b0..b3, w0..w3. */
  verts: number[]
  indices: number[]
}

export interface RigData {
  style: string
  figure: { w: number; h: number; centerX: number; headTop: number; feetY: number }
  bones: BoneDef[]
  layers: MeshLayer[]
  /** Face anchors in figure space, for procedural eyes/mouth/blush. */
  face: { eyeL: Vec2; eyeR: Vec2; eyeRx: number; eyeRy: number; mouth: Vec2; blushL: Vec2; blushR: Vec2 }
  /** Skin tone sampled from the face, for eyelids. */
  skin: string
}

/** floats per vertex: pos(2) + uv(2) + boneIdx(4) + boneWeight(4) */
export const MESH_STRIDE = 12

// ------------------------------------------------------------------ solving

export interface BoneRuntime {
  def: BoneDef
  parentIndex: number
  /** Rest world transform and its inverse (bind pose). */
  rest: Mat
  restInv: Mat
  /** Rest local transform relative to the parent. */
  local: Mat
  /** Current animated local rotation (radians), stretch and offset. */
  angle: number
  scale: number
  scaleY: number
  offX: number
  offY: number
  /** Solved world transform + skinning matrix. */
  world: Mat
  skin: Mat
  /** Spring state for dynamic chains. */
  vel: number
  prevParentAngle: number
}

export function buildRuntime(bones: BoneDef[]): BoneRuntime[] {
  const byName = new Map(bones.map((b, i) => [b.name, i]))
  const out: BoneRuntime[] = bones.map((def) => ({
    def,
    parentIndex: def.parent ? (byName.get(def.parent) ?? -1) : -1,
    rest: matIdentity(),
    restInv: matIdentity(),
    local: matIdentity(),
    angle: 0,
    scale: 1,
    scaleY: 1,
    offX: 0,
    offY: 0,
    world: matIdentity(),
    skin: matIdentity(),
    vel: 0,
    prevParentAngle: 0
  }))
  // Rest world transform: translation to the bone head, rotation = rest direction.
  for (const b of out) {
    const dir = Math.atan2(b.def.tail.y - b.def.head.y, b.def.tail.x - b.def.head.x)
    b.rest = matTRS(b.def.head.x, b.def.head.y, dir)
    b.restInv = matInvert(b.rest)
  }
  // Rest local = parentRest⁻¹ ∘ rest
  for (const b of out) {
    b.local = b.parentIndex < 0 ? b.rest : matMul(out[b.parentIndex].restInv, b.rest)
  }
  return out
}

/** Resolve world + skinning matrices from the current per-bone angles. */
export function solve(rt: BoneRuntime[]): void {
  for (const b of rt) {
    // offset is applied in figure space (post-rest), rotation/scale about the joint
    const animated = matMul(matTRS(b.offX, b.offY, 0), matMul(b.local, matTRS(0, 0, b.angle, b.scale, b.scaleY)))
    b.world = b.parentIndex < 0 ? animated : matMul(rt[b.parentIndex].world, animated)
    b.skin = matMul(b.world, b.restInv)
  }
}

/**
 * Springy secondary motion for hair / skirt / scarf chains: each dynamic bone
 * lags behind its parent, overshoots, and settles — the overlapping action
 * that makes a character feel alive rather than rigid.
 */
export function stepChains(rt: BoneRuntime[], dt: number, worldAccelX: number): void {
  for (const b of rt) {
    const c = b.def.chain
    if (!c) continue
    const parentAngle = b.parentIndex >= 0 ? rt[b.parentIndex].angle : 0
    const parentVel = (parentAngle - b.prevParentAngle) / Math.max(dt, 1e-4)
    b.prevParentAngle = parentAngle
    // target = rest, pulled by gravity and by the inertia of the parent's motion
    const target = -parentVel * 0.05 - worldAccelX * c.gravity
    const accel = (target - b.angle) * c.stiffness
    b.vel = (b.vel + accel * dt) * Math.exp(-c.damping * dt)
    b.angle += b.vel * dt
    if (b.angle > c.maxAngle) {
      b.angle = c.maxAngle
      b.vel *= -0.3
    } else if (b.angle < -c.maxAngle) {
      b.angle = -c.maxAngle
      b.vel *= -0.3
    }
  }
}

/**
 * Two-bone IK: rotate the upper and lower bone so the chain's tip reaches a
 * target. This is what makes a hand actually arrive at the chin, the lips or
 * the book instead of merely gesturing near them.
 *
 * Returns local angles (relative to rest) for [upper, lower].
 */
export function solveIK2(
  root: Vec2,
  upperLen: number,
  lowerLen: number,
  target: Vec2,
  /** +1 elbow bends one way, −1 the other. */
  flip: number,
  restUpperDir: number,
  restLowerDir: number
): [number, number] {
  const dx = target.x - root.x
  const dy = target.y - root.y
  const distRaw = Math.hypot(dx, dy)
  const max = (upperLen + lowerLen) * 0.999
  const min = Math.abs(upperLen - lowerLen) * 1.001 + 1e-4
  const dist = Math.max(min, Math.min(max, distRaw))
  const toTarget = Math.atan2(dy, dx)
  // law of cosines
  const cosA = (upperLen * upperLen + dist * dist - lowerLen * lowerLen) / (2 * upperLen * dist)
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)))
  const cosB = (upperLen * upperLen + lowerLen * lowerLen - dist * dist) / (2 * upperLen * lowerLen)
  const b = Math.acos(Math.max(-1, Math.min(1, cosB)))
  const upperWorld = toTarget + a * flip
  const lowerWorld = upperWorld + (Math.PI - b) * flip
  return [upperWorld - restUpperDir, lowerWorld - restLowerDir]
}

/** Critically-damped spring — the smooth follow used for every pose channel. */
export function springTo(current: number, velocity: number, target: number, stiffness: number, dt: number): [number, number] {
  const omega = stiffness
  const x = current - target
  const exp = Math.exp(-omega * dt)
  const newVel = (velocity - omega * omega * x * dt) * exp
  const newVal = target + (x + (velocity + omega * x) * dt) * exp
  return [newVal, newVel]
}
