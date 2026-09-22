import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { AppSettings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { useUpdateState } from './UpdateCard'
import { HomePage } from './pages/Home'
import { CharacterPage } from './pages/Character'
import { MemoryPage } from './pages/Memory'
import { AwarenessPage } from './pages/Awareness'
import { ProvidersPage } from './pages/Providers'
import { SettingsPage } from './pages/Settings'
import { AboutPage } from './pages/About'

const NAV: { id: string; icon: IconName; label: string }[] = [
  { id: 'home', icon: 'home', label: 'Home' },
  { id: 'character', icon: 'wand', label: 'Character' },
  { id: 'memory', icon: 'brain', label: 'Memory' },
  { id: 'awareness', icon: 'eye', label: 'Awareness' },
  { id: 'providers', icon: 'chip', label: 'AI Providers' },
  { id: 'settings', icon: 'sliders', label: 'Settings' },
  { id: 'about', icon: 'heart', label: 'About' }
]

type PageId = 'home' | 'character' | 'memory' | 'awareness' | 'providers' | 'settings' | 'about'

export function App(): JSX.Element {
  const [page, setPage] = useState<PageId>('home')
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [version, setVersion] = useState('')
  const update = useUpdateState()

  useEffect(() => {
    window.beari.settings.get().then(setSettings)
    window.beari.app.info().then((i) => setVersion(i.version))
    return window.beari.settings.onChanged(setSettings)
  }, [])

  const patch = (p: Partial<AppSettings>): void => {
    // Optimistic update; main echoes the merged result back via onChanged.
    setSettings((s) => ({ ...s, ...p }))
    window.beari.settings.set(p)
  }

  const updateReady = update.phase === 'available' || update.phase === 'downloaded'

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-avatar" src="./puppet/beari-front.png" alt="BEARi" />
          <div>
            <div className="brand-name">
              BEAR<i>i</i>
            </div>
            <div className="brand-sub">your desktop companion</div>
          </div>
        </div>
        <nav>
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id as PageId)}
            >
              <Icon name={item.icon} />
              {item.label}
              {item.id === 'about' && updateReady && <span className="nav-dot" title="Update available" />}
              {item.id === 'awareness' && settings.awareness.enabled && <span className="nav-dot live" title="Watching" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          v{version || '…'}
          <br />
          made with 💜
        </div>
      </aside>

      <main className="content">
        {page === 'home' && <HomePage settings={settings} onNavigate={(id) => setPage(id as PageId)} />}
        {page === 'character' && <CharacterPage settings={settings} patch={patch} />}
        {page === 'memory' && <MemoryPage />}
        {page === 'awareness' && <AwarenessPage settings={settings} patch={patch} />}
        {page === 'providers' && <ProvidersPage settings={settings} patch={patch} />}
        {page === 'settings' && <SettingsPage settings={settings} patch={patch} onNavigate={(id) => setPage(id as PageId)} />}
        {page === 'about' && <AboutPage />}
      </main>
    </div>
  )
}
