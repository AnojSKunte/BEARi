import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import * as PIXI from 'pixi.js'
import { install as installUnsafeEval } from '@pixi/unsafe-eval'
import { Live2DModel } from 'pixi-live2d-display/cubism4'
import type { Pose } from '../engine/pose'
import { PROFILE_CHAIN, type Live2DProfile } from './profile'

// BEARi's window runs under a strict CSP (script-src 'self'), which forbids
// eval. PIXI v6 compiles shaders with `new Function()` by default; this patch
// swaps in a CSP-safe shader system so the renderer works inside Electron.
installUnsafeEval(PIXI)

// The plugin needs PIXI on window and a registered ticker for auto-update.
;(window as unknown as { PIXI: typeof PIXI }).PIXI = PIXI
Live2DModel.registerTicker(PIXI.Ticker)

interface Props {
  pose: Pose
  characterScale: number
  /** Called with the profile that actually loaded (for the dashboard/status). */
  onReady?: (profileKey: string) => void
  /** Called if no Live2D model could load — host falls back to another renderer. */
  onMissing?: () => void
}

async function waitForCubismCore(timeoutMs = 8000): Promise<boolean> {
  const start = performance.now()
  while (performance.now() - start < timeoutMs) {
    if ((window as unknown as { Live2DCubismCore?: unknown }).Live2DCubismCore) return true
    await new Promise((r) => setTimeout(r, 60))
  }
  return false
}

async function loadFirstAvailable(): Promise<{ model: Live2DModel; profile: Live2DProfile } | null> {
  for (const profile of PROFILE_CHAIN) {
    try {
      const model = await Live2DModel.from(profile.modelUrl, { autoInteract: false })
      return { model, profile }
    } catch (err) {
      // A 404 for BEARi's not-yet-built model is expected; log anything else.
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('404')) console.warn(`[Live2D] profile "${profile.key}" failed:`, err)
    }
  }
  return null
}

/**
 * Live2D runtime stage — renders a Cubism model on a transparent, full-window
 * pixi canvas and drives it from BEARi's Pose: cursor-follow (focus), mouth
 * lip-sync while talking, emotion → expression, action mode → motion. The
 * model itself handles breathing, blinking and physics. Cross-fades between
 * motions are native to Live2D. Pointer interaction stays on the host's
 * hotspot div, so this canvas is pointer-transparent.
 */
export function Live2DStage({ pose, characterScale, onReady, onMissing }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const poseRef = useRef(pose)
  poseRef.current = pose
  const scaleRef = useRef(characterScale)
  scaleRef.current = characterScale

  useEffect(() => {
    let disposed = false
    let app: PIXI.Application | null = null
    let model: Live2DModel | null = null
    let profile: Live2DProfile | null = null
    let onResize: (() => void) | null = null
    let lastEmotion = ''
    let lastMode = ''

    const start = async (): Promise<void> => {
      const hasCore = await waitForCubismCore()
      // Unmount (e.g. StrictMode's throwaway first mount) is not a failure.
      if (disposed) return
      if (!hasCore) {
        onMissing?.()
        return
      }
      const loaded = await loadFirstAvailable()
      if (disposed) {
        loaded?.model.destroy()
        return
      }
      if (!loaded) {
        onMissing?.()
        return
      }
      model = loaded.model
      profile = loaded.profile

      app = new PIXI.Application({
        view: canvasRef.current!,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        preserveDrawingBuffer: true,
        autoStart: true
      })
      app.stage.addChild(model)
      model.anchor.set(0.5, 1)

      const layout = (): void => {
        if (!model || !app) return
        app.renderer.resize(window.innerWidth, window.innerHeight)
        const targetH = window.innerHeight * loaded.profile.fitHeight * scaleRef.current
        const natural = model.height / (model.scale.y || 1)
        model.scale.set(targetH / natural)
      }
      layout()
      onResize = layout
      window.addEventListener('resize', layout)

      // Dev aid: expose the model for inspection.
      ;(window as unknown as { __beari?: unknown }).__beari = { app, model, profile }

      model.motion(profile.motions.idle[0], profile.motions.idle[1])
      onReady?.(profile.key)

      // Per-frame drive from the latest pose.
      app.ticker.add(() => {
        if (!model || !profile) return
        const p = poseRef.current
        model.x = p.x
        model.y = window.innerHeight

        // Look toward gaze target (pose.lookX/Y are smoothed toward cursor).
        const headY = window.innerHeight - model.height * 0.72
        model.focus(p.x + p.lookX * 260, headY + p.lookY * 220)

        // Lip-sync while talking.
        try {
          const core = (model.internalModel as unknown as {
            coreModel: { setParameterValueById: (id: string, v: number) => void }
          }).coreModel
          const mouth = p.talking ? (Math.sin(performance.now() / 90) * 0.5 + 0.5) : 0
          core.setParameterValueById(profile.mouthParam, mouth)
        } catch {
          /* param may not exist on some models */
        }
      })
    }

    // React-driven side effects: emotion → expression, mode → motion.
    const stateInterval = window.setInterval(() => {
      if (!model || !profile) return
      const p = poseRef.current
      if (p.emotion !== lastEmotion) {
        lastEmotion = p.emotion
        const exp = profile.expressions[p.emotion]
        if (exp) model.expression(exp).catch(() => {})
      }
      if (p.mode !== lastMode) {
        lastMode = p.mode
        const m =
          p.mode === 'wave'
            ? profile.motions.wave
            : p.mode === 'celebrate'
              ? profile.motions.celebrate
              : p.mode === 'walk'
                ? profile.motions.walk
                : p.mode === 'sleep'
                  ? profile.motions.sleep
                  : p.mode === 'think'
                    ? profile.motions.think
                    : profile.motions.idle
        if (m) model.motion(m[0], m[1]).catch(() => {})
      }
    }, 120)

    start()

    return () => {
      disposed = true
      window.clearInterval(stateInterval)
      if (onResize) window.removeEventListener('resize', onResize)
      model?.destroy()
      app?.destroy(false, { children: true, texture: true, baseTexture: true })
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
