import type { BeariApi } from '../../../preload/index'
import { DEFAULT_SETTINGS } from '@shared/types'
import type {
  AppSettings,
  AwarenessState,
  BrainSnapshot,
  Entity,
  Episode,
  Fact,
  MemoryEntry,
  Observation,
  UpdateState
} from '@shared/types'

/**
 * Browser-mode shim: lets the renderer run in a plain browser tab (no
 * Electron preload) for visual development. Settings live in localStorage,
 * chat replies are canned, the brain holds a small sample, cursor tracking
 * uses in-page mousemove.
 */
export function installMockApi(): void {
  if (window.beari) return

  // Visual checks run in a background tab, where Chrome parks
  // requestAnimationFrame entirely and nothing animates. `?raf=timer` swaps in
  // a timer-driven clock so the animation can be inspected off-screen. This sits
  // below the `window.beari` guard, so the packaged app can never reach it.
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('raf') === 'timer') {
    let id = 1
    const pending = new Map<number, FrameRequestCallback>()
    window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      const handle = id++
      pending.set(handle, cb)
      setTimeout(() => {
        const fn = pending.get(handle)
        pending.delete(handle)
        fn?.(performance.now())
      }, 16)
      return handle
    }
    window.cancelAnimationFrame = (handle: number): void => {
      pending.delete(handle)
    }
  }

  const KEY = 'beari-mock-settings'
  let settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...(JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? {})
  }
  const settingsListeners = new Set<(s: AppSettings) => void>()
  const chunkListeners = new Set<(raw: string) => void>()
  const doneListeners = new Set<(r: { text: string; directives: object }) => void>()
  const brainListeners = new Set<() => void>()
  const awarenessListeners = new Set<(s: AwarenessState) => void>()

  // ---- a little sample brain so the dashboard has something to show
  const ago = (min: number): string => new Date(Date.now() - min * 60_000).toISOString()
  const entities: Entity[] = [
    { id: 'e1', name: 'Priya', type: 'person', aliases: [], summary: 'Teammate who owns the billing service', mentions: 3, createdAt: ago(3000), updatedAt: ago(60) },
    { id: 'e2', name: 'BEARi', type: 'project', aliases: ['the companion app'], summary: 'Desktop companion being built in Electron', mentions: 9, createdAt: ago(9000), updatedAt: ago(10) },
    { id: 'e3', name: 'Electron', type: 'tool', aliases: [], summary: '', mentions: 4, createdAt: ago(9000), updatedAt: ago(700) }
  ]
  let facts: Fact[] = [
    mk('f1', 'user', 'User', 'is building', 'e2', 'BEARi', 'User is building BEARi, a desktop companion, in Electron and React.', 'goal', 0.9, ago(9000)),
    mk('f2', 'user', 'User', 'works with', 'e1', 'Priya', "User's teammate Priya owns the billing service.", 'relationship', 0.7, ago(3000)),
    mk('f3', 'user', 'User', 'prefers', null, null, 'User prefers short replies and hates being interrupted while coding.', 'preference', 0.8, ago(2000)),
    { ...mk('f4', 'user', 'User', 'demo', null, null, "User's demo to the CEO is on Friday.", 'event', 0.85, ago(5000)), validFrom: '2026-09-18', validUntil: '2026-09-18', invalidatedAt: ago(1000) }
  ]
  const insights = [
    { id: 'i1', at: ago(400), text: 'They do their deepest work late in the evening and get frustrated when tooling breaks the flow - short, practical help lands best then.', importance: 0.7, evidence: ['ep1', 'ep2'] }
  ]
  const blocks = [
    { id: 'profile' as const, label: 'Who they are', text: 'Anoj - a software engineer building BEARi, his own desktop companion.', updatedAt: ago(60) },
    { id: 'focus' as const, label: 'What matters to them right now', text: 'Getting BEARi ready to share: releases, a real memory, screen awareness.', updatedAt: ago(30) },
    { id: 'style' as const, label: 'How they like to be helped', text: 'Direct, no hedging, show the result.', updatedAt: ago(600) }
  ]
  const episodes: Episode[] = [
    { id: 'ep1', at: ago(90), kind: 'chat_user', text: 'Can you make her actually remember things?', meta: {}, importance: 0.4 },
    { id: 'ep2', at: ago(89), kind: 'chat_assistant', text: 'On it - I will keep what matters and forget the rest.', meta: {}, importance: 0.3 },
    { id: 'ep3', at: ago(40), kind: 'observation', text: 'VS Code: editing the memory store for BEARi', meta: { app: 'VS Code', topic: 'BEARi memory' }, importance: 0.25 }
  ]
  const observations: Observation[] = [
    { id: 'o1', at: ago(40), app: 'VS Code', title: 'store.ts - Beari', activity: 'Editing the memory store for BEARi', topic: 'BEARi memory' },
    { id: 'o2', at: ago(120), app: 'Chrome', title: 'Zep docs', activity: 'Reading about temporal knowledge graphs', topic: 'agent memory' }
  ]
  const snapshot = (): BrainSnapshot => ({
    blocks,
    entities,
    facts,
    insights,
    stats: {
      episodes: episodes.length,
      observations: observations.length,
      entities: entities.length,
      facts: facts.filter((f) => !f.invalidatedAt).length,
      invalidated: facts.filter((f) => f.invalidatedAt).length,
      insights: insights.length,
      lastReflectionAt: ago(400),
      lastExtractionAt: ago(89),
      lastError: null
    }
  })
  const toEntry = (f: Fact): MemoryEntry => ({ id: f.id, kind: 'fact', text: f.text, createdAt: f.createdAt, updatedAt: f.createdAt })
  const emitBrain = (): void => {
    for (const cb of brainListeners) cb()
  }

  let awareness: AwarenessState = { enabled: settings.awareness.enabled, pausedUntil: 0, lastLookAt: ago(40), lastSkipReason: null, looksToday: 7, running: false }
  const emitAwareness = (): void => {
    awareness = { ...awareness, enabled: settings.awareness.enabled }
    for (const cb of awarenessListeners) cb(awareness)
  }
  const update: UpdateState = {
    phase: 'unsupported',
    currentVersion: '1.0.0',
    latestVersion: null,
    releaseNotes: null,
    releaseDate: null,
    percent: 0,
    message: 'Browser preview - updates only work in the installed app.',
    checkedAt: null
  }

  const api: BeariApi = {
    chat: {
      send: async (text: string) => {
        const reply = `You said “${text}” — I'm running in browser preview mode, so no real brain yet! 💜`
        setTimeout(() => {
          for (const cb of chunkListeners) cb(reply)
          setTimeout(() => {
            for (const cb of doneListeners) cb({ text: reply, directives: { emotion: 'happy' } })
          }, 300)
        }, 600)
        return null
      },
      cancel: () => {},
      onChunk: (cb) => {
        chunkListeners.add(cb)
        return () => chunkListeners.delete(cb)
      },
      onDone: (cb) => {
        doneListeners.add(cb as never)
        return () => doneListeners.delete(cb as never)
      },
      onError: () => () => {}
    },
    settings: {
      get: async () => settings,
      set: async (patch) => {
        settings = { ...settings, ...patch }
        localStorage.setItem(KEY, JSON.stringify(settings))
        for (const cb of settingsListeners) cb(settings)
        if (patch.awareness) emitAwareness()
        return settings
      },
      onChanged: (cb) => {
        settingsListeners.add(cb)
        return () => settingsListeners.delete(cb)
      }
    },
    memory: {
      list: async () => facts.filter((f) => !f.invalidatedAt).map(toEntry),
      add: async (_kind, text) => {
        const f = mk(String(Math.random()), 'user', 'User', 'notebook', null, null, text, 'fact', 0.7, new Date().toISOString())
        facts = [f, ...facts]
        emitBrain()
        return toEntry(f)
      },
      update: async (id, patch) => {
        facts = facts.map((f) => (f.id === id ? { ...f, text: patch.text ?? f.text } : f))
        emitBrain()
        const f = facts.find((x) => x.id === id)
        return f ? toEntry(f) : null
      },
      remove: async (id) => {
        facts = facts.filter((f) => f.id !== id)
        emitBrain()
      },
      onChanged: (cb) => {
        brainListeners.add(cb)
        return () => brainListeners.delete(cb)
      }
    },
    brain: {
      snapshot: async () => snapshot(),
      timeline: async (day) => episodes.filter((e) => e.at.slice(0, 10) === day),
      recall: async () => [],
      setBlock: async (id, text) => {
        const b = blocks.find((x) => x.id === id)!
        b.text = text
        b.updatedAt = new Date().toISOString()
        emitBrain()
        return b
      },
      forgetFact: async (id) => {
        facts = facts.filter((f) => f.id !== id)
        emitBrain()
      },
      forgetEntity: async (id) => {
        const i = entities.findIndex((e) => e.id === id)
        if (i >= 0) entities.splice(i, 1)
        facts = facts.filter((f) => f.subjectId !== id && f.objectId !== id)
        emitBrain()
      },
      reflect: async () => ({ insights: 0, blocksChanged: 0 }),
      export: async () => ({ ...snapshot(), episodes }),
      onChanged: (cb) => {
        brainListeners.add(cb)
        return () => brainListeners.delete(cb)
      }
    },
    awareness: {
      state: async () => awareness,
      pause: async (ms) => {
        awareness = { ...awareness, pausedUntil: ms > 0 ? Date.now() + ms : 0 }
        emitAwareness()
        return awareness
      },
      lookNow: async () => awareness,
      recent: async (n) => observations.slice(0, n),
      onChanged: (cb) => {
        awarenessListeners.add(cb)
        return () => awarenessListeners.delete(cb)
      },
      onObserved: () => () => {}
    },
    update: {
      state: async () => update,
      check: async () => update,
      download: async () => update,
      install: () => {},
      onChanged: () => () => {}
    },
    window: {
      setInteractive: () => {}
    },
    cursor: {
      onMove: (cb) => {
        const onMove = (e: MouseEvent): void =>
          cb({ x: e.clientX, y: e.clientY, winX: 0, winY: 0, winW: innerWidth, winH: innerHeight, idleMs: 0 })
        window.addEventListener('mousemove', onMove)
        return () => window.removeEventListener('mousemove', onMove)
      }
    },
    app: {
      info: async () => ({ version: '1.0.0', isPackaged: false, platform: 'browser' }),
      openDashboard: () => window.open('/dashboard.html', '_blank'),
      quit: () => {}
    }
  }

  window.beari = api

  function mk(
    id: string,
    subjectId: string,
    subject: string,
    predicate: string,
    objectId: string | null,
    object: string | null,
    text: string,
    kind: Fact['kind'],
    importance: number,
    createdAt: string
  ): Fact {
    return {
      id,
      subjectId,
      subject,
      predicate,
      objectId,
      object,
      text,
      kind,
      confidence: 0.85,
      importance,
      validFrom: null,
      validUntil: null,
      createdAt,
      invalidatedAt: null,
      sourceEpisodeId: null,
      supersededBy: null,
      recallCount: 0
    }
  }
}
