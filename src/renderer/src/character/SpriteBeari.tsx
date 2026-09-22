import { useEffect, useRef, useState } from 'react'
import type { JSX, CSSProperties } from 'react'
import type { OutfitColors } from '@shared/types'
import type { Pose } from './engine/pose'
import { Beari } from './Beari'

/**
 * Sprite renderer — displays BEARi's real reference artwork, driven by a
 * finite state machine mapped to the sprite library cut from the sheets
 * (scripts/slice-sprites.ts → /sprites/*.png).
 *
 * State transitions cross-fade over 150ms via two stacked image layers —
 * instant snapping is forbidden. Falls back to the vector renderer if the
 * sprite library is missing.
 */

const SPRITE = {
  standing: './sprites/pose-standing.png',
  walking: './sprites/pose-walking.png',
  waving: './sprites/pose-waving.png',
  celebrating: './sprites/pose-celebrating.png',
  presenting: './sprites/pose-presenting.png',
  stretching: './sprites/pose-stretching.png',
  coffee: './sprites/pose-coffee-time.png',
  reading: './sprites/pose-reading.png',
  sitting: './sprites/pose-sitting.png',
  dancing: './sprites/pose-dancing.png',
  magicWand: './sprites/pose-magic-wand.png',
  thinking: './sprites/pose-thinking.png',
  ridingCursor: './sprites/fun-riding-cursor.png',
  seqSearching: './sprites/seq-searching.png',
  seqYay: './sprites/seq-yay.png'
} as const

/** Exact-art sprites for the Animator's idle actions. */
const ACTION_SPRITE: Partial<Record<NonNullable<Pose['action']>, string>> = {
  read: SPRITE.reading,
  coffee: SPRITE.coffee,
  magic: SPRITE.magicWand,
  stretch: SPRITE.stretching,
  sit: SPRITE.sitting,
  dance: SPRITE.dancing
}

const IDLE_VARIETY = [SPRITE.standing, SPRITE.reading, SPRITE.standing, SPRITE.coffee, SPRITE.standing, SPRITE.stretching]
const CROSSFADE_MS = 150

/** Two-layer cross-fade: the incoming sprite fades in over the outgoing one. */
function useCrossfade(src: string): { a: string; b: string; showB: boolean } {
  const [layers, setLayers] = useState({ a: src, b: src, showB: false })
  useEffect(() => {
    setLayers((prev) => {
      const current = prev.showB ? prev.b : prev.a
      if (current === src) return prev
      return prev.showB ? { a: src, b: prev.b, showB: false } : { a: prev.a, b: src, showB: true }
    })
  }, [src])
  return layers
}

/** Resolve which sprite the current pose demands. */
function resolveSprite(pose: Pose, ticks: { think: boolean; idleIndex: number }, booting: boolean, yay: boolean): string {
  if (booting) return SPRITE.waving
  if (yay) return SPRITE.seqYay
  switch (pose.mode) {
    case 'drag':
      return SPRITE.ridingCursor
    case 'sleep':
      return SPRITE.sitting
    case 'wave':
      return SPRITE.waving
    case 'celebrate':
      return SPRITE.celebrating
    case 'think':
      return ticks.think ? SPRITE.thinking : SPRITE.seqSearching
    case 'walk':
      return SPRITE.walking
    default:
      if (pose.talking) return SPRITE.presenting
      if (pose.action && ACTION_SPRITE[pose.action]) return ACTION_SPRITE[pose.action]!
      return IDLE_VARIETY[ticks.idleIndex % IDLE_VARIETY.length]
  }
}

export function SpriteBeari({ pose, outfit }: { pose: Pose; outfit: OutfitColors }): JSX.Element {
  const [missing, setMissing] = useState(false)
  const [thinkTick, setThinkTick] = useState(true)
  const [idleIndex, setIdleIndex] = useState(0)
  const [booting, setBooting] = useState(true)
  const [yay, setYay] = useState(false)
  const wasTalking = useRef(false)

  // Boot: slide in with "Good Morning!" then settle into idle.
  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 2800)
    return () => clearTimeout(t)
  }, [])

  // Thinking loop: alternate thinking ↔ searching while the AI works.
  useEffect(() => {
    if (pose.mode !== 'think') return
    const t = setInterval(() => setThinkTick((v) => !v), 1400)
    return () => clearInterval(t)
  }, [pose.mode])

  // Idle variety: standing → reading → coffee → stretching …
  useEffect(() => {
    const t = setInterval(() => setIdleIndex((i) => i + 1), 9000)
    return () => clearInterval(t)
  }, [])

  // Success beat: when she stops talking, celebrate with "Yay!" briefly.
  useEffect(() => {
    if (wasTalking.current && !pose.talking && pose.mode === 'idle') {
      setYay(true)
      const t = setTimeout(() => setYay(false), 1100)
      return () => clearTimeout(t)
    }
    wasTalking.current = pose.talking
    return undefined
  }, [pose.talking, pose.mode])
  useEffect(() => {
    wasTalking.current = pose.talking
  }, [pose.talking])

  const src = resolveSprite(pose, { think: thinkTick, idleIndex }, booting, yay)
  const { a, b, showB } = useCrossfade(src)

  if (missing) return <Beari pose={pose} outfit={outfit} />

  const breathScale = 1 + pose.breath * 0.012
  const walkBob = pose.legSwing > 0.05 ? Math.abs(Math.sin(pose.legPhase)) * 2 : 0
  const layerStyle = (visible: boolean): CSSProperties => ({
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    objectPosition: 'bottom',
    opacity: visible ? 1 : 0,
    transition: `opacity ${CROSSFADE_MS}ms ease`,
    pointerEvents: 'none'
  })

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        transform: [
          `translateY(${-pose.lift - walkBob}px)`,
          `rotate(${pose.bodyTilt * 0.6}deg)`,
          `scaleX(${pose.facing})`,
          `scaleY(${breathScale})`
        ].join(' '),
        transformOrigin: '50% 100%',
        transition: 'transform 60ms linear'
      }}
    >
      <img src={a} alt="" draggable={false} style={layerStyle(!showB)} onError={() => setMissing(true)} />
      <img src={b} alt="" draggable={false} style={layerStyle(showB)} />
    </div>
  )
}
