import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { effectsBus, type EffectKind } from './effects'

interface Particle {
  id: number
  glyph: string
  x: number
  y: number
  dx: number
  size: number
  duration: number
  color?: string
  square?: boolean
}

let nextId = 1

const GLYPHS: Record<EffectKind, string[]> = {
  hearts: ['❤️', '💜', '💗'],
  sparkles: ['✨', '✨', '⭐'],
  stars: ['⭐', '🌟'],
  confetti: [],
  zzz: ['💤'],
  question: ['❓', '❔'],
  music: ['🎵', '🎶'],
  exclaim: ['❗'],
  raincloud: ['🌧️', '💧'],
  thoughts: ['💭']
}

const CONFETTI_COLORS = ['#B08DF0', '#F2A9C4', '#8B5CF6', '#F9C6A6', '#7EC8E3', '#FFD86B']

function makeParticles(kind: EffectKind, x: number, y: number): Particle[] {
  const count = kind === 'confetti' ? 18 : kind === 'zzz' || kind === 'thoughts' ? 1 : 5
  const out: Particle[] = []
  for (let i = 0; i < count; i++) {
    if (kind === 'confetti') {
      out.push({
        id: nextId++,
        glyph: '',
        square: true,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        x: x + (Math.random() - 0.5) * 140,
        y: y + Math.random() * 80,
        dx: (Math.random() - 0.5) * 120,
        size: 7 + Math.random() * 5,
        duration: 1.4 + Math.random() * 0.8
      })
    } else {
      const glyphs = GLYPHS[kind]
      out.push({
        id: nextId++,
        glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
        x: x + (Math.random() - 0.5) * 90,
        y: y + Math.random() * 60,
        dx: (Math.random() - 0.5) * 50,
        size: 16 + Math.random() * 10,
        duration: 1.6 + Math.random() * 1
      })
    }
  }
  return out
}

/** Renders transient particles; listens to the effects bus. */
export function Particles(): JSX.Element {
  const [particles, setParticles] = useState<Particle[]>([])

  useEffect(() => {
    return effectsBus.on(({ kind, x, y }) => {
      const fresh = makeParticles(kind, x, y)
      setParticles((prev) => [...prev.slice(-60), ...fresh])
      const maxMs = Math.max(...fresh.map((p) => p.duration)) * 1000 + 100
      const ids = new Set(fresh.map((p) => p.id))
      setTimeout(() => setParticles((prev) => prev.filter((p) => !ids.has(p.id))), maxMs)
    })
  }, [])

  return (
    <div className="particles" aria-hidden>
      {particles.map((p) => (
        <span
          key={p.id}
          className="particle"
          style={{
            left: p.x,
            bottom: p.y,
            fontSize: p.size,
            width: p.square ? p.size : undefined,
            height: p.square ? p.size * 0.6 : undefined,
            background: p.square ? p.color : undefined,
            animationDuration: `${p.duration}s`,
            ['--dx' as string]: `${p.dx}px`
          }}
        >
          {p.glyph}
        </span>
      ))}
    </div>
  )
}
