import { useEffect, useRef } from 'react'
import type { CSSProperties, JSX } from 'react'
import type { Emotion } from '@shared/types'
import type { Pose } from './engine/pose'
import manifestJson from './rig-manifest.json'

/**
 * Living rig — BEARi's hand-drawn artwork cut into layers (hair-l, hair-r,
 * body, arm-l, head) and animated continuously, Live2D-style:
 *
 *   • breathing, weight shift, head tilt/turn with parallax
 *   • back hair on lagging springs — it flows when she moves
 *   • a real waving arm (her right hand, like the reference hero art)
 *   • bouncy hop-walk with lean and trailing hair — no sliding cutouts
 *   • procedural eyelids, talking mouth and blush drawn over her painted face
 *   • occasional exact-art pose beats (reading, coffee, magic wand, sitting)
 *     that squash-pop in and out instead of cross-fading like a slideshow
 *
 * Pure DOM + CSS transforms — GPU-composited, no WebGL context to lose.
 */

interface RigPart {
  file: string
  x: number
  y: number
  w: number
  h: number
  pivotX: number
  pivotY: number
}

interface RigManifest {
  design: { w: number; h: number }
  parts: Record<string, RigPart>
}

/** Art beats: exact painted poses for states a standing rig cannot do. */
const ACTION_ART: Record<string, string> = {
  read: './sprites/pose-reading.png',
  coffee: './sprites/pose-coffee-time.png',
  magic: './sprites/pose-magic-wand.png',
  sit: './sprites/pose-sitting.png',
  think: './sprites/pose-thinking.png',
  celebrate: './sprites/pose-celebrating.png',
  ride: './sprites/fun-riding-cursor.png'
}
const STANDING_ART = './sprites/pose-standing.png'

/** Face geometry in design space (matches beari-front.png @ 316×550). */
const EYE_L = { x: 95, y: 170 }
const EYE_R = { x: 189, y: 169 }
const EYE_RX = 23
const EYE_RY = 27
const MOUTH = { x: 140.5, y: 220 }
const BLUSH_L = { x: 78, y: 196 }
const BLUSH_R = { x: 203, y: 196 }
const SKIN = '#fbb48c'
const LASH = '#4a2d20'

/** Per-emotion body language: head offset/tilt, squint, blush, bounce. */
const EMO: Record<Emotion, { hy: number; hr: number; squint: number; blush: number; bounce: number }> = {
  neutral: { hy: 0, hr: 0, squint: 0, blush: 0.07, bounce: 0 },
  happy: { hy: -1, hr: 1.5, squint: 0.14, blush: 0.3, bounce: 0 },
  excited: { hy: -2, hr: 0, squint: 0.1, blush: 0.42, bounce: 1 },
  thinking: { hy: 1, hr: -4, squint: 0.05, blush: 0.07, bounce: 0 },
  confused: { hy: 0, hr: 7, squint: 0, blush: 0.07, bounce: 0 },
  sad: { hy: 5, hr: -2, squint: 0.1, blush: 0, bounce: 0 },
  surprised: { hy: -3, hr: 0, squint: 0, blush: 0.15, bounce: 0 },
  blushing: { hy: 2, hr: -4, squint: 0.22, blush: 0.85, bounce: 0 },
  sleepy: { hy: 4, hr: 5, squint: 0.45, blush: 0.1, bounce: 0 },
  celebrating: { hy: -2, hr: 0, squint: 0.12, blush: 0.4, bounce: 1 },
  focused: { hy: 0, hr: -2, squint: 0.08, blush: 0.07, bounce: 0 }
}

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))
const easeOutBack = (t: number): number => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

/** Eyelid cap path: a skin dome sliding down over the eye, ellipse-clipped. */
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
    right.push(`${(cx + xx).toFixed(1)},${(cy + yy).toFixed(1)}`)
    left.push(`${(cx - xx).toFixed(1)},${(cy + yy).toFixed(1)}`)
  }
  return `M ${right.join(' L ')} L ${left.reverse().join(' L ')} Z`
}

function lashPath(cx: number, cy: number, blink: number): string {
  if (blink < 0.14) return ''
  const coverY = cy - EYE_RY + blink * EYE_RY * 2
  return `M ${cx - 19},${coverY - 2} Q ${cx},${coverY + 5} ${cx + 19},${coverY - 2}`
}

/** Bundled at build time — fetch() is unavailable under file:// in prod. */
const MANIFEST = manifestJson as RigManifest

export function RigBeari({ pose, targetH }: { pose: Pose; targetH: number }): JSX.Element | null {
  const manifest = MANIFEST
  const poseRef = useRef(pose)
  poseRef.current = pose

  const rootRef = useRef<HTMLDivElement>(null)
  const rigRef = useRef<HTMLDivElement>(null)
  const hairLRef = useRef<HTMLImageElement>(null)
  const hairRRef = useRef<HTMLImageElement>(null)
  const bodyRef = useRef<HTMLImageElement>(null)
  const armLRef = useRef<HTMLImageElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const lidLRef = useRef<SVGPathElement>(null)
  const lidRRef = useRef<SVGPathElement>(null)
  const lashLRef = useRef<SVGPathElement>(null)
  const lashRRef = useRef<SVGPathElement>(null)
  const blushLRef = useRef<HTMLDivElement>(null)
  const blushRRef = useRef<HTMLDivElement>(null)
  const mouthRef = useRef<SVGGElement>(null)
  const actionRef = useRef<HTMLImageElement>(null)
  const standHRef = useRef(296)

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      standHRef.current = img.naturalHeight
    }
    img.src = STANDING_ART
    // Warm the art-beat cache so her first painted scene pops in instantly.
    for (const src of Object.values(ACTION_ART)) {
      const pre = new Image()
      pre.src = src
    }
  }, [])

  // ------------------------------------------------------------ animation
  useEffect(() => {
    if (!manifest) return
    let raf = 0
    let last = performance.now()
    let t = 0

    // Spring / smoothed state
    let headRot = 0
    let headX = 0
    let headY = 0
    let bodyRot = 0
    let hairL = 0
    let hairLV = 0
    let hairR = 0
    let hairRV = 0
    let armRot = 0
    let blushA = 0.07
    let squintS = 0
    let talkPhase = 0
    let actionPhase = 0
    let shownAction: string | null = null
    let prevX = poseRef.current.x
    let velX = 0
    let squash = 1
    let squashV = 0
    let prevLift = 0
    let lastBlink = -1
    let lastMouth = -1

    const smooth = (v: number, target: number, dt: number, rate: number): number =>
      v + (target - v) * Math.min(1, dt * rate)

    const loop = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      t += dt
      const p = poseRef.current
      const emo = EMO[p.emotion] ?? EMO.neutral

      // ---- horizontal velocity (drives hair/lean lag)
      const vel = (p.x - prevX) / Math.max(dt, 0.001)
      velX = smooth(velX, vel, dt, 8)
      prevX = p.x

      const walking = p.mode === 'walk'

      // ---- which art beat (if any)
      const wantAction =
        p.mode === 'think'
          ? 'think'
          : p.mode === 'celebrate'
            ? 'celebrate'
            : p.mode === 'drag'
              ? 'ride'
              : p.mode === 'idle' && p.action && ACTION_ART[p.action]
                ? p.action
                : null
      if (wantAction && wantAction !== shownAction && actionPhase < 0.06) {
        shownAction = wantAction
        const el = actionRef.current
        if (el) el.src = ACTION_ART[wantAction]
      }
      if (!wantAction && actionPhase < 0.03) shownAction = null
      const actionActive = wantAction != null && wantAction === shownAction
      actionPhase = smooth(actionPhase, actionActive ? 1 : 0, dt, 9)

      // ---- head: gaze + emotion + talking bob
      const talkBob = p.talking ? Math.sin(t * 7.2) * 1.3 : 0
      // Rotation is capped tight (the crown swings on a long radius from the
      // neck pivot) — bigger gestures come from translation instead.
      const headRotT = clamp(p.headTilt * 0.9 + p.lookX * 6 + emo.hr + (p.mode === 'sleep' ? 7 : 0), -8, 8)
      const headXT = p.lookX * 7 + (walking ? clamp(velX * 0.02, -4, 4) : 0)
      const headYT =
        p.lookY * 6 - p.breath * 2.6 + emo.hy + talkBob + (p.mode === 'sleep' ? 10 : 0)
      headRot = smooth(headRot, headRotT, dt, 6)
      headX = smooth(headX, headXT, dt, 6)
      headY = smooth(headY, headYT, dt, 7)

      // ---- body: breath + tilt + walk lean
      const bodyRotT = p.bodyTilt * 0.7 + (walking ? clamp(velX * 0.012, -3.5, 3.5) : Math.sin(t * 0.55) * 0.5)
      bodyRot = smooth(bodyRot, bodyRotT, dt, 5)
      const breathScale = 1 + p.breath * 0.013

      // ---- hair: underdamped springs — follows the head with a trailing
      // lag (the spring supplies the parallax), plus velocity drag.
      const hairBase = headRot * 0.35 - clamp(velX * 0.045, -10, 10)
      const hairLT = hairBase + Math.sin(t * 0.9) * 0.9 + p.hairSway * 0.4
      const hairRT = hairBase + Math.sin(t * 0.9 + 1.3) * 0.9 + p.hairSway * 0.4
      const K = 26
      const D = 5.2
      hairLV += (hairLT - hairL) * K * dt
      hairLV *= Math.exp(-D * dt)
      hairL += hairLV * dt
      hairRV += (hairRT - hairR) * K * dt
      hairRV *= Math.exp(-D * dt)
      hairR += hairRV * dt

      // ---- arm: Animator's right-arm channel drives her waving arm
      const armSwing = walking ? Math.sin(p.legPhase) * 7 : 0
      const armRotT = clamp(-p.armR, -12, 172) * 0.96 + armSwing
      armRot = smooth(armRot, armRotT, dt, 8)

      // ---- hop + squash & stretch
      const hop = walking ? Math.abs(Math.sin(p.legPhase)) * 5 : 0
      const bounce = emo.bounce * Math.abs(Math.sin(t * 7.5)) * 6
      if (prevLift > 8 && p.lift <= 1) squashV -= 5.5
      squashV += (1 - squash) * 90 * dt
      squashV *= Math.exp(-9 * dt)
      squash += squashV * dt
      prevLift = p.lift
      const squashY = clamp(squash, 0.85, 1.1)
      const squashX = 1 + (1 - squashY) * 0.85
      const walkSquash = walking ? 1 - Math.abs(Math.cos(p.legPhase)) * 0.02 : 1

      // ---- write transforms
      const root = rootRef.current
      const rig = rigRef.current
      if (root) {
        root.style.transform = `translateY(${(-p.lift - hop - bounce).toFixed(2)}px) scaleX(${(
          squashX
        ).toFixed(4)}) scaleY(${(squashY * walkSquash).toFixed(4)})`
      }
      if (rig) {
        rig.style.opacity = (1 - actionPhase).toFixed(3)
        rig.style.transform = `rotate(${bodyRot.toFixed(2)}deg) scaleY(${(
          1 - actionPhase * 0.12
        ).toFixed(4)})`
        rig.style.visibility = actionPhase > 0.985 ? 'hidden' : 'visible'
      }
      const hl = hairLRef.current
      if (hl) hl.style.transform = `rotate(${hairL.toFixed(2)}deg)`
      const hr2 = hairRRef.current
      if (hr2) hr2.style.transform = `rotate(${hairR.toFixed(2)}deg)`
      const bd = bodyRef.current
      if (bd) bd.style.transform = `scaleY(${breathScale.toFixed(4)})`
      const am = armLRef.current
      if (am) am.style.transform = `rotate(${armRot.toFixed(2)}deg)`
      const hd = headRef.current
      if (hd) {
        hd.style.transform = `translate(${headX.toFixed(2)}px, ${(headY - p.breath * 1.4).toFixed(
          2
        )}px) rotate(${headRot.toFixed(2)}deg)`
      }

      // ---- eyelids (only redraw when blink value moves)
      squintS = smooth(squintS, emo.squint, dt, 5)
      const blink = clamp(1 - p.eyeOpen + squintS, 0, 1)
      if (Math.abs(blink - lastBlink) > 0.004) {
        lastBlink = blink
        lidLRef.current?.setAttribute('d', lidPath(EYE_L.x, EYE_L.y, blink))
        lidRRef.current?.setAttribute('d', lidPath(EYE_R.x, EYE_R.y, blink))
        const lash = blink >= 0.14 ? Math.min(1, (blink - 0.14) / 0.4) : 0
        const lL = lashLRef.current
        const lR = lashRRef.current
        if (lL) {
          lL.setAttribute('d', lashPath(EYE_L.x, EYE_L.y, blink))
          lL.setAttribute('stroke-opacity', lash.toFixed(2))
        }
        if (lR) {
          lR.setAttribute('d', lashPath(EYE_R.x, EYE_R.y, blink))
          lR.setAttribute('stroke-opacity', lash.toFixed(2))
        }
      }

      // ---- blush
      blushA = smooth(blushA, emo.blush, dt, 4)
      const bl = blushLRef.current
      const br = blushRRef.current
      if (bl) bl.style.opacity = blushA.toFixed(3)
      if (br) br.style.opacity = blushA.toFixed(3)

      // ---- talking mouth
      const talkT = p.talking ? Math.sin(now / 88) * 0.5 + 0.5 : 0
      talkPhase = smooth(talkPhase, talkT, dt, 14)
      if (Math.abs(talkPhase - lastMouth) > 0.01) {
        lastMouth = talkPhase
        const m = mouthRef.current
        if (m) {
          m.setAttribute(
            'transform',
            `translate(${MOUTH.x} ${MOUTH.y}) scale(${(0.92 + talkPhase * 0.2).toFixed(3)} ${Math.max(
              0.001,
              talkPhase
            ).toFixed(3)})`
          )
          m.setAttribute('opacity', Math.min(1, talkPhase * 2.4).toFixed(2))
        }
      }

      // ---- action art beat (squash-pop, alive while held)
      const act = actionRef.current
      if (act) {
        if (actionPhase > 0.01 && shownAction) {
          const ratio = act.naturalHeight > 0 ? act.naturalHeight / standHRef.current : 1
          const hDesign = ratio * 535
          const pop = 0.74 + 0.26 * easeOutBack(clamp(actionPhase, 0, 1))
          const liveBob = Math.sin(t * 2.1) * 2 * actionPhase
          act.style.display = 'block'
          act.style.height = `${hDesign.toFixed(1)}px`
          act.style.opacity = clamp(actionPhase * 1.5, 0, 1).toFixed(3)
          act.style.transform = `translateX(-50%) translateY(${liveBob.toFixed(2)}px) scale(${pop.toFixed(
            3
          )}) rotate(${(Math.sin(t * 0.9) * 0.8 * actionPhase).toFixed(2)}deg)`
        } else {
          act.style.display = 'none'
        }
      }

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [manifest])

  const { design, parts } = manifest
  const part = (name: string): RigPart => parts[name]
  const imgStyle = (p: RigPart): CSSProperties => ({
    position: 'absolute',
    left: p.x,
    top: p.y,
    width: p.w,
    height: p.h,
    transformOrigin: `${p.pivotX - p.x}px ${p.pivotY - p.y}px`,
    willChange: 'transform',
    pointerEvents: 'none',
    userSelect: 'none'
  })

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        pointerEvents: 'none'
      }}
    >
      {/* scale design space to the wrap height, anchored at her feet */}
      <div
        style={{
          position: 'relative',
          width: design.w,
          height: design.h,
          transform: `scale(${(targetH / design.h).toFixed(4)})`,
          transformOrigin: '50% 100%',
          flexShrink: 0
        }}
      >
        {/* squash root */}
        <div ref={rootRef} style={{ position: 'absolute', inset: 0, transformOrigin: '50% 100%' }}>
          {/* the living rig */}
          <div ref={rigRef} style={{ position: 'absolute', inset: 0, transformOrigin: '50% 96%' }}>
            <img ref={hairLRef} src="./rig/hair-l.png" alt="" draggable={false} style={imgStyle(part('hair-l'))} />
            <img ref={hairRRef} src="./rig/hair-r.png" alt="" draggable={false} style={imgStyle(part('hair-r'))} />
            <img ref={bodyRef} src="./rig/body.png" alt="" draggable={false} style={{ ...imgStyle(part('body')), transformOrigin: `${158 - part('body').x}px ${545 - part('body').y}px` }} />
            <img ref={armLRef} src="./rig/arm-l.png" alt="" draggable={false} style={imgStyle(part('arm-l'))} />

            {/* head group: painted head + procedural face, moves as one */}
            <div
              ref={headRef}
              style={{
                position: 'absolute',
                inset: 0,
                transformOrigin: '158px 252px',
                willChange: 'transform'
              }}
            >
              <img
                src="./rig/head.png"
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  left: part('head').x,
                  top: part('head').y,
                  width: part('head').w,
                  height: part('head').h,
                  pointerEvents: 'none',
                  userSelect: 'none'
                }}
              />
              <div
                ref={blushLRef}
                style={{
                  position: 'absolute',
                  left: BLUSH_L.x - 17,
                  top: BLUSH_L.y - 12,
                  width: 34,
                  height: 24,
                  borderRadius: '50%',
                  background: 'radial-gradient(closest-side, rgba(244,120,140,0.75), rgba(244,120,140,0))',
                  opacity: 0.07
                }}
              />
              <div
                ref={blushRRef}
                style={{
                  position: 'absolute',
                  left: BLUSH_R.x - 17,
                  top: BLUSH_R.y - 12,
                  width: 34,
                  height: 24,
                  borderRadius: '50%',
                  background: 'radial-gradient(closest-side, rgba(244,120,140,0.75), rgba(244,120,140,0))',
                  opacity: 0.07
                }}
              />
              <svg
                width={design.w}
                height={design.h}
                viewBox={`0 0 ${design.w} ${design.h}`}
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                <path ref={lidLRef} d="" fill={SKIN} />
                <path ref={lidRRef} d="" fill={SKIN} />
                <path ref={lashLRef} d="" stroke={LASH} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeOpacity="0" />
                <path ref={lashRRef} d="" stroke={LASH} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeOpacity="0" />
                <g ref={mouthRef} opacity="0">
                  <ellipse cx="0" cy="0" rx="16" ry="13" fill="#7e3b44" />
                  <rect x="-11.5" y="-11" width="23" height="6.5" rx="3" fill="#ffffff" />
                  <ellipse cx="0" cy="6" rx="8.5" ry="5" fill="#e4707f" />
                  <ellipse cx="0" cy="0" rx="16" ry="13" fill="none" stroke="#7e3b44" strokeWidth="1.6" strokeOpacity="0.8" />
                </g>
              </svg>
            </div>
          </div>

          {/* exact-art pose beat (reading / coffee / magic / sitting / …) */}
          <img
            ref={actionRef}
            alt=""
            draggable={false}
            style={{
              display: 'none',
              position: 'absolute',
              bottom: 6,
              left: '50%',
              transformOrigin: '50% 100%',
              willChange: 'transform, opacity',
              pointerEvents: 'none',
              userSelect: 'none'
            }}
          />
        </div>
      </div>
    </div>
  )
}
