import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { AppSettings, AwarenessState, Observation } from '@shared/types'
import { Icon } from '../Icon'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track">
        <span className="thumb" />
      </span>
    </label>
  )
}

function relative(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ago`
  return new Date(iso).toLocaleDateString()
}

const SKIP_LABEL: Record<string, string> = {
  off: 'Off',
  paused: 'Paused',
  'no AI key': 'Needs an AI key to describe what she sees',
  'user away': 'Waiting - you seem to be away',
  'excluded window': 'Looking away - that window is on your private list',
  'excluded app': 'Looking away - that app is on your private list',
  'screen unchanged': 'Nothing new on screen since her last look',
  'private - not kept': 'Saw something private - kept nothing',
  'nothing to note': 'Nothing worth noting',
  'could not describe': 'Could not make sense of the last look'
}

export function AwarenessPage({
  settings,
  patch
}: {
  settings: AppSettings
  patch: (p: Partial<AppSettings>) => void
}): JSX.Element {
  const [state, setState] = useState<AwarenessState | null>(null)
  const [recent, setRecent] = useState<Observation[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [newApp, setNewApp] = useState('')
  const [looking, setLooking] = useState(false)
  const aw = settings.awareness

  useEffect(() => {
    window.beari.awareness.state().then(setState)
    window.beari.awareness.recent(40).then(setRecent)
    const offState = window.beari.awareness.onChanged(setState)
    const offObs = window.beari.awareness.onObserved((o) => setRecent((r) => [o, ...r].slice(0, 40)))
    return () => {
      offState()
      offObs()
    }
  }, [])

  const setAw = (p: Partial<AppSettings['awareness']>): void => patch({ awareness: { ...aw, ...p } })
  const paused = !!state?.pausedUntil && state.pausedUntil > Date.now()
  const statusLine = !aw.enabled
    ? 'Off - she never looks at your screen.'
    : paused
      ? `Paused until ${new Date(state!.pausedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
      : state?.running
        ? 'Taking a look…'
        : state?.lastSkipReason && SKIP_LABEL[state.lastSkipReason]
          ? SKIP_LABEL[state.lastSkipReason]
          : state?.lastSkipReason?.startsWith('error')
            ? state.lastSkipReason
            : state?.lastLookAt
              ? `Watching quietly - last look ${relative(state.lastLookAt)}.`
              : 'Watching quietly - she has not looked yet.'

  const lookNow = async (): Promise<void> => {
    setLooking(true)
    try {
      setState(await window.beari.awareness.lookNow())
    } finally {
      setLooking(false)
    }
  }

  const addChip = (list: 'excludeTitles' | 'excludeApps', value: string): void => {
    const v = value.trim()
    if (!v || aw[list].some((x) => x.toLowerCase() === v.toLowerCase())) return
    setAw({ [list]: [...aw[list], v] })
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Awareness</h1>
          <p className="sub">Let her see what you are working on, so she can actually help - on your terms.</p>
        </div>
      </div>

      <div className={`card notice ${aw.enabled ? '' : 'quiet'}`}>
        <div className={`notice-icon ${aw.enabled ? 'lav' : ''}`}>
          <Icon name={aw.enabled ? 'eye' : 'eyeOff'} size={20} />
        </div>
        <div className="grow">
          <strong>Let BEARi see your screen</strong>
          <p className="muted">{statusLine}</p>
        </div>
        <Toggle checked={aw.enabled} onChange={(v) => setAw({ enabled: v })} />
      </div>

      <div className="card">
        <h2>
          <Icon name="shield" size={16} />
          Exactly what happens when this is on
        </h2>
        <ul className="tips">
          <li>
            <Icon name="camera" size={15} />
            <span>
              About every {aw.intervalSec} seconds while you are active, she takes <em>one small look</em> at your screen.
            </span>
          </li>
          <li>
            <Icon name="chat" size={15} />
            <span>
              Your AI provider describes it in <em>one line</em> - the app, the task, the subject. Never the words on screen.
            </span>
          </li>
          <li>
            <Icon name="trash" size={15} />
            <span>
              The picture is discarded the moment it has been described. <em>Only the line is kept</em>, on this PC.
            </span>
          </li>
          <li>
            <Icon name="eyeOff" size={15} />
            <span>She looks away from windows on your private list, and drops anything the model flags as private.</span>
          </li>
          <li>
            <Icon name="pause" size={15} />
            <span>Pause her any time from here or from the tray icon.</span>
          </li>
        </ul>
      </div>

      {aw.enabled && (
        <div className="card">
          <h2>
            <Icon name="sliders" size={16} />
            Right now
          </h2>
          <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
            {paused ? (
              <button className="btn primary" onClick={() => window.beari.awareness.pause(0).then(setState)}>
                <Icon name="play" size={15} />
                Resume
              </button>
            ) : (
              <>
                <button className="btn ghost" onClick={() => window.beari.awareness.pause(60 * 60 * 1000).then(setState)}>
                  <Icon name="pause" size={15} />
                  Pause for 1 hour
                </button>
                <button className="btn ghost" onClick={() => window.beari.awareness.pause(8 * 60 * 60 * 1000).then(setState)}>
                  <Icon name="moon" size={15} />
                  Pause for the day
                </button>
              </>
            )}
            <button className="btn ghost" onClick={lookNow} disabled={looking || paused}>
              <Icon name="eye" size={15} />
              {looking ? 'Looking…' : 'Look now'}
            </button>
            <span className="tiny" style={{ marginLeft: 'auto' }}>
              {state?.looksToday ?? 0} look{state?.looksToday === 1 ? '' : 's'} today
            </span>
          </div>
          <label className="field" style={{ marginTop: 16 }}>
            <span>How often she looks - every {aw.intervalSec} seconds while you are active</span>
            <input
              type="range"
              min="30"
              max="600"
              step="15"
              value={aw.intervalSec}
              onChange={(e) => setAw({ intervalSec: Number(e.target.value) })}
            />
            <span className="tiny">More often means she follows your day more closely, and costs more with your provider.</span>
          </label>
        </div>
      )}

      <div className="card">
        <h2>
          <Icon name="eyeOff" size={16} />
          Private list - she never looks here
        </h2>
        <label className="field">
          <span>Window titles containing…</span>
          <div className="chip-row">
            {aw.excludeTitles.map((t) => (
              <button key={t} className="chip on" title="Remove" onClick={() => setAw({ excludeTitles: aw.excludeTitles.filter((x) => x !== t) })}>
                {t} ×
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input
              className="input grow"
              value={newTitle}
              placeholder="e.g. payroll"
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  addChip('excludeTitles', newTitle)
                  setNewTitle('')
                }
              }}
            />
            <button
              className="btn ghost"
              onClick={() => {
                addChip('excludeTitles', newTitle)
                setNewTitle('')
              }}
            >
              Add
            </button>
          </div>
        </label>
        <label className="field" style={{ marginTop: 14 }}>
          <span>Apps (process name)…</span>
          <div className="chip-row">
            {aw.excludeApps.map((t) => (
              <button key={t} className="chip on" title="Remove" onClick={() => setAw({ excludeApps: aw.excludeApps.filter((x) => x !== t) })}>
                {t} ×
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input
              className="input grow"
              value={newApp}
              placeholder="e.g. Outlook"
              onChange={(e) => setNewApp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  addChip('excludeApps', newApp)
                  setNewApp('')
                }
              }}
            />
            <button
              className="btn ghost"
              onClick={() => {
                addChip('excludeApps', newApp)
                setNewApp('')
              }}
            >
              Add
            </button>
          </div>
        </label>
      </div>

      <div className="card">
        <h2>
          <Icon name="eye" size={16} />
          What she has noticed
        </h2>
        {recent.length === 0 && (
          <div className="empty-state">
            <img src="./sprites/pose-reading.png" alt="" />
            <p className="muted">{aw.enabled ? 'Nothing yet - she will note things as you work.' : 'Turn awareness on and this fills with what she notices.'}</p>
          </div>
        )}
        <ul className="timeline">
          {recent.map((o) => (
            <li key={o.id} className="tl-item observation">
              <span className="tl-time">{new Date(o.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="tl-icon">
                <Icon name="eye" size={13} />
              </span>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="tiny">
                  {o.app}
                  {o.topic ? ` · ${o.topic}` : ''}
                </span>
                <span className="tl-text">{o.activity}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
