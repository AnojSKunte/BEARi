import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import * as PIXI from 'pixi.js'
import { install as installUnsafeEval } from '@pixi/unsafe-eval'
import type { Pose, PropKind } from './engine/pose'

// Strict CSP forbids eval; PIXI v6 compiles shaders with eval unless patched.
installUnsafeEval(PIXI)

/**
 * Living puppet renderer v2 — BEARi's real artwork brought to life in layers
 * (the Live2D idea, hand-built):
 *
 *  • deformable mesh on the base art: breathing, sway, cursor lean, head nod
 *  • separate FACE layer on top: eyelids that blink, a mouth that opens and
 *    talks (the art's own closed smile shows when quiet)
 *  • PROPS (book / mug / wand / teddy) that appear and disappear softly —
 *    spring-pop in, fade-scale out, gentle float while held
 *  • pose swaps (front / side-walk / wave) with 180 ms cross-fades — nothing
 *    ever snaps
 *  • spring-damper motion everywhere (v = (v + Δ·k) · d — the Shimeji
 *    constant), plus squash & stretch on landing
 *
 * Purely driven by the shared Pose from the Animator.
 */

const ART = {
  front: '/puppet/beari-front.png',
  side: '/puppet/beari-side.png',
  wave: '/puppet/beari-wave.png'
} as const

const PROP_ART: Record<Exclude<PropKind, 'none'>, string> = {
  book: '/puppet/props/book.png',
  mug: '/puppet/props/mug.png',
  wand: '/puppet/props/wand.png',
  teddy: '/puppet/props/teddy.png'
}

/**
 * Exact-art action poses, straight from the reference sheets. While one is
 * active the living mesh cross-fades into the painted pose, so every action
 * shows her real artwork.
 */
type ActionArt = 'read' | 'coffee' | 'magic' | 'stretch' | 'sit' | 'dance' | 'think' | 'celebrate' | 'ride'
const ACTION_ART: Record<ActionArt, string> = {
  read: '/sprites/pose-reading.png',
  coffee: '/sprites/pose-coffee-time.png',
  magic: '/sprites/pose-magic-wand.png',
  stretch: '/sprites/pose-stretching.png',
  sit: '/sprites/pose-sitting.png',
  dance: '/sprites/pose-dancing.png',
  think: '/sprites/pose-thinking.png',
  celebrate: '/sprites/pose-celebrating.png',
  ride: '/sprites/fun-riding-cursor.png'
}
/** Reference for size normalisation: her standing pose from the same sheet. */
const STANDING_ART = '/sprites/pose-standing.png'

/** Face geometry measured on beari-front.png (316 × 550). */
const FACE = {
  texW: 316,
  texH: 550,
  eyeL: { x: 95, y: 170 },
  eyeR: { x: 189, y: 169 },
  eyeRx: 24,
  eyeRy: 23,
  lidTopY: 146,
  mouth: { x: 140.5, y: 219 },
  skin: 0xfbb48c,
  skinEdge: 0xd98d66,
  lash: 0x4a2d20,
  mouthIn: 0x7e3b44,
  tongue: 0xe4707f,
  teeth: 0xffffff
}

/** Prop anchors in front-texture coordinates + presentation. */
const PROP_POSE: Record<Exclude<PropKind, 'none'>, { x: number; y: number; scale: number; rot: number }> = {
  book: { x: 140, y: 344, scale: 1.15, rot: -0.06 },
  mug: { x: 243, y: 385, scale: 0.95, rot: 0.08 },
  wand: { x: 252, y: 360, scale: 1.0, rot: -0.5 },
  teddy: { x: 140, y: 350, scale: 1.1, rot: 0.06 }
}

const COLS = 14
const ROWS = 20
/**
 * Her on-screen height at scale 1, in px. The character bible's size
 * previews run 120–320px — ~310px reads as "small companion", not "takes
 * over the screen", and the scale slider covers 185–500px around it.
 */
const BASE_PX = 310

/** Shimeji-style spring-damper: returns new [value, velocity]. */
function spring(value: number, vel: number, target: number, k = 0.14, d = 0.85): [number, number] {
  const v = (vel + (target - value) * k) * d
  return [value + v, v]
}

const easeOutBack = (t: number): number => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

export function PuppetStage({
  pose,
  characterScale,
  onMissing
}: {
  pose: Pose
  characterScale: number
  onMissing?: () => void
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const poseRef = useRef(pose)
  poseRef.current = pose
  const scaleRef = useRef(characterScale)
  scaleRef.current = characterScale

  useEffect(() => {
    let disposed = false
    let app: PIXI.Application | null = null
    let onResize: (() => void) | null = null

    const start = async (): Promise<void> => {
      let frontTex: PIXI.Texture, sideTex: PIXI.Texture, waveTex: PIXI.Texture
      const propTex: Partial<Record<Exclude<PropKind, 'none'>, PIXI.Texture>> = {}
      const actionTex: Partial<Record<ActionArt, PIXI.Texture>> = {}
      let standingTex: PIXI.Texture | null = null
      try {
        ;[frontTex, sideTex, waveTex] = await Promise.all([
          PIXI.Texture.fromURL(ART.front),
          PIXI.Texture.fromURL(ART.side),
          PIXI.Texture.fromURL(ART.wave)
        ])
        for (const key of Object.keys(PROP_ART) as Exclude<PropKind, 'none'>[]) {
          propTex[key] = await PIXI.Texture.fromURL(PROP_ART[key])
        }
      } catch {
        if (!disposed) onMissing?.()
        return
      }
      // Action art is an enhancement — missing files simply keep her procedural.
      try {
        standingTex = await PIXI.Texture.fromURL(STANDING_ART)
        for (const key of Object.keys(ACTION_ART) as ActionArt[]) {
          actionTex[key] = await PIXI.Texture.fromURL(ACTION_ART[key])
        }
      } catch {
        standingTex = null
      }
      if (disposed) return

      app = new PIXI.Application({
        view: canvasRef.current!,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        preserveDrawingBuffer: true,
        autoStart: true
      })

      // ---------------------------------------------------------------- root
      const root = new PIXI.Container()
      app.stage.addChild(root)

      // ------------------------------------------------------- front (mesh)
      const texW = FACE.texW
      const texH = FACE.texH
      const plane = new PIXI.SimplePlane(frontTex, COLS + 1, ROWS + 1)
      plane.pivot.set(texW / 2, texH)
      root.addChild(plane)
      const buffer = plane.geometry.getBuffer('aVertexPosition')
      const rest = Float32Array.from(buffer.data)

      // Displacement of the warp at a given rest point — shared with overlays
      // so face parts and props ride the same breathing/sway motion.
      let breathe = 0
      let sway = 0
      let hairJiggle = 0
      let nod = 0
      const dispAt = (rx: number, ry: number): { dx: number; dy: number } => {
        const v = 1 - ry / texH
        const chest = Math.exp(-Math.pow(v - 0.55, 2) / 0.06)
        const head = Math.max(0, (v - 0.55) / 0.45)
        return {
          dx: (rx - texW / 2) * breathe * chest * 0.02 + sway * v * v * texW + hairJiggle * Math.max(0, v - 0.7) * texW,
          dy: -breathe * chest * texH * 0.012 + nod * head * texH * 0.014
        }
      }

      // ------------------------------------------------------- face overlays
      const face = new PIXI.Container()
      plane.addChild(face)

      // Eyelids: an eye-shaped skin cap that grows downward over the iris,
      // its edges softly BLURRED so the skin melts into her shaded face
      // (no hard patch), plus a crisp curved lash line with an outer hook —
      // the combination reads as a real closing eye, not a blank disc.
      const EYE_RX = 23
      const EYE_RY = 27
      const drawLidFill = (g: PIXI.Graphics, blink: number): void => {
        g.clear()
        if (blink < 0.03) return
        const top = -EYE_RY
        const coverY = top + blink * EYE_RY * 2
        const steps = 14
        const pts: [number, number][] = []
        for (let s = 0; s <= steps; s++) {
          const yy = top + (coverY - top) * (s / steps)
          const xx = EYE_RX * Math.sqrt(Math.max(0, 1 - (yy / EYE_RY) ** 2))
          pts.push([xx, yy])
        }
        for (let s = steps; s >= 0; s--) {
          const yy = top + (coverY - top) * (s / steps)
          const xx = -EYE_RX * Math.sqrt(Math.max(0, 1 - (yy / EYE_RY) ** 2))
          pts.push([xx, yy])
        }
        g.beginFill(FACE.skin)
        g.moveTo(pts[0][0], pts[0][1])
        for (const [x, y] of pts) g.lineTo(x, y)
        g.closePath()
        g.endFill()
      }
      const drawLash = (g: PIXI.Graphics, blink: number, dir: 1 | -1): void => {
        g.clear()
        if (blink < 0.14) return
        const coverY = -EYE_RY + blink * EYE_RY * 2
        const a = Math.min(1, (blink - 0.14) / 0.4)
        g.lineStyle(2.6 * a, FACE.lash, a)
        g.moveTo(-19, coverY - 2)
        g.quadraticCurveTo(0, coverY + 5, 19, coverY - 2)
        const hx = 19 * dir
        g.moveTo(hx, coverY - 2)
        g.lineTo(hx + 4 * dir, coverY - 7)
      }
      const lidL = new PIXI.Graphics()
      const lidR = new PIXI.Graphics()
      lidL.filters = [new PIXI.filters.BlurFilter(3, 3)]
      lidR.filters = [new PIXI.filters.BlurFilter(3, 3)]
      const lashLg = new PIXI.Graphics()
      const lashRg = new PIXI.Graphics()
      face.addChild(lidL, lidR, lashLg, lashRg)

      // Soft cheek blush — pink radial sprites brightened by warm emotions.
      const blushTex = ((): PIXI.Texture => {
        const c = document.createElement('canvas')
        c.width = c.height = 64
        const ctx = c.getContext('2d')!
        const grd = ctx.createRadialGradient(32, 32, 2, 32, 32, 30)
        grd.addColorStop(0, 'rgba(244,120,140,0.9)')
        grd.addColorStop(1, 'rgba(244,120,140,0)')
        ctx.fillStyle = grd
        ctx.fillRect(0, 0, 64, 64)
        return PIXI.Texture.from(c)
      })()
      const blushL = new PIXI.Sprite(blushTex)
      const blushR = new PIXI.Sprite(blushTex)
      blushL.anchor.set(0.5)
      blushR.anchor.set(0.5)
      blushL.width = blushL.height = 34
      blushR.width = blushR.height = 34
      blushL.alpha = 0
      blushR.alpha = 0
      face.addChild(blushL, blushR)

      // Talking mouth — sits over the art's closed smile, opens naturally.
      const mouth = new PIXI.Graphics()
      mouth.beginFill(FACE.mouthIn)
      mouth.drawEllipse(0, 0, 16, 13)
      mouth.endFill()
      mouth.beginFill(FACE.teeth)
      mouth.drawRoundedRect(-11.5, -11, 23, 6.5, 3)
      mouth.endFill()
      mouth.beginFill(FACE.tongue)
      mouth.drawEllipse(0, 6, 8.5, 5)
      mouth.endFill()
      mouth.lineStyle(1.6, FACE.mouthIn, 0.8)
      mouth.drawEllipse(0, 0, 16, 13)
      mouth.position.set(FACE.mouth.x, FACE.mouth.y - 2)
      mouth.scale.set(1, 0)
      mouth.alpha = 0
      face.addChild(mouth)

      // ------------------------------------------------------- prop sprite
      const prop = new PIXI.Sprite(PIXI.Texture.EMPTY)
      prop.anchor.set(0.5)
      prop.alpha = 0
      plane.addChild(prop)
      let shownProp: PropKind = 'none'

      // ------------------------------------------- side & wave pose sprites
      const side = new PIXI.Sprite(sideTex)
      side.anchor.set(0.5, 1)
      side.alpha = 0
      root.addChild(side)
      const wave = new PIXI.Sprite(waveTex)
      wave.anchor.set(0.5, 1)
      wave.alpha = 0
      root.addChild(wave)

      // ------------------------------------------ exact-art action sprite
      const actionSpr = new PIXI.Sprite(PIXI.Texture.EMPTY)
      actionSpr.anchor.set(0.5, 1)
      actionSpr.alpha = 0
      root.addChild(actionSpr)
      let shownAction: ActionArt | null = null

      // ------------------------------------------------------------ layout
      const layout = (): void => {
        if (!app) return
        app.renderer.resize(window.innerWidth, window.innerHeight)
      }
      layout()
      onResize = layout
      window.addEventListener('resize', layout)

      // ------------------------------------------------------------ ticker
      const t0 = performance.now()
      let xPos = poseRef.current.x
      let xVel = 0
      let frontA = 1
      let sideA = 0
      let waveA = 0
      let actionA = 0
      let talkPhase = 0
      let squashT = 1
      let squashVel = 0
      let prevLift = 0
      let propScale = 0

      app.ticker.add(() => {
        if (!app) return
        // Dev/testing hook: an override pose wins over the React-synced one
        // (used by headless verification where rAF-driven React is frozen).
        const p = (window as unknown as { __beariPoseOverride?: Pose }).__beariPoseOverride ?? poseRef.current
        const t = (performance.now() - t0) / 1000
        const dt = Math.min(app.ticker.deltaMS / 1000, 0.05)

        // ---- global measures
        const targetH = Math.min(BASE_PX * scaleRef.current, window.innerHeight * 0.95)
        const meshScale = targetH / texH

        // ---- soft x follow (spring-damper) + squash on landing
        ;[xPos, xVel] = spring(xPos, xVel, p.x, 0.16, 0.84)
        if (prevLift > 8 && p.lift <= 1) squashVel -= 0.9 // impulse: just landed
        ;[squashT, squashVel] = spring(squashT, squashVel, 1, 0.3, 0.78)
        prevLift = p.lift
        const squashY = Math.max(0.82, Math.min(1.12, squashT))
        const squashX = 1 + (1 - squashY) * 0.9

        root.position.set(xPos, window.innerHeight - p.lift)
        root.rotation = (p.bodyTilt * Math.PI) / 180 * 0.5

        // ---- which exact-art action (if any) the pose demands
        const wantAction: ActionArt | null = !standingTex
          ? null
          : p.mode === 'think' && actionTex.think
            ? 'think'
            : p.mode === 'celebrate' && actionTex.celebrate
              ? 'celebrate'
              : p.mode === 'drag' && actionTex.ride
                ? 'ride'
                : p.mode === 'idle' && p.action && actionTex[p.action]
                  ? p.action
                  : null

        // Swap the texture only while the layer is (nearly) invisible.
        if (wantAction && wantAction !== shownAction && actionA < 0.05) {
          shownAction = wantAction
          actionSpr.texture = actionTex[wantAction]!
        }
        if (!wantAction && actionA < 0.02) shownAction = null
        const actionActive = wantAction != null && wantAction === shownAction

        // ---- pose cross-fade targets (180ms feel via lerp rate 9)
        const wantSide = p.mode === 'walk'
        const wantWave = p.mode === 'wave' || (p.mode === 'celebrate' && !actionTex.celebrate)
        const fade = Math.min(1, dt * 9)
        frontA += ((!wantSide && !wantWave && !actionActive ? 1 : 0) - frontA) * fade
        sideA += ((wantSide ? 1 : 0) - sideA) * fade
        waveA += ((wantWave ? 1 : 0) - waveA) * fade
        actionA += ((actionActive ? 1 : 0) - actionA) * fade

        // ---- front mesh warp
        breathe = Math.sin(t * 1.8) * 0.5 + 0.5
        sway = Math.sin(t * 0.9) * 0.01 + p.lookX * 0.045
        hairJiggle = Math.sin(t * 2.3) * 0.006 + xVel * 0.0004
        nod = p.lookY * 0.7 + (p.mode === 'sleep' ? 0.9 : 0)

        const data = buffer.data as unknown as Float32Array
        for (let i = 0; i < rest.length; i += 2) {
          const d = dispAt(rest[i], rest[i + 1])
          data[i] = rest[i] + d.dx
          data[i + 1] = rest[i + 1] + d.dy
        }
        buffer.update()

        plane.alpha = frontA
        plane.visible = frontA > 0.01
        plane.scale.set(meshScale * squashX, meshScale * squashY)

        // ---- face overlays ride the warp
        const headDisp = dispAt(FACE.eyeL.x, FACE.eyeL.y)
        const blink = 1 - p.eyeOpen
        const eyeLx = FACE.eyeL.x + headDisp.dx
        const eyeLy = FACE.eyeL.y + headDisp.dy
        const eyeRx2 = FACE.eyeR.x + headDisp.dx
        const eyeRy2 = FACE.eyeR.y + headDisp.dy
        lidL.position.set(eyeLx, eyeLy)
        lidR.position.set(eyeRx2, eyeRy2)
        lashLg.position.set(eyeLx, eyeLy)
        lashRg.position.set(eyeRx2, eyeRy2)
        drawLidFill(lidL, blink)
        drawLidFill(lidR, blink)
        drawLash(lashLg, blink, -1)
        drawLash(lashRg, blink, 1)

        // cheek blush by emotion
        const blushA =
          p.emotion === 'blushing' ? 0.85 : p.emotion === 'excited' ? 0.4 : p.emotion === 'happy' ? 0.32 : 0.08
        const bl = dispAt(78, 196)
        const br = dispAt(203, 196)
        blushL.position.set(78 + bl.dx, 196 + bl.dy)
        blushR.position.set(203 + br.dx, 196 + br.dy)
        blushL.alpha += (blushA - blushL.alpha) * Math.min(1, dt * 4)
        blushR.alpha = blushL.alpha

        const mouthDisp = dispAt(FACE.mouth.x, FACE.mouth.y)
        const talkTarget = p.talking ? Math.sin(performance.now() / 88) * 0.5 + 0.5 : 0
        talkPhase += (talkTarget - talkPhase) * Math.min(1, dt * 14)
        mouth.position.set(FACE.mouth.x + mouthDisp.dx, FACE.mouth.y - 2 + mouthDisp.dy)
        mouth.scale.set(0.92 + talkPhase * 0.2, Math.max(0.001, talkPhase))
        mouth.alpha = Math.min(1, talkPhase * 2.4)

        // ---- prop: spring-pop in, soft out, float while held
        if (p.prop !== 'none' && p.prop !== shownProp) {
          shownProp = p.prop
          const tex = propTex[p.prop]
          if (tex) prop.texture = tex
        }
        if (p.prop === 'none' && p.propPhase < 0.03) shownProp = 'none'
        if (shownProp !== 'none') {
          const anchor = PROP_POSE[shownProp]
          const pd = dispAt(anchor.x, anchor.y)
          const phase = Math.max(0, Math.min(1, p.propPhase))
          propScale = anchor.scale * (phase >= 1 ? 1 : easeOutBack(phase))
          const bob = Math.sin(t * 2.1) * 4 * phase
          const sip = shownProp === 'mug' ? Math.max(0, Math.sin(p.actionTime * 0.9)) * -14 : 0
          prop.position.set(anchor.x + pd.dx, anchor.y + pd.dy + bob + sip)
          prop.rotation = anchor.rot + Math.sin(t * 1.7) * 0.04
          prop.scale.set(propScale)
          prop.alpha = phase
          prop.visible = phase > 0.01
        } else {
          prop.visible = false
        }

        // ---- side (walk) sprite: flip toward travel, bob with steps
        if (sideA > 0.01) {
          const sScale = targetH / sideTex.height
          side.visible = true
          side.alpha = sideA
          side.scale.set(sScale * (p.facing === 1 ? -1 : 1), sScale)
          side.position.set(0, 0)
          side.rotation = Math.sin(p.legPhase) * 0.035
        } else side.visible = false

        // ---- wave sprite
        if (waveA > 0.01) {
          const wScale = targetH / waveTex.height
          wave.visible = true
          wave.alpha = waveA
          wave.scale.set(wScale, wScale * (1 + Math.sin(t * 6) * 0.008))
          wave.position.set(0, 0)
        } else wave.visible = false

        // ---- exact-art action pose: her painted artwork, kept gently alive.
        // Size is normalised against her standing art from the same sheet so
        // sitting poses stay naturally shorter instead of being stretched.
        if (actionA > 0.01 && shownAction && standingTex) {
          const k = targetH / standingTex.height
          actionSpr.visible = true
          actionSpr.alpha = actionA
          actionSpr.scale.set(k, k * (1 + Math.sin(t * 1.8) * 0.007))
          actionSpr.position.set(0, Math.sin(t * 2.1) * 2 * actionA)
          actionSpr.rotation = Math.sin(t * 0.9) * 0.012
        } else actionSpr.visible = false
      })

      // Dev aid for verification.
      ;(window as unknown as { __beariPuppet?: unknown }).__beariPuppet = {
        app,
        plane,
        face,
        prop,
        side,
        wave,
        actionSpr
      }
    }

    // Any construction failure (missing art, WebGL limits, context loss)
    // must fall back to the vector renderer instead of leaving her invisible.
    start().catch(() => {
      if (!disposed) onMissing?.()
    })
    return () => {
      disposed = true
      if (onResize) window.removeEventListener('resize', onResize)
      app?.destroy(false, { children: true, texture: false, baseTexture: false })
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
