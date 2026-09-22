import { useState } from 'react'
import type { JSX } from 'react'
import type { AppSettings, ProviderId } from '@shared/types'
import { Icon } from '../Icon'

const PROVIDERS: { id: ProviderId; name: string; mono: string; keyHint: string; models: string[] }[] = [
  {
    id: 'anthropic',
    name: 'Anthropic · Claude',
    mono: 'A',
    keyHint: 'sk-ant-…',
    models: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5']
  },
  {
    id: 'openai',
    name: 'OpenAI',
    mono: 'O',
    keyHint: 'sk-…',
    models: ['gpt-4o-mini', 'gpt-4o']
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    mono: 'G',
    keyHint: 'AIza…',
    models: ['gemini-2.0-flash', 'gemini-2.5-pro']
  }
]

export function ProvidersPage({
  settings,
  patch
}: {
  settings: AppSettings
  patch: (p: Partial<AppSettings>) => void
}): JSX.Element {
  const ai = settings.ai
  const [shown, setShown] = useState<Record<string, boolean>>({})

  const setProviderField = (id: ProviderId, field: 'apiKey' | 'model', value: string): void => {
    patch({
      ai: {
        ...ai,
        providers: { ...ai.providers, [id]: { ...ai.providers[id], [field]: value } }
      }
    })
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>AI Providers</h1>
          <p className="sub">
            BEARi's brain is provider-agnostic — pick whichever you have a key for. Keys are stored only on this PC and
            sent only to the provider you choose.
          </p>
        </div>
      </div>

      {PROVIDERS.map((p) => {
        const active = ai.activeProvider === p.id
        const config = ai.providers[p.id]
        const hasKey = !!config.apiKey
        return (
          <div key={p.id} className={`card provider ${active ? 'provider-active' : ''}`}>
            <div className="provider-head">
              <div className={`provider-logo ${p.id}`}>{p.mono}</div>
              <div className="grow">
                <div className="provider-name">{p.name}</div>
                <div className="provider-status">
                  <span className={`dot ${hasKey ? 'ok' : 'off'}`} />
                  {hasKey ? 'Key saved' : 'No key yet'}
                </div>
              </div>
              {active ? (
                <span className="pill good">
                  <Icon name="check" size={12} />
                  Active brain
                </span>
              ) : (
                <button className="btn ghost" onClick={() => patch({ ai: { ...ai, activeProvider: p.id } })}>
                  Use this brain
                </button>
              )}
            </div>
            <div className="row">
              <label className="field grow">
                <span>API key</span>
                <div className="key-wrap">
                  <input
                    className="input"
                    type={shown[p.id] ? 'text' : 'password'}
                    placeholder={p.keyHint}
                    value={config.apiKey}
                    onChange={(e) => setProviderField(p.id, 'apiKey', e.target.value)}
                  />
                  <button
                    className="key-eye"
                    title={shown[p.id] ? 'Hide key' : 'Show key'}
                    onClick={() => setShown((s) => ({ ...s, [p.id]: !s[p.id] }))}
                  >
                    <Icon name={shown[p.id] ? 'eyeOff' : 'eye'} size={15} />
                  </button>
                </div>
              </label>
              <label className="field" style={{ width: 220 }}>
                <span>Model</span>
                <input
                  className="input"
                  list={`models-${p.id}`}
                  value={config.model}
                  onChange={(e) => setProviderField(p.id, 'model', e.target.value)}
                />
                <datalist id={`models-${p.id}`}>
                  {p.models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </label>
            </div>
          </div>
        )
      })}

      <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div className="notice-icon" style={{ background: 'var(--good-soft)', color: 'var(--good)' }}>
          <Icon name="shield" size={19} />
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Nothing leaves your machine except the messages you send to your chosen provider. Settings, memory and chat
          history live locally in your Windows user profile.
        </p>
      </div>
    </div>
  )
}
