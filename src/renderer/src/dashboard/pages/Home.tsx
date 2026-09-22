import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { AppSettings, BrainStats } from '@shared/types'
import { Icon } from '../Icon'
import { UpdateCard } from '../UpdateCard'

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini'
}

const MODE_NAMES: Record<string, string> = {
  frames: 'Hand-drawn',
  vector: 'Painted & animated',
  model3d: '3D BEARi',
  sprite: 'Artwork sprite',
  puppet: 'Layered art rig',
  live2d: 'Live2D'
}

export function HomePage({
  settings,
  onNavigate
}: {
  settings: AppSettings
  onNavigate: (page: string) => void
}): JSX.Element {
  const [stats, setStats] = useState<BrainStats | null>(null)

  useEffect(() => {
    let alive = true
    const refresh = (): void => {
      window.beari.brain.snapshot().then((s) => {
        if (alive) setStats(s.stats)
      })
    }
    refresh()
    const off = window.beari.brain.onChanged(refresh)
    return () => {
      alive = false
      off()
    }
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const name = settings.userName || 'friend'
  const provider = settings.ai.activeProvider
  const hasKey = !!settings.ai.providers[provider]?.apiKey
  const eyes = settings.awareness.enabled ? 'Watching to help' : 'Not watching'

  return (
    <div className="page">
      <div className="hero card">
        <div className="hero-text">
          <h1>
            {greeting}, {name}!
          </h1>
          <p className="muted">
            BEARi is living on your desktop right now — <em style={{ fontStyle: 'normal', fontWeight: 600 }}>click her</em>{' '}
            to talk, drag her around, or right-click her for quick actions.
          </p>
        </div>
        <img className="hero-art" src="./puppet/beari-wave.png" alt="BEARi waving" />
      </div>

      <UpdateCard compact />

      <div className="stat-row">
        <div className="stat">
          <div className="stat-icon">
            <Icon name="brain" size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="stat-label">Brain</div>
            <div className="stat-value">
              <span className={`dot ${hasKey ? 'ok' : 'off'}`} />
              {PROVIDER_NAMES[provider]} {hasKey ? '' : '· no key'}
            </div>
          </div>
        </div>
        <div className="stat">
          <div className="stat-icon pink">
            <Icon name="notebook" size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="stat-label">She knows</div>
            <div className="stat-value">{stats === null ? '…' : `${stats.facts} things`}</div>
          </div>
        </div>
        <div className="stat">
          <div className="stat-icon good">
            <Icon name="eye" size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="stat-label">Eyes</div>
            <div className="stat-value">{eyes}</div>
          </div>
        </div>
        <div className="stat">
          <div className="stat-icon peach">
            <Icon name="wand" size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="stat-label">Look</div>
            <div className="stat-value">{MODE_NAMES[settings.renderMode] ?? settings.renderMode}</div>
          </div>
        </div>
      </div>

      {!hasKey && (
        <div className="card notice">
          <div className="notice-icon">
            <Icon name="spark" size={20} />
          </div>
          <div className="grow">
            <strong>One step left to wake up her brain</strong>
            <p className="muted">
              Add an API key so BEARi can think, talk and learn. Everything else — walking, emotions, outfits, naps —
              already works without it.
            </p>
          </div>
          <button className="btn primary" onClick={() => onNavigate('providers')}>
            Set up AI
          </button>
        </div>
      )}

      <div className="grid-3">
        <button className="card action" onClick={() => onNavigate('memory')}>
          <span className="action-icon">
            <Icon name="brain" size={19} />
          </span>
          <strong>Open her mind</strong>
          <p className="muted">What she knows about you, her timeline and reflections</p>
        </button>
        <button className="card action" onClick={() => onNavigate('awareness')}>
          <span className="action-icon">
            <Icon name="eye" size={19} />
          </span>
          <strong>Let her see</strong>
          <p className="muted">Decide if, when and where she may look at your screen</p>
        </button>
        <button className="card action" onClick={() => onNavigate('character')}>
          <span className="action-icon">
            <Icon name="palette" size={19} />
          </span>
          <strong>Dress her up</strong>
          <p className="muted">Looks, outfit colors and size on screen</p>
        </button>
      </div>

      <div className="card">
        <h2>
          <Icon name="spark" size={16} />
          Little things she does
        </h2>
        <ul className="tips">
          <li>
            <Icon name="chat" size={15} />
            <span>
              <em>Click her</em> and say hi — she remembers what matters to you, and forgets what does not.
            </span>
          </li>
          <li>
            <Icon name="moon" size={15} />
            <span>While she sleeps she thinks over her day and writes down what she has worked out about you.</span>
          </li>
          <li>
            <Icon name="palette" size={15} />
            <span>
              Tell her <em>“wear something blue”</em> and watch her outfit change.
            </span>
          </li>
          <li>
            <Icon name="cursor" size={15} />
            <span>She watches your cursor, reads her book, sips coffee, and dances.</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
