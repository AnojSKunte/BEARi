import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { UpdateState } from '@shared/types'
import { Icon } from './Icon'

const EMPTY: UpdateState = {
  phase: 'idle',
  currentVersion: '',
  latestVersion: null,
  releaseNotes: null,
  releaseDate: null,
  percent: 0,
  message: null,
  checkedAt: null
}

export function useUpdateState(): UpdateState {
  const [state, setState] = useState<UpdateState>(EMPTY)
  useEffect(() => {
    window.beari.update.state().then(setState)
    return window.beari.update.onChanged(setState)
  }, [])
  return state
}

/**
 * One card for the whole update story: quiet when she's current, a clear
 * button when a newer BEARi exists, progress while it downloads, and a
 * restart button when it is ready. `compact` hides the quiet states (Home).
 */
export function UpdateCard({ compact = false }: { compact?: boolean }): JSX.Element | null {
  const s = useUpdateState()
  const busy = s.phase === 'checking' || s.phase === 'downloading'
  const actionable = s.phase === 'available' || s.phase === 'downloaded' || s.phase === 'downloading'
  if (compact && !actionable) return null

  const title =
    s.phase === 'available'
      ? `BEARi ${s.latestVersion} is available`
      : s.phase === 'downloading'
        ? `Downloading BEARi ${s.latestVersion}…`
        : s.phase === 'downloaded'
          ? `BEARi ${s.latestVersion} is ready to install`
          : s.phase === 'checking'
            ? 'Checking for updates…'
            : s.phase === 'up-to-date'
              ? 'You have the latest BEARi'
              : s.phase === 'error'
                ? 'Could not check for updates'
                : s.phase === 'unsupported'
                  ? 'Updates'
                  : 'Updates'

  const detail =
    s.phase === 'available'
      ? `You have ${s.currentVersion}. Download in the background, then restart whenever you like.`
      : s.phase === 'downloaded'
        ? 'She will close, update herself and come right back.'
        : s.phase === 'up-to-date'
          ? `Version ${s.currentVersion}${s.checkedAt ? ` · checked ${new Date(s.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`
          : s.phase === 'unsupported'
            ? s.message ?? 'Updates only work in the installed app.'
            : s.phase === 'error'
              ? s.message ?? 'Something went wrong.'
              : s.phase === 'downloading'
                ? `${s.percent}%`
                : `Version ${s.currentVersion}`

  return (
    <div className={`card update-card ${actionable ? 'live' : ''}`}>
      <div className={`notice-icon ${actionable ? 'lav' : ''}`}>
        <Icon name="rocket" size={20} />
      </div>
      <div className="grow" style={{ minWidth: 0 }}>
        <strong>{title}</strong>
        <p className="muted">{detail}</p>
        {s.phase === 'downloading' && (
          <div className="progress">
            <span style={{ width: `${s.percent}%` }} />
          </div>
        )}
        {!compact && s.releaseNotes && (s.phase === 'available' || s.phase === 'downloaded') && (
          <details className="notes">
            <summary>What changed</summary>
            <pre>{s.releaseNotes}</pre>
          </details>
        )}
      </div>
      <div className="row" style={{ flexShrink: 0 }}>
        {s.phase === 'available' && (
          <button className="btn primary" onClick={() => window.beari.update.download()}>
            <Icon name="download" size={15} />
            Download
          </button>
        )}
        {s.phase === 'downloaded' && (
          <button className="btn primary" onClick={() => window.beari.update.install()}>
            <Icon name="refresh" size={15} />
            Restart &amp; update
          </button>
        )}
        {!compact && !actionable && s.phase !== 'unsupported' && (
          <button className="btn ghost" disabled={busy} onClick={() => window.beari.update.check()}>
            <Icon name="refresh" size={15} />
            {busy ? 'Checking…' : 'Check now'}
          </button>
        )}
      </div>
    </div>
  )
}
