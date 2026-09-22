import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { AppSettings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'
import { stripDirectives } from '@shared/directives'
import { Animator } from './engine/animator'
import type { Pose } from './engine/pose'
import { restPose } from './engine/pose'
import { Beari } from './Beari'
import { SpriteBeari } from './SpriteBeari'
import { RigBeari } from './RigBeari'
import { MeshBeari } from './mesh/MeshBeari'
import { FrameBeari } from './frames/FrameBeari'
import { ModelStage } from './ModelStage'
import { Live2DStage } from './live2d/Live2DStage'
import { Particles } from './Particles'
import { Bubble } from './Bubble'
import { effectsBus, EMOTION_EFFECTS } from './effects'
import { outfitFromColor } from '../lib/color'

// Pointer hotspot around her body — matches the puppet's ~310px on-screen
// height at scale 1 so clicks land anywhere on her.
const BASE_W = 210
const BASE_H = 310

type ChatPhase = 'idle' | 'thinking' | 'streaming'

export function App(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [pose, setPose] = useState<Pose>(() => restPose(300))
  const [bubbleOpen, setBubbleOpen] = useState(false)
  const [bubbleText, setBubbleText] = useState('')
  const [phase, setPhase] = useState<ChatPhase>('idle')
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [live2dFailed, setLive2dFailed] = useState(false)
  const [meshFailed, setMeshFailed] = useState(false)
  const [framesFailed, setFramesFailed] = useState(false)
  const [modelFailed, setModelFailed] = useState(false)

  const animatorRef = useRef<Animator | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const drag = useRef<{ startX: number; moved: boolean; pointerId: number } | null>(null)

  const setInteractive = useCallback((v: boolean) => window.beari.window.setInteractive(v), [])

  // ---------------------------------------------------------- animator + RAF

  if (!animatorRef.current) {
    const a = new Animator(Math.max(240, window.innerWidth * 0.75))
    a.stageWidth = window.innerWidth
    a.onEffect = (kind, x, y) => effectsBus.emit(kind as never, x, y)
    animatorRef.current = a
    // Dev aid: lets tests/tooling drive her states directly.
    ;(window as unknown as { __beariAnimator?: Animator }).__beariAnimator = a
  }

  useEffect(() => {
    const a = animatorRef.current!
    let raf = 0
    let last = performance.now()
    const loop = (t: number): void => {
      a.tick((t - last) / 1000)
      last = t
      setPose({ ...a.pose })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    const onResize = (): void => {
      a.stageWidth = window.innerWidth
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // ---------------------------------------------------------- settings

  useEffect(() => {
    window.beari.settings.get().then(setSettings)
    return window.beari.settings.onChanged(setSettings)
  }, [])

  // In frame mode she only takes up idle actions she has really been drawn
  // doing, and the sleeping artwork brings its own zZz.
  useEffect(() => {
    const a = animatorRef.current
    if (a) a.artActionsOnly = settings.renderMode === 'frames' && !framesFailed
  }, [settings.renderMode, framesFailed])

  // ---------------------------------------------------------- cursor, sleep & wake

  useEffect(() => {
    return window.beari.cursor.onMove((info) => {
      const a = animatorRef.current!
      a.cursor = { x: info.x - info.winX, y: info.y - info.winY }
      const sleepMs = settingsRef.current.sleepAfterMinutes * 60_000
      if (sleepMs > 0 && info.idleMs > sleepMs) a.sleep()
      else if (a.isAsleep && info.idleMs < 500) a.wake()
    })
  }, [])

  // ---------------------------------------------------------- chat streaming

  useEffect(() => {
    const offChunk = window.beari.chat.onChunk(() => {
      // First token: stop "thinking", start talking.
      const a = animatorRef.current!
      a.setThinking(false)
      a.setTalking(true)
      setPhase('streaming')
    })
    return offChunk
  }, [])

  useEffect(() => {
    let buffer = ''
    const offChunk = window.beari.chat.onChunk((raw) => {
      buffer += raw
      setBubbleText(stripDirectives(buffer))
    })
    const offDone = window.beari.chat.onDone((result) => {
      buffer = ''
      const a = animatorRef.current!
      a.setTalking(false)
      setPhase('idle')
      setBubbleText(result.text)

      const { emotion, outfitColor, outfitStyle } = result.directives
      if (emotion) {
        a.setEmotion(emotion)
        const effect = EMOTION_EFFECTS[emotion]
        if (effect) effectsBus.emit(effect, a.pose.x, headHeight())
      }
      if (outfitColor) {
        const next = outfitFromColor(outfitColor, settingsRef.current.outfit)
        if (next) {
          window.beari.settings.set({ outfit: next })
          effectsBus.emit('sparkles', a.pose.x, headHeight() * 0.6)
        }
      }
      if (outfitStyle && outfitStyle !== settingsRef.current.outfitStyle) {
        window.beari.settings.set({ outfitStyle })
        effectsBus.emit('sparkles', a.pose.x, headHeight() * 0.6)
      }
    })
    const offError = window.beari.chat.onError((message) => {
      buffer = ''
      const a = animatorRef.current!
      a.setTalking(false)
      a.setThinking(false)
      a.setEmotion('sad')
      setPhase('idle')
      setBubbleText(`Oh no… ${message}`)
    })
    return () => {
      offChunk()
      offDone()
      offError()
    }
  }, [])

  const scale = settings.characterScale
  const headHeight = useCallback((): number => BASE_H * settingsRef.current.characterScale, [])

  const sendMessage = useCallback((text: string) => {
    const a = animatorRef.current!
    a.wake()
    a.setThinking(true)
    setPhase('thinking')
    setBubbleText('')
    window.beari.chat.send(text)
  }, [])

  // ---------------------------------------------------------- pointer interaction

  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    drag.current = { startX: e.clientX, moved: false, pointerId: e.pointerId }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d) return
    const a = animatorRef.current!
    if (!d.moved && Math.abs(e.clientX - d.startX) > 8) {
      d.moved = true
      a.startDrag()
    }
    if (d.moved) a.dragTo(e.clientX)
  }

  const onPointerUp = (e: React.PointerEvent): void => {
    const d = drag.current
    drag.current = null
    const a = animatorRef.current!
    if (d?.moved) {
      a.endDrag()
      return
    }
    if (e.button === 0) {
      if (a.isAsleep) {
        a.wake()
        return
      }
      setBubbleOpen((open) => !open)
      setMenu(null)
    }
  }

  const onContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }

  const w = BASE_W * scale
  const h = BASE_H * scale

  return (
    <div className="stage">
      <Particles />

      {bubbleOpen && (
        <Bubble
          x={pose.x}
          bottom={h + 16}
          stageWidth={window.innerWidth}
          text={bubbleText}
          phase={phase}
          onSend={sendMessage}
          onClose={() => {
            setBubbleOpen(false)
            setInteractive(false)
          }}
          onInteractive={setInteractive}
        />
      )}

      {/* 3D model & Live2D render as full-window layers; the wrap below stays
          as the transparent pointer hotspot around her. */}
      {settings.renderMode === 'model3d' && !modelFailed && (
        <ModelStage
          pose={pose}
          outfit={settings.outfit}
          characterScale={settings.characterScale}
          onMissing={() => setModelFailed(true)}
        />
      )}
      {settings.renderMode === 'live2d' && !live2dFailed && (
        <Live2DStage
          pose={pose}
          characterScale={settings.characterScale}
          onMissing={() => setLive2dFailed(true)}
        />
      )}

      <div
        className="beari-wrap"
        style={{ left: pose.x - w / 2, width: w, height: h }}
        onMouseEnter={() => setInteractive(true)}
        onMouseLeave={() => {
          if (!drag.current) setInteractive(false)
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={onContextMenu}
      >
        {(settings.renderMode === 'live2d' && !live2dFailed) ||
        (settings.renderMode === 'model3d' && !modelFailed) ? null : settings.renderMode === 'sprite' ? (
          <SpriteBeari pose={pose} outfit={settings.outfit} />
        ) : settings.renderMode === 'puppet' ? (
          <RigBeari pose={pose} targetH={h} />
        ) : settings.renderMode === 'frames' && !framesFailed ? (
          <FrameBeari pose={pose} onFail={() => setFramesFailed(true)} />
        ) : meshFailed ? (
          <Beari pose={pose} outfit={settings.outfit} style={settings.outfitStyle} />
        ) : (
          <MeshBeari pose={pose} style={settings.outfitStyle} onFail={() => setMeshFailed(true)} />
        )}
      </div>

      {menu && (
        <div
          className="quick-menu"
          style={{ left: Math.min(menu.x, window.innerWidth - 180), top: Math.min(menu.y, window.innerHeight - 170) }}
          onMouseEnter={() => setInteractive(true)}
          onMouseLeave={() => {
            setInteractive(false)
            setMenu(null)
          }}
        >
          <button
            onClick={() => {
              setMenu(null)
              setBubbleOpen(true)
            }}
          >
            💬 Talk to BEARi
          </button>
          <button
            onClick={() => {
              setMenu(null)
              window.beari.app.openDashboard()
            }}
          >
            🏠 Open Dashboard
          </button>
          <button
            onClick={() => {
              setMenu(null)
              animatorRef.current!.sleep()
            }}
          >
            😴 Nap time
          </button>
          <button
            onClick={() => {
              setMenu(null)
              animatorRef.current!.setEmotion('celebrating')
              effectsBus.emit('confetti', pose.x, headHeight())
            }}
          >
            🎉 Celebrate!
          </button>
          <button className="danger" onClick={() => window.beari.app.quit()}>
            ✖ Quit
          </button>
        </div>
      )}
    </div>
  )
}
