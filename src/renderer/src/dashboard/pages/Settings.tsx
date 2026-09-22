import type { JSX } from 'react'
import type { AppSettings } from '@shared/types'
import { Icon } from '../Icon'

function Toggle({
  checked,
  onChange
}: {
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track">
        <span className="thumb" />
      </span>
    </label>
  )
}

export function SettingsPage({
  settings,
  patch,
  onNavigate
}: {
  settings: AppSettings
  patch: (p: Partial<AppSettings>) => void
  onNavigate: (page: string) => void
}): JSX.Element {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="sub">How she talks to you, and how she behaves on your desktop.</p>
        </div>
      </div>

      <div className="card">
        <h2>
          <Icon name="heart" size={16} />
          You
        </h2>
        <label className="field">
          <span>Your name — how BEARi calls you</span>
          <input
            className="input"
            value={settings.userName}
            placeholder="e.g. Anoj"
            onChange={(e) => patch({ userName: e.target.value })}
          />
        </label>
      </div>

      <div className="card">
        <h2>
          <Icon name="spark" size={16} />
          Personality tweaks
        </h2>
        <label className="field">
          <span>Extra personality instructions (optional)</span>
          <textarea
            className="input"
            rows={3}
            value={settings.personaExtra}
            placeholder="e.g. Sometimes reply in Telugu. Tease me when I procrastinate."
            onChange={(e) => patch({ personaExtra: e.target.value })}
          />
        </label>
      </div>

      <div className="card">
        <h2>
          <Icon name="brain" size={16} />
          Her mind
        </h2>
        <div className="switch-row">
          <div>
            <div className="lab">Learn from our chats</div>
            <div className="desc">
              After each conversation she quietly notes what matters - people, projects, plans - and reflects on her day
              while she sleeps. Uses your AI provider in the background.
            </div>
          </div>
          <Toggle checked={settings.learnFromChat} onChange={(v) => patch({ learnFromChat: v })} />
        </div>
        <div className="switch-row">
          <div>
            <div className="lab">See my screen</div>
            <div className="desc">
              {settings.awareness.enabled ? 'On - she takes a small look now and then to follow what you are working on.' : 'Off. Set up what she may and may not see on the Awareness page.'}
            </div>
          </div>
          <button className="btn ghost" onClick={() => onNavigate('awareness')}>
            <Icon name="eye" size={15} />
            Awareness
          </button>
        </div>
      </div>

      <div className="card">
        <h2>
          <Icon name="sliders" size={16} />
          Behaviour
        </h2>
        <label className="field" style={{ marginBottom: 6 }}>
          <span>
            Fall asleep after {settings.sleepAfterMinutes === 0 ? '— never' : `${settings.sleepAfterMinutes} minute${settings.sleepAfterMinutes === 1 ? '' : 's'}`}{' '}
            of you being away
          </span>
          <input
            type="range"
            min="0"
            max="30"
            step="1"
            value={settings.sleepAfterMinutes}
            onChange={(e) => patch({ sleepAfterMinutes: Number(e.target.value) })}
          />
        </label>

        <div className="switch-row">
          <div>
            <div className="lab">Always on top</div>
            <div className="desc">Keep her above every window so she's always visible.</div>
          </div>
          <Toggle checked={settings.alwaysOnTop} onChange={(v) => patch({ alwaysOnTop: v })} />
        </div>
        <div className="switch-row">
          <div>
            <div className="lab">Start with Windows</div>
            <div className="desc">She appears when you log in (takes effect in the installed app).</div>
          </div>
          <Toggle checked={settings.launchAtStartup} onChange={(v) => patch({ launchAtStartup: v })} />
        </div>
        <div className="switch-row">
          <div>
            <div className="lab">Check for updates automatically</div>
            <div className="desc">Looks for a newer BEARi when she starts and every few hours; you decide when to install.</div>
          </div>
          <Toggle checked={settings.autoCheckUpdates} onChange={(v) => patch({ autoCheckUpdates: v })} />
        </div>
      </div>

      <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div className="notice-icon" style={{ background: 'var(--good-soft)', color: 'var(--good)' }}>
          <Icon name="shield" size={19} />
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Everything BEARi knows lives on this PC — settings, memory, what she notices and chat history never leave your
          machine except the messages (and, if you allow it, the small screen looks) sent to your chosen AI provider.
        </p>
      </div>
    </div>
  )
}
