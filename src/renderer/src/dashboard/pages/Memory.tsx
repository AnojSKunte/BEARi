import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import type {
  BrainSnapshot,
  CoreBlock,
  CoreBlockId,
  EntityType,
  Episode,
  Fact,
  MemoryKind
} from '@shared/types'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'

type Tab = 'profile' | 'knowledge' | 'timeline' | 'insights'

const KINDS: { id: MemoryKind; label: string; icon: IconName }[] = [
  { id: 'fact', label: 'Fact', icon: 'spark' },
  { id: 'person', label: 'Person', icon: 'heart' },
  { id: 'project', label: 'Project', icon: 'monitor' },
  { id: 'preference', label: 'Preference', icon: 'check' },
  { id: 'event', label: 'Event', icon: 'clock' }
]

const ENTITY_ICON: Record<EntityType, IconName> = {
  person: 'user',
  project: 'monitor',
  organization: 'shield',
  place: 'home',
  tool: 'wand',
  topic: 'tag',
  event: 'calendar',
  other: 'tag'
}

const BLOCK_HELP: Record<CoreBlockId, string> = {
  profile: 'Name, role, the shape of their life. Read before every reply.',
  focus: 'Current projects, deadlines, worries. She refreshes this herself while she sleeps.',
  style: 'How they like to be spoken to and helped.'
}

const EMPTY: BrainSnapshot = {
  blocks: [],
  entities: [],
  facts: [],
  insights: [],
  stats: {
    episodes: 0,
    observations: 0,
    entities: 0,
    facts: 0,
    invalidated: 0,
    insights: 0,
    lastReflectionAt: null,
    lastExtractionAt: null,
    lastError: null
  }
}

function relative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d} d ago`
  return new Date(iso).toLocaleDateString()
}

const dayIso = (d: Date): string => {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function MemoryPage(): JSX.Element {
  const [snap, setSnap] = useState<BrainSnapshot>(EMPTY)
  const [tab, setTab] = useState<Tab>('knowledge')
  const [reflecting, setReflecting] = useState(false)

  const refresh = (): void => {
    window.beari.brain.snapshot().then(setSnap)
  }
  useEffect(() => {
    refresh()
    return window.beari.brain.onChanged(refresh)
  }, [])

  const exportJson = async (): Promise<void> => {
    const data = await window.beari.brain.export()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `beari-brain-${dayIso(new Date())}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const reflect = async (): Promise<void> => {
    setReflecting(true)
    try {
      await window.beari.brain.reflect()
    } finally {
      setReflecting(false)
      refresh()
    }
  }

  const { stats } = snap
  const TABS: { id: Tab; label: string; icon: IconName; count?: number }[] = [
    { id: 'profile', label: 'Who you are', icon: 'user' },
    { id: 'knowledge', label: 'What she knows', icon: 'graph', count: stats.facts },
    { id: 'timeline', label: 'Timeline', icon: 'calendar' },
    { id: 'insights', label: 'Her reflections', icon: 'lightbulb', count: stats.insights }
  ]

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Memory</h1>
          <p className="sub">
            Her brain grows from every conversation and, if you let her, from what she sees you doing. Everything here is
            yours to read, correct and delete.
          </p>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={reflect} disabled={reflecting} title="Ask her to think over recent days now">
            <Icon name="moon" size={15} />
            {reflecting ? 'Reflecting…' : 'Reflect now'}
          </button>
          <button className="btn ghost" onClick={exportJson}>
            <Icon name="download" size={15} />
            Export
          </button>
        </div>
      </div>

      <div className="stat-row">
        <Stat icon="graph" label="Facts she holds" value={stats.facts} sub={stats.invalidated ? `${stats.invalidated} retired` : 'nothing retired yet'} />
        <Stat icon="user" label="People & things" value={stats.entities} sub="in her knowledge graph" />
        <Stat icon="calendar" label="Moments" value={stats.episodes} sub={`${stats.observations} seen on screen`} tone="pink" />
        <Stat
          icon="lightbulb"
          label="Reflections"
          value={stats.insights}
          sub={stats.lastReflectionAt ? `last ${relative(stats.lastReflectionAt)}` : 'not yet'}
          tone="peach"
        />
      </div>

      {stats.lastError && (
        <div className="card notice warn">
          <div className="notice-icon warn">
            <Icon name="shield" size={19} />
          </div>
          <div className="grow">
            <strong>She hit a snag while thinking in the background</strong>
            <p className="muted">{stats.lastError}</p>
          </div>
        </div>
      )}

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={15} />
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className="pill">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'profile' && <ProfileTab blocks={snap.blocks} onSaved={refresh} />}
      {tab === 'knowledge' && <KnowledgeTab snap={snap} onChanged={refresh} />}
      {tab === 'timeline' && <TimelineTab />}
      {tab === 'insights' && <InsightsTab snap={snap} />}
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  sub,
  tone = ''
}: {
  icon: IconName
  label: string
  value: number
  sub: string
  tone?: string
}): JSX.Element {
  return (
    <div className="stat">
      <div className={`stat-icon ${tone}`}>
        <Icon name={icon} size={18} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        <div className="tiny">{sub}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- profile

function ProfileTab({ blocks, onSaved }: { blocks: CoreBlock[]; onSaved: () => void }): JSX.Element {
  return (
    <div className="stack">
      <p className="muted" style={{ fontSize: 13 }}>
        These three notes are always in her head when she talks to you. She rewrites them as she learns; you can put
        them straight.
      </p>
      {blocks.map((b) => (
        <BlockEditor key={b.id} block={b} onSaved={onSaved} />
      ))}
    </div>
  )
}

function BlockEditor({ block, onSaved }: { block: CoreBlock; onSaved: () => void }): JSX.Element {
  const [text, setText] = useState(block.text)
  const [saving, setSaving] = useState(false)
  useEffect(() => setText(block.text), [block.text])
  const dirty = text !== block.text
  const save = async (): Promise<void> => {
    setSaving(true)
    await window.beari.brain.setBlock(block.id, text)
    setSaving(false)
    onSaved()
  }
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>{block.label}</h2>
          <p className="tiny">{BLOCK_HELP[block.id]}</p>
        </div>
        <span className="tiny">{block.text ? `updated ${relative(block.updatedAt)}` : 'empty'}</span>
      </div>
      <textarea
        className="input"
        rows={4}
        value={text}
        placeholder={block.id === 'profile' ? 'e.g. Anoj, a software engineer in Bengaluru building a desktop companion…' : 'She will fill this in as she learns - or write it yourself.'}
        onChange={(e) => setText(e.target.value)}
        style={{ marginTop: 10 }}
      />
      {dirty && (
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <button className="btn ghost" onClick={() => setText(block.text)}>
            Discard
          </button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- knowledge

function KnowledgeTab({ snap, onChanged }: { snap: BrainSnapshot; onChanged: () => void }): JSX.Element {
  const [query, setQuery] = useState('')
  const [entityId, setEntityId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [newText, setNewText] = useState('')
  const [newKind, setNewKind] = useState<MemoryKind>('fact')

  const entities = useMemo(() => {
    const q = query.trim().toLowerCase()
    return snap.entities.filter((e) => !q || e.name.toLowerCase().includes(q))
  }, [snap.entities, query])

  const facts = useMemo(() => {
    const q = query.trim().toLowerCase()
    return snap.facts
      .filter((f) => showHistory || !f.invalidatedAt)
      .filter((f) => !entityId || f.subjectId === entityId || f.objectId === entityId)
      .filter((f) => !q || f.text.toLowerCase().includes(q))
      .sort((a, b) => (a.invalidatedAt ? 1 : 0) - (b.invalidatedAt ? 1 : 0) || b.importance - a.importance)
  }, [snap.facts, query, entityId, showHistory])

  const selected = entityId ? snap.entities.find((e) => e.id === entityId) ?? null : null

  const teach = async (): Promise<void> => {
    const text = newText.trim()
    if (!text) return
    setNewText('')
    await window.beari.memory.add(newKind, text)
    onChanged()
  }

  return (
    <div className="stack">
      <div className="card">
        <h2>
          <Icon name="plus" size={16} />
          Teach her something
        </h2>
        <div className="stack" style={{ gap: 12 }}>
          <div className="chip-row">
            {KINDS.map((k) => (
              <button key={k.id} className={`chip ${newKind === k.id ? 'on' : ''}`} onClick={() => setNewKind(k.id)}>
                <Icon name={k.icon} size={13} />
                {k.label}
              </button>
            ))}
          </div>
          <div className="row">
            <input
              className="input grow"
              value={newText}
              placeholder="e.g. My teammate Priya owns the billing service"
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && teach()}
            />
            <button className="btn primary" onClick={teach}>
              Remember
            </button>
          </div>
        </div>
      </div>

      <div className="memory-toolbar">
        <div className="search-wrap">
          <Icon name="search" size={15} />
          <input className="input" value={query} placeholder="Search what she knows…" onChange={(e) => setQuery(e.target.value)} />
        </div>
        <label className="chip" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={showHistory} onChange={(e) => setShowHistory(e.target.checked)} style={{ marginRight: 6 }} />
          Show what stopped being true
        </label>
      </div>

      <div className="knowledge">
        <div className="card entity-list">
          <h2>
            <Icon name="graph" size={16} />
            People &amp; things
          </h2>
          <button className={`entity ${entityId === null ? 'on' : ''}`} onClick={() => setEntityId(null)}>
            <span className="entity-icon">
              <Icon name="spark" size={14} />
            </span>
            <span className="grow">Everything</span>
            <span className="tiny">{snap.facts.filter((f) => !f.invalidatedAt).length}</span>
          </button>
          {entities.length === 0 && <p className="tiny" style={{ padding: '8px 4px' }}>Nobody yet - they appear as you talk.</p>}
          {entities.map((e) => (
            <button key={e.id} className={`entity ${entityId === e.id ? 'on' : ''}`} onClick={() => setEntityId(e.id)}>
              <span className="entity-icon">
                <Icon name={ENTITY_ICON[e.type] ?? 'tag'} size={14} />
              </span>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="entity-name">{e.name}</span>
                <span className="tiny">{e.type}</span>
              </span>
              <span className="tiny">{snap.facts.filter((f) => !f.invalidatedAt && (f.subjectId === e.id || f.objectId === e.id)).length}</span>
            </button>
          ))}
        </div>

        <div className="card grow" style={{ minWidth: 0 }}>
          {selected ? (
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <h2 style={{ marginBottom: 2 }}>{selected.name}</h2>
                <p className="tiny">
                  {selected.type} · mentioned {selected.mentions}× · first noted {relative(selected.createdAt)}
                  {selected.summary ? ` · ${selected.summary}` : ''}
                </p>
              </div>
              <button
                className="btn ghost danger"
                onClick={async () => {
                  await window.beari.brain.forgetEntity(selected.id)
                  setEntityId(null)
                  onChanged()
                }}
              >
                <Icon name="trash" size={14} />
                Forget entirely
              </button>
            </div>
          ) : (
            <h2>
              <Icon name="notebook" size={16} />
              Facts
            </h2>
          )}

          {facts.length === 0 && (
            <div className="empty-state">
              <img src="./sprites/pose-reading.png" alt="" />
              <p className="muted">
                {snap.facts.length === 0 ? 'Nothing yet - chat with her, or teach her something above. 💜' : 'Nothing matches.'}
              </p>
            </div>
          )}
          <ul className="memory-list">
            {facts.map((f) => (
              <FactRow key={f.id} fact={f} onChanged={onChanged} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function FactRow({ fact, onChanged }: { fact: Fact; onChanged: () => void }): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(fact.text)
  const retired = !!fact.invalidatedAt
  const save = async (): Promise<void> => {
    setEditing(false)
    if (text.trim() && text !== fact.text) {
      await window.beari.memory.update(fact.id, { text: text.trim() })
      onChanged()
    }
  }
  const when =
    fact.validFrom || fact.validUntil
      ? ` · true ${fact.validFrom ? `from ${fact.validFrom}` : ''}${fact.validUntil ? ` until ${fact.validUntil}` : ''}`
      : ''
  return (
    <li className={`memory-item fact ${retired ? 'retired' : ''}`}>
      <span className={`memory-kind ${fact.kind}`} title={fact.kind}>
        <Icon name={fact.kind === 'relationship' ? 'heart' : fact.kind === 'goal' ? 'monitor' : fact.kind === 'preference' ? 'check' : fact.kind === 'event' ? 'clock' : fact.kind === 'habit' ? 'refresh' : 'spark'} size={15} />
      </span>
      <span className="grow" style={{ minWidth: 0 }}>
        {editing ? (
          <input
            className="input"
            value={text}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') setEditing(false)
            }}
            onBlur={save}
          />
        ) : (
          <span className="memory-text">{fact.text}</span>
        )}
        <span className="tiny">
          {retired ? `stopped being true ${relative(fact.invalidatedAt!)}` : `learned ${relative(fact.createdAt)}`}
          {when}
          {fact.confidence < 0.6 ? ' · she is not sure' : ''}
        </span>
      </span>
      {!retired && (
        <button
          className="icon-btn"
          title="Correct"
          onClick={() => {
            setText(fact.text)
            setEditing(true)
          }}
        >
          <Icon name="edit" size={14} />
        </button>
      )}
      <button
        className="icon-btn danger"
        title="Forget"
        onClick={async () => {
          await window.beari.brain.forgetFact(fact.id)
          onChanged()
        }}
      >
        <Icon name="trash" size={14} />
      </button>
    </li>
  )
}

// ---------------------------------------------------------------- timeline

const KIND_META: Record<Episode['kind'], { icon: IconName; label: string }> = {
  chat_user: { icon: 'chat', label: 'You said' },
  chat_assistant: { icon: 'heart', label: 'She said' },
  observation: { icon: 'eye', label: 'She noticed' },
  note: { icon: 'notebook', label: 'You taught her' },
  system: { icon: 'spark', label: 'BEARi' }
}

function TimelineTab(): JSX.Element {
  const [day, setDay] = useState(dayIso(new Date()))
  const [episodes, setEpisodes] = useState<Episode[]>([])

  const load = (): void => {
    window.beari.brain.timeline(day).then(setEpisodes)
  }
  useEffect(load, [day])
  useEffect(() => window.beari.brain.onChanged(load), [day])

  const shift = (n: number): void => {
    const d = new Date(`${day}T12:00:00`)
    d.setDate(d.getDate() + n)
    setDay(dayIso(d))
  }
  const isToday = day === dayIso(new Date())
  const label = isToday ? 'Today' : new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>
          <Icon name="calendar" size={16} />
          {label}
        </h2>
        <div className="row">
          <button className="btn ghost" onClick={() => shift(-1)}>
            ‹ Earlier
          </button>
          <button className="btn ghost" onClick={() => shift(1)} disabled={isToday}>
            Later ›
          </button>
        </div>
      </div>
      {episodes.length === 0 && (
        <div className="empty-state">
          <img src="./sprites/pose-reading.png" alt="" />
          <p className="muted">A quiet day - nothing recorded.</p>
        </div>
      )}
      <ul className="timeline">
        {[...episodes].reverse().map((e) => {
          const meta = KIND_META[e.kind] ?? KIND_META.system
          return (
            <li key={e.id} className={`tl-item ${e.kind}`}>
              <span className="tl-time">{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="tl-icon">
                <Icon name={meta.icon} size={13} />
              </span>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="tiny">{meta.label}</span>
                <span className="tl-text">{e.text}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------- insights

function InsightsTab({ snap }: { snap: BrainSnapshot }): JSX.Element {
  return (
    <div className="card">
      <h2>
        <Icon name="lightbulb" size={16} />
        What she has worked out about you
      </h2>
      <p className="tiny" style={{ marginBottom: 12 }}>
        Written while she sleeps, from the conversations and days since her last reflection.
      </p>
      {snap.insights.length === 0 && (
        <div className="empty-state">
          <img src="./sprites/pose-reading.png" alt="" />
          <p className="muted">No reflections yet. After a few conversations she will start writing them - or press “Reflect now”.</p>
        </div>
      )}
      <ul className="memory-list">
        {snap.insights.map((i) => (
          <li key={i.id} className="memory-item">
            <span className="memory-kind insight">
              <Icon name="lightbulb" size={15} />
            </span>
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="memory-text">{i.text}</span>
              <span className="tiny">
                {relative(i.at)}
                {i.evidence.length ? ` · from ${i.evidence.length} moment${i.evidence.length === 1 ? '' : 's'}` : ''}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
