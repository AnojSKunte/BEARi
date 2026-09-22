/**
 * BEARi, drawn frame by frame.
 *
 * Each pose is one complete hand-drawn picture, so there is nothing to seam,
 * nothing to gap and nothing to ghost. Three things make it move rather than
 * flicker between stills:
 *
 *   timing        every beat has its own duration, so a sip lingers and a wave
 *                 snaps (frames are held, never blended into each other)
 *   in and out    each action has an intro and an outro, so she stands up
 *                 before she walks away instead of teleporting
 *   live body     breathing, lean toward the cursor, squash on landing, dangle
 *                 while dragged - all whole-image transforms, which can never
 *                 pull her artwork apart
 *
 * She also turns on the spot when she switches between her front view and her
 * walking side view, instead of snapping around.
 */
import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import type { Pose } from '../engine/pose'
import { FRAMES } from './clips'
import { Director, EXT, STRIDE_FRACTION, desired } from './director'
import { MotionLayer, turnWidth } from './motion'

export function FrameBeari({
  pose,
  onFail
}: {
  pose: Pose
  onFail?: () => void
}): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const poseRef = useRef(pose)
  poseRef.current = pose
  const failRef = useRef(onFail)
  failRef.current = onFail

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      failRef.current?.()
      return
    }

    const images: Record<string, HTMLImageElement> = {}
    let broken = false
    const load = (id: string): void => {
      if (images[id] || broken) return
      const meta = FRAMES.clips[id]
      if (!meta) return
      const img = new Image()
      img.onerror = () => {
        broken = true
        failRef.current?.()
      }
      img.src = meta.file
      images[id] = img
    }
    // Her resting look and her walk come up with the window; the rest follow a
    // moment later so nothing stutters the first time she performs.
    load('wave')
    load('walk')
    const warm = window.setTimeout(() => {
      for (const id of Object.keys(FRAMES.clips)) load(id)
    }, 1200)

    let boxW = wrap.clientWidth || 210
    let boxH = wrap.clientHeight || 310
    const ro = new ResizeObserver(() => {
      boxW = wrap.clientWidth || boxW
      boxH = wrap.clientHeight || boxH
    })
    ro.observe(wrap)

    const dir = new Director()
    const motion = new MotionLayer()
    // Dev aid, same as window.__beariAnimator: lets tooling read which clip and
    // frame is on screen without guessing from pixels.
    ;(window as unknown as { __beariDirector?: Director }).__beariDirector = dir
    let raf = 0
    let last = performance.now()
    let prevX = pose.x
    let lastW = -1
    let lastH = -1

    const draw = (now: number): void => {
      raf = requestAnimationFrame(draw)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const p = poseRef.current

      const figScale = (boxH * 0.94) / FRAMES.standH
      const cw = EXT.w * figScale
      const ch = EXT.h * figScale
      const dpr = Math.min(3, window.devicePixelRatio || 1)
      const pxW = Math.round(cw * dpr)
      const pxH = Math.round(ch * dpr)
      if (pxW !== lastW || pxH !== lastH) {
        canvas.width = pxW
        canvas.height = pxH
        canvas.style.width = `${cw}px`
        canvas.style.height = `${ch}px`
        canvas.style.left = `${boxW / 2 - EXT.l * figScale}px`
        canvas.style.top = `${boxH - EXT.u * figScale}px`
        lastW = pxW
        lastH = pxH
      }

      const moved = p.x - prevX
      prevX = p.x
      const want = desired(p)
      const stridePx = boxH * 0.94 * STRIDE_FRACTION
      dir.update(dt, want, p.facing === -1, moved, stridePx)

      const { clip, index } = dir.frame()
      const meta = FRAMES.clips[clip]
      const img = images[clip]
      // the motion layer must see every tick, even before the art has loaded
      const m = motion.update({
        dt,
        now: now / 1000,
        pose: p,
        dir,
        clip: meta ?? null,
        index,
        figScale,
        figureH: boxH * 0.94,
        movedPx: moved,
        stridePx
      })
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cw, ch)
      if (!meta || !img || !img.complete || img.naturalWidth === 0) return

      // the spin: she narrows, swaps to the new pose, and opens out again
      const turn = turnWidth(dir.turnT)
      let sx = m.sx * turn
      if (dir.flip) sx = -sx
      let rot = m.rot
      // a spin reads better with a little counter-rotation
      if (dir.turnT < 1) rot += (1 - Math.min(1, turn)) * 3 * (dir.flip ? -1 : 1)

      ctx.save()
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      // all about her feet: shift, rotate, lean the top over (shear), scale
      ctx.translate(EXT.l * figScale + m.x, EXT.u * figScale - m.y)
      ctx.rotate((rot * Math.PI) / 180)
      ctx.transform(1, 0, m.shear, 1, 0, 0)
      ctx.scale(sx, m.sy)
      ctx.translate(-meta.anchorX * figScale, -meta.anchorY * figScale)
      ctx.drawImage(
        img,
        index * meta.cellW,
        0,
        meta.cellW,
        meta.cellH,
        0,
        0,
        meta.cellW * figScale,
        meta.cellH * figScale
      )
      ctx.restore()
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(warm)
      ro.disconnect()
      delete (window as unknown as { __beariDirector?: Director }).__beariDirector
    }
  }, [])

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', pointerEvents: 'none' }} />
    </div>
  )
}
