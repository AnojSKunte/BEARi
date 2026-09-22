import type {
  AppSettings,
  BrainSnapshot,
  CoreBlock,
  CoreBlockId,
  Episode,
  Fact,
  MemoryEntry,
  MemoryKind,
  Observation,
  RecallHit
} from '@shared/types'
import { app } from 'electron'
import { copyFileSync, existsSync, readdirSync, rmSync, statSync } from 'fs'
import { dirname, join } from 'path'
import { brainDbPath, checkpoint, openBrainDb } from './db'
import type { DatabaseSync } from 'node:sqlite'
import { BrainStore, USER_ID } from './store'
import { BrainLlm } from './llm'
import { extractFromExchange, reflect } from './learn'

/**
 * Her brain: episodic log, knowledge graph, core blocks and reflections, plus
 * the background thinking that keeps them honest. Everything is local.
 *
 * The old flat notebook API (list/add/update/remove) is still served - each
 * entry is simply a fact about the user - so nothing that used it breaks.
 */
/** How many pre-upgrade copies of her memory to keep. */
const BACKUPS_KEPT = 3

export class Brain {
  readonly store: BrainStore
  readonly llm: BrainLlm
  onChange: (() => void) | null = null
  private db: DatabaseSync
  private queue: Promise<unknown> = Promise.resolve()
  private lastObservations: Observation[] = []

  constructor(
    private getSettings: () => AppSettings,
    file?: string
  ) {
    this.db = openBrainDb(file)
    this.store = new BrainStore(this.db)
    this.llm = new BrainLlm(getSettings)
    this.guardUpgrade(file)
    this.store.ensureUser(getSettings().userName || 'User')
    this.lastObservations = this.recentObservations(30)
  }

  /**
   * Her memory outlives the app: it sits in userData, which an installer never
   * touches. The one real risk is a future version changing the schema badly,
   * so the first time a new version opens an existing brain we put a dated copy
   * beside it. Nothing is ever migrated destructively.
   */
  private guardUpgrade(file?: string): void {
    let version = '0.0.0'
    try {
      version = app.getVersion()
    } catch {
      /* running outside Electron (tests) */
    }
    const seen = this.store.getMeta('appVersion')
    this.store.setMeta('schemaVersion', this.store.getMeta('schemaVersion') ?? '1')
    if (seen === version) return
    if (seen) {
      try {
        const path = file ?? brainDbPath()
        if (existsSync(path)) {
          checkpoint(this.db)
          const stamp = new Date().toISOString().slice(0, 10)
          copyFileSync(path, join(dirname(path), `brain-backup-${seen}-${stamp}.sqlite`))
          this.pruneBackups(dirname(path))
          console.log(`[brain] kept a copy of her memory from v${seen} before running v${version}`)
        }
      } catch (err) {
        console.log('[brain] could not back up before upgrade:', err instanceof Error ? err.message : err)
      }
    }
    this.store.setMeta('appVersion', version)
  }

  private pruneBackups(dir: string): void {
    const backups = readdirSync(dir)
      .filter((f) => f.startsWith('brain-backup-') && f.endsWith('.sqlite'))
      .map((f) => ({ f, at: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.at - a.at)
    for (const old of backups.slice(BACKUPS_KEPT)) rmSync(join(dir, old.f), { force: true })
  }

  /** Keep the user entity's name in step with settings. */
  syncUserName(): void {
    this.store.ensureUser(this.getSettings().userName || 'User')
  }

  /** One-time import of the pre-brain notebook. */
  migrateLegacy(entries: MemoryEntry[]): number {
    if (this.store.getMeta('migratedLegacy')) return 0
    let n = 0
    this.store.transaction(() => {
      for (const e of entries) {
        this.store.addFact({
          subjectId: USER_ID,
          predicate: 'notebook',
          text: e.text,
          kind: LEGACY_TO_FACT[e.kind] ?? 'fact',
          importance: 0.6,
          confidence: 0.9
        })
        n++
      }
      this.store.setMeta('migratedLegacy', new Date().toISOString())
    })
    if (n) this.changed()
    return n
  }

  private changed(): void {
    this.onChange?.()
  }

  // ------------------------------------------------------------ legacy notebook API

  list(): MemoryEntry[] {
    return this.store.facts({ activeOnly: true, limit: 2000 }).map(factToEntry)
  }

  add(kind: MemoryKind, text: string): MemoryEntry {
    const fact = this.store.addFact({
      subjectId: USER_ID,
      predicate: 'notebook',
      text,
      kind: LEGACY_TO_FACT[kind] ?? 'fact',
      importance: 0.7,
      confidence: 0.95
    })
    this.store.addEpisode('note', `The user taught BEARi: ${text}`, { factId: fact.id }, 0.5)
    this.changed()
    return factToEntry(fact)
  }

  update(id: string, patch: { kind?: MemoryKind; text?: string }): MemoryEntry | null {
    const fact = this.store.updateFact(id, { text: patch.text, kind: patch.kind ? LEGACY_TO_FACT[patch.kind] : undefined })
    this.changed()
    return fact ? factToEntry(fact) : null
  }

  remove(id: string): void {
    this.store.deleteFact(id)
    this.changed()
  }

  // ------------------------------------------------------------ what goes into her prompt

  /** Compact memory context for one message: core blocks + recalled memories + recent looks. */
  contextFor(userText: string): string {
    const blocks = this.store.blocks().filter((b) => b.text)
    const hits = this.store.recall(userText, { facts: 10, insights: 3, episodes: 4 })
    const seen = this.lastObservations.slice(0, 5)
    const lines: string[] = []

    if (blocks.length) {
      lines.push('## Core memory')
      for (const b of blocks) lines.push(`${b.label}: ${b.text}`)
    }
    const facts = hits.filter((h) => h.kind === 'fact')
    const insights = hits.filter((h) => h.kind === 'insight')
    const episodes = hits.filter((h) => h.kind === 'episode')
    if (facts.length || insights.length) {
      lines.push('', '## Things you remember that may matter here')
      for (const h of facts) lines.push(`- ${h.text} (learned ${ago(h.at)})`)
      for (const h of insights) lines.push(`- (your own reflection) ${h.text}`)
    }
    if (episodes.length) {
      lines.push('', '## Moments that may be related')
      for (const h of episodes) lines.push(`- ${ago(h.at)}: ${h.text.slice(0, 220)}`)
    }
    if (seen.length) {
      lines.push('', '## What you have noticed on their screen lately (mention only when helpful)')
      for (const o of seen) lines.push(`- ${ago(o.at)} in ${o.app}: ${o.activity}`)
    }
    return lines.join('\n')
  }

  // ------------------------------------------------------------ learning

  /** Record an exchange and learn from it in the background. */
  afterExchange(userText: string, assistantText: string, remember?: string): void {
    const ep = this.store.addEpisode('chat_user', userText, {}, 0.4)
    this.store.addEpisode('chat_assistant', assistantText, { replyTo: ep.id }, 0.3)
    if (remember) {
      this.store.addFact({ subjectId: USER_ID, predicate: 'remember', text: remember, kind: 'fact', importance: 0.75, confidence: 0.95, sourceEpisodeId: ep.id })
      this.changed()
    }
    const settings = this.getSettings()
    if (!settings.learnFromChat || !this.llm.ready()) return
    this.enqueue(async () => {
      const summary = await extractFromExchange(this.store, this.llm, {
        userName: settings.userName,
        userText,
        assistantText,
        sourceEpisodeId: ep.id,
        recentObservations: this.lastObservations.slice(0, 6)
      })
      this.store.setMeta('lastExtractionAt', new Date().toISOString())
      if (summary && summary.added + summary.updated + summary.invalidated + summary.blocksChanged > 0) this.changed()
      await this.maybeReflect(false)
    })
  }

  /** What she saw on screen - stored as text only, never the picture. */
  observe(obs: Observation): void {
    this.store.addEpisode('observation', `${obs.app ? obs.app + ': ' : ''}${obs.activity}`, {
      app: obs.app,
      title: obs.title,
      topic: obs.topic,
      observationId: obs.id
    }, 0.25)
    this.lastObservations = [obs, ...this.lastObservations].slice(0, 50)
    this.changed()
    this.enqueue(() => this.maybeReflect(false))
  }

  recentObservations(n = 20): Observation[] {
    return this.store.episodes({ kinds: ['observation'], limit: n }).map(episodeToObservation)
  }

  async reflectNow(): Promise<{ insights: number; blocksChanged: number } | null> {
    return this.enqueue(() => this.maybeReflect(true))
  }

  private async maybeReflect(force: boolean): Promise<{ insights: number; blocksChanged: number } | null> {
    if (!this.getSettings().learnFromChat && !force) return null
    if (!this.llm.ready()) return null
    const out = await reflect(this.store, this.llm, { userName: this.getSettings().userName, force })
    if (out) this.changed()
    return out
  }

  /** Serialise background thinking so passes never race each other. */
  private enqueue<T>(job: () => Promise<T>): Promise<T | null> {
    const run = this.queue.then(job).then(
      (v) => {
        this.store.setMeta('lastError', '')
        return v
      },
      (err) => {
        this.store.setMeta('lastError', err instanceof Error ? err.message : String(err))
        this.changed()
        return null
      }
    )
    this.queue = run
    return run
  }

  // ------------------------------------------------------------ dashboard

  snapshot(): BrainSnapshot {
    return {
      blocks: this.store.blocks(),
      entities: this.store.entities({ limit: 400 }).filter((e) => e.id !== USER_ID),
      facts: this.store.facts({ activeOnly: false, limit: 2000 }),
      insights: this.store.insights(100),
      stats: this.store.stats()
    }
  }

  /** Everything that happened on one day (local time). */
  timeline(dayIso: string): Episode[] {
    const start = new Date(`${dayIso}T00:00:00`)
    const end = new Date(start.getTime() + 86_400_000)
    return this.store.episodes({ since: start.toISOString(), until: end.toISOString(), limit: 1000 })
  }

  recall(query: string): RecallHit[] {
    return this.store.recall(query, { facts: 15, insights: 5, episodes: 10 })
  }

  setBlock(id: CoreBlockId, text: string): CoreBlock {
    const b = this.store.setBlock(id, text)
    this.changed()
    return b
  }

  forgetFact(id: string): void {
    this.store.deleteFact(id)
    this.changed()
  }

  forgetEntity(id: string): void {
    this.store.deleteEntity(id)
    this.changed()
  }

  export(): Record<string, unknown> {
    return this.store.exportAll()
  }
}

// ---------------------------------------------------------------- mapping

const LEGACY_TO_FACT: Record<MemoryKind, Fact['kind']> = {
  fact: 'fact',
  preference: 'preference',
  event: 'event',
  person: 'relationship',
  project: 'goal'
}

function factToEntry(f: Fact): MemoryEntry {
  let kind: MemoryKind = 'fact'
  if (f.kind === 'preference') kind = 'preference'
  else if (f.kind === 'event') kind = 'event'
  else if (f.kind === 'relationship') kind = 'person'
  else if (f.kind === 'goal') kind = 'project'
  return { id: f.id, kind, text: f.text, createdAt: f.createdAt, updatedAt: f.createdAt }
}

function episodeToObservation(e: Episode): Observation {
  return {
    id: String(e.meta.observationId ?? e.id),
    at: e.at,
    app: String(e.meta.app ?? ''),
    title: String(e.meta.title ?? ''),
    activity: e.text.replace(/^[^:]{1,40}: /, ''),
    topic: String(e.meta.topic ?? '')
  }
}

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.round(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} d ago`
  return new Date(iso).toLocaleDateString()
}
