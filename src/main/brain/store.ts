import { randomUUID } from 'crypto'
import type { DatabaseSync } from 'node:sqlite'
import type {
  BrainStats,
  CoreBlock,
  CoreBlockId,
  Entity,
  EntityType,
  Episode,
  EpisodeKind,
  Fact,
  FactKind,
  Insight,
  RecallHit
} from '@shared/types'
import { ENTITY_TYPES } from '@shared/types'
import { ftsQuery, nowIso } from './db'
import type { Row } from './db'

/** The user is always entity `user`; every "you"/"me" resolves to it. */
export const USER_ID = 'user'

const BLOCK_LABELS: Record<CoreBlockId, string> = {
  profile: 'Who they are',
  focus: 'What matters to them right now',
  style: 'How they like to be helped'
}

/** How fast a memory fades in ranking (days until half weight). */
const HALF_LIFE_DAYS = { fact: 30, episode: 3, insight: 21 } as const

export const normKey = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

export interface FactInput {
  subjectId: string
  predicate: string
  objectId?: string | null
  text: string
  kind: FactKind
  confidence?: number
  importance?: number
  validFrom?: string | null
  validUntil?: string | null
  sourceEpisodeId?: string | null
}

export class BrainStore {
  constructor(private db: DatabaseSync) {
    this.ensureBlocks()
    this.ensureUser('User')
  }

  // ------------------------------------------------------------ helpers

  private all<T = Row>(sql: string, ...params: (string | number | null)[]): T[] {
    return this.db.prepare(sql).all(...params) as unknown as T[]
  }

  private get<T = Row>(sql: string, ...params: (string | number | null)[]): T | undefined {
    return this.db.prepare(sql).get(...params) as unknown as T | undefined
  }

  private run(sql: string, ...params: (string | number | null)[]): void {
    this.db.prepare(sql).run(...params)
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN')
    try {
      const out = fn()
      this.db.exec('COMMIT')
      return out
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }

  getMeta(key: string): string | null {
    return this.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)?.value ?? null
  }

  setMeta(key: string, value: string): void {
    this.run('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value)
  }

  // ------------------------------------------------------------ core blocks

  private ensureBlocks(): void {
    for (const id of Object.keys(BLOCK_LABELS) as CoreBlockId[]) {
      this.run(
        'INSERT OR IGNORE INTO blocks(id, label, text, updated_at) VALUES (?, ?, ?, ?)',
        id,
        BLOCK_LABELS[id],
        '',
        nowIso()
      )
    }
  }

  blocks(): CoreBlock[] {
    const order: CoreBlockId[] = ['profile', 'focus', 'style']
    const rows = this.all<{ id: CoreBlockId; label: string; text: string; updated_at: string }>('SELECT * FROM blocks')
    return order
      .map((id) => rows.find((r) => r.id === id))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => ({ id: r.id, label: r.label, text: r.text, updatedAt: r.updated_at }))
  }

  setBlock(id: CoreBlockId, text: string): CoreBlock {
    const clean = text.trim().slice(0, 1200)
    this.run('UPDATE blocks SET text = ?, updated_at = ? WHERE id = ?', clean, nowIso(), id)
    return { id, label: BLOCK_LABELS[id], text: clean, updatedAt: nowIso() }
  }

  // ------------------------------------------------------------ episodes

  addEpisode(kind: EpisodeKind, text: string, meta: Record<string, unknown> = {}, importance = 0.3): Episode {
    const ep: Episode = { id: randomUUID(), at: nowIso(), kind, text: text.trim(), meta, importance }
    this.run(
      'INSERT INTO episodes(id, at, kind, text, meta, importance) VALUES (?, ?, ?, ?, ?, ?)',
      ep.id,
      ep.at,
      ep.kind,
      ep.text,
      JSON.stringify(meta),
      importance
    )
    return ep
  }

  episodes(opts: { since?: string; until?: string; kinds?: EpisodeKind[]; limit?: number } = {}): Episode[] {
    const where: string[] = []
    const params: (string | number)[] = []
    if (opts.since) {
      where.push('at >= ?')
      params.push(opts.since)
    }
    if (opts.until) {
      where.push('at < ?')
      params.push(opts.until)
    }
    if (opts.kinds?.length) {
      where.push(`kind IN (${opts.kinds.map(() => '?').join(',')})`)
      params.push(...opts.kinds)
    }
    const sql = `SELECT * FROM episodes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY at DESC LIMIT ?`
    params.push(opts.limit ?? 200)
    return this.all(sql, ...params).map(rowToEpisode)
  }

  unprocessedEpisodes(limit = 40): Episode[] {
    return this.all('SELECT * FROM episodes WHERE processed = 0 ORDER BY at ASC LIMIT ?', limit).map(rowToEpisode)
  }

  markProcessed(ids: string[]): void {
    if (!ids.length) return
    this.run(`UPDATE episodes SET processed = 1 WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids)
  }

  // ------------------------------------------------------------ entities

  ensureUser(name: string): Entity {
    const existing = this.entity(USER_ID)
    const aliases = Array.from(new Set(['you', 'me', 'the user', 'user', name].map(normKey).filter(Boolean)))
    if (!existing) {
      this.run(
        'INSERT INTO entities(id, name, name_key, type, aliases, summary, mentions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)',
        USER_ID,
        name,
        USER_ID,
        'person',
        JSON.stringify(aliases),
        '',
        nowIso(),
        nowIso()
      )
    } else if (existing.name !== name || existing.aliases.join('|') !== aliases.join('|')) {
      this.run('UPDATE entities SET name = ?, aliases = ?, updated_at = ? WHERE id = ?', name, JSON.stringify(aliases), nowIso(), USER_ID)
    }
    return this.entity(USER_ID)!
  }

  entity(id: string): Entity | null {
    const r = this.get('SELECT * FROM entities WHERE id = ?', id)
    return r ? rowToEntity(r) : null
  }

  /** Find by name or alias; the user's own names always resolve to `user`. */
  findEntity(name: string): Entity | null {
    const key = normKey(name)
    if (!key) return null
    const direct = this.get('SELECT * FROM entities WHERE name_key = ?', key)
    if (direct) return rowToEntity(direct)
    const rows = this.all('SELECT * FROM entities')
    for (const r of rows) {
      const aliases = safeJsonArray(r.aliases as string)
      if (aliases.includes(key)) return rowToEntity(r)
    }
    return null
  }

  /** Resolve or create. Reuses an existing entity when the name matches. */
  upsertEntity(name: string, type: EntityType, aliases: string[] = []): Entity {
    const clean = name.trim().slice(0, 80)
    const found = this.findEntity(clean)
    const t = (ENTITY_TYPES as readonly string[]).includes(type) ? type : 'other'
    if (found) {
      const merged = Array.from(new Set([...found.aliases, ...aliases.map(normKey)].filter(Boolean)))
      this.run(
        'UPDATE entities SET aliases = ?, mentions = mentions + 1, updated_at = ?, type = CASE WHEN type = ? THEN ? ELSE type END WHERE id = ?',
        JSON.stringify(merged),
        nowIso(),
        'other',
        t,
        found.id
      )
      return this.entity(found.id)!
    }
    const id = randomUUID()
    this.run(
      'INSERT INTO entities(id, name, name_key, type, aliases, summary, mentions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)',
      id,
      clean,
      normKey(clean),
      t,
      JSON.stringify(aliases.map(normKey).filter(Boolean)),
      '',
      nowIso(),
      nowIso()
    )
    return this.entity(id)!
  }

  setEntitySummary(id: string, summary: string): void {
    this.run('UPDATE entities SET summary = ?, updated_at = ? WHERE id = ?', summary.slice(0, 400), nowIso(), id)
  }

  entities(opts: { limit?: number; q?: string } = {}): Entity[] {
    const rows = this.all('SELECT * FROM entities ORDER BY mentions DESC, updated_at DESC LIMIT ?', opts.limit ?? 500)
    const q = opts.q ? normKey(opts.q) : ''
    return rows.map(rowToEntity).filter((e) => !q || normKey(e.name).includes(q) || e.aliases.some((a) => a.includes(q)))
  }

  /** Entities whose name or alias occurs in the text (cheap graph entry point). */
  entitiesMentionedIn(text: string): Entity[] {
    const key = ` ${normKey(text)} `
    const out: Entity[] = []
    for (const e of this.entities({ limit: 800 })) {
      if (e.id === USER_ID) continue
      const names = [normKey(e.name), ...e.aliases].filter((n) => n.length >= 3)
      if (names.some((n) => key.includes(` ${n} `))) out.push(e)
    }
    return out
  }

  /** "Forget entirely": the entity and every fact that names it, either side. */
  deleteEntity(id: string): void {
    if (id === USER_ID) return
    this.run('DELETE FROM facts WHERE subject_id = ? OR object_id = ?', id, id)
    this.run('DELETE FROM entities WHERE id = ?', id)
  }

  // ------------------------------------------------------------ facts

  addFact(f: FactInput): Fact {
    const id = randomUUID()
    this.run(
      `INSERT INTO facts(id, subject_id, predicate, object_id, text, kind, confidence, importance, valid_from, valid_until, created_at, source_episode_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      f.subjectId,
      f.predicate.trim().slice(0, 80),
      f.objectId ?? null,
      f.text.trim().slice(0, 400),
      f.kind,
      clamp01(f.confidence ?? 0.8),
      clamp01(f.importance ?? 0.5),
      f.validFrom ?? null,
      f.validUntil ?? null,
      nowIso(),
      f.sourceEpisodeId ?? null
    )
    this.run('UPDATE entities SET mentions = mentions + 1, updated_at = ? WHERE id IN (?, ?)', nowIso(), f.subjectId, f.objectId ?? '')
    return this.fact(id)!
  }

  fact(id: string): Fact | null {
    const r = this.get(`${FACT_SELECT} WHERE f.id = ?`, id)
    return r ? rowToFact(r) : null
  }

  /** Close a fact's validity window instead of deleting it (history stays). */
  invalidateFact(id: string, supersededBy: string | null = null, validUntil: string | null = null): void {
    this.run(
      'UPDATE facts SET invalidated_at = ?, superseded_by = ?, valid_until = COALESCE(?, valid_until, ?) WHERE id = ? AND invalidated_at IS NULL',
      nowIso(),
      supersededBy,
      validUntil,
      nowIso().slice(0, 10),
      id
    )
  }

  updateFact(id: string, patch: { text?: string; importance?: number; confidence?: number; kind?: FactKind }): Fact | null {
    const cur = this.fact(id)
    if (!cur) return null
    this.run(
      'UPDATE facts SET text = ?, importance = ?, confidence = ?, kind = ? WHERE id = ?',
      (patch.text ?? cur.text).trim().slice(0, 400),
      clamp01(patch.importance ?? cur.importance),
      clamp01(patch.confidence ?? cur.confidence),
      patch.kind ?? cur.kind,
      id
    )
    return this.fact(id)
  }

  deleteFact(id: string): void {
    this.run('DELETE FROM facts WHERE id = ?', id)
  }

  facts(opts: { activeOnly?: boolean; entityId?: string; limit?: number } = {}): Fact[] {
    const where: string[] = []
    const params: (string | number)[] = []
    if (opts.activeOnly !== false) where.push('f.invalidated_at IS NULL')
    if (opts.entityId) {
      where.push('(f.subject_id = ? OR f.object_id = ?)')
      params.push(opts.entityId, opts.entityId)
    }
    params.push(opts.limit ?? 1000)
    return this.all(
      `${FACT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY f.importance DESC, f.created_at DESC LIMIT ?`,
      ...params
    ).map(rowToFact)
  }

  bumpRecall(ids: string[]): void {
    if (!ids.length) return
    this.run(
      `UPDATE facts SET recall_count = recall_count + 1, last_recalled_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`,
      nowIso(),
      ...ids
    )
  }

  // ------------------------------------------------------------ insights

  addInsight(text: string, importance = 0.6, evidence: string[] = []): Insight {
    const ins: Insight = { id: randomUUID(), at: nowIso(), text: text.trim().slice(0, 600), importance: clamp01(importance), evidence }
    this.run(
      'INSERT INTO insights(id, at, text, importance, evidence) VALUES (?, ?, ?, ?, ?)',
      ins.id,
      ins.at,
      ins.text,
      ins.importance,
      JSON.stringify(evidence)
    )
    return ins
  }

  insights(limit = 50): Insight[] {
    return this.all('SELECT * FROM insights ORDER BY at DESC LIMIT ?', limit).map(rowToInsight)
  }

  deleteInsight(id: string): void {
    this.run('DELETE FROM insights WHERE id = ?', id)
  }

  // ------------------------------------------------------------ recall

  /**
   * Hybrid recall: full-text relevance (BM25) blended with recency and
   * importance - the Generative Agents scoring - plus a graph hop: anything
   * the query names gets its facts pulled in even when the words differ.
   */
  recall(query: string, opts: { facts?: number; episodes?: number; insights?: number } = {}): RecallHit[] {
    const q = ftsQuery(query)
    const hits: RecallHit[] = []
    const now = Date.now()
    const score = (rel: number, at: string, importance: number, half: number): number => {
      const ageDays = Math.max(0, (now - new Date(at).getTime()) / 86_400_000)
      const rec = Math.exp((-Math.LN2 * ageDays) / half)
      return 0.55 * rel + 0.25 * rec + 0.2 * importance
    }

    const factRows = new Map<string, { row: Row; rel: number }>()
    if (q) {
      const rows = this.all(
        `SELECT ${FACT_COLS}, bm25(facts_fts) AS rank FROM facts_fts JOIN facts f ON f.rowid = facts_fts.rowid
         LEFT JOIN entities s ON s.id = f.subject_id LEFT JOIN entities o ON o.id = f.object_id
         WHERE facts_fts MATCH ? AND f.invalidated_at IS NULL ORDER BY rank LIMIT 40`,
        q
      )
      const worst = rows.reduce((m, r) => Math.min(m, Number(r.rank)), 0) || -1
      for (const r of rows) factRows.set(String(r.id), { row: r, rel: Number(r.rank) / worst })
    }
    // graph hop: facts about anyone or anything the query names
    for (const e of this.entitiesMentionedIn(query)) {
      for (const f of this.all(`${FACT_SELECT} WHERE (f.subject_id = ? OR f.object_id = ?) AND f.invalidated_at IS NULL ORDER BY f.importance DESC LIMIT 12`, e.id, e.id)) {
        const cur = factRows.get(String(f.id))
        if (cur) cur.rel = Math.min(1, cur.rel + 0.35)
        else factRows.set(String(f.id), { row: f, rel: 0.6 })
      }
    }
    for (const { row, rel } of factRows.values()) {
      const f = rowToFact(row)
      hits.push({ kind: 'fact', id: f.id, text: f.text, at: f.createdAt, score: score(rel, f.createdAt, f.importance, HALF_LIFE_DAYS.fact) })
    }

    if (q) {
      const eps = this.all(
        `SELECT e.*, bm25(episodes_fts) AS rank FROM episodes_fts JOIN episodes e ON e.rowid = episodes_fts.rowid
         WHERE episodes_fts MATCH ? ORDER BY rank LIMIT 30`,
        q
      )
      const worst = eps.reduce((m, r) => Math.min(m, Number(r.rank)), 0) || -1
      for (const r of eps) {
        const e = rowToEpisode(r)
        hits.push({
          kind: 'episode',
          id: e.id,
          text: `${e.kind === 'observation' ? 'Seen on screen' : e.kind === 'chat_user' ? 'They said' : e.kind === 'chat_assistant' ? 'You said' : 'Note'}: ${e.text}`,
          at: e.at,
          score: score(Number(r.rank) / worst, e.at, e.importance, HALF_LIFE_DAYS.episode)
        })
      }
      const ins = this.all(
        `SELECT i.*, bm25(insights_fts) AS rank FROM insights_fts JOIN insights i ON i.rowid = insights_fts.rowid
         WHERE insights_fts MATCH ? ORDER BY rank LIMIT 15`,
        q
      )
      const worstI = ins.reduce((m, r) => Math.min(m, Number(r.rank)), 0) || -1
      for (const r of ins) {
        const i = rowToInsight(r)
        hits.push({ kind: 'insight', id: i.id, text: i.text, at: i.at, score: score(Number(r.rank) / worstI, i.at, i.importance, HALF_LIFE_DAYS.insight) })
      }
    }

    const take = (kind: RecallHit['kind'], n: number): RecallHit[] =>
      hits
        .filter((h) => h.kind === kind)
        .sort((a, b) => b.score - a.score)
        .slice(0, n)
    const out = [...take('fact', opts.facts ?? 12), ...take('insight', opts.insights ?? 3), ...take('episode', opts.episodes ?? 6)]
    this.bumpRecall(out.filter((h) => h.kind === 'fact').map((h) => h.id))
    return out
  }

  // ------------------------------------------------------------ stats & export

  stats(): BrainStats {
    const n = (sql: string): number => Number(this.get<{ n: number }>(sql)?.n ?? 0)
    return {
      episodes: n('SELECT COUNT(*) n FROM episodes'),
      observations: n("SELECT COUNT(*) n FROM episodes WHERE kind = 'observation'"),
      entities: n('SELECT COUNT(*) n FROM entities') - 1,
      facts: n('SELECT COUNT(*) n FROM facts WHERE invalidated_at IS NULL'),
      invalidated: n('SELECT COUNT(*) n FROM facts WHERE invalidated_at IS NOT NULL'),
      insights: n('SELECT COUNT(*) n FROM insights'),
      lastReflectionAt: this.getMeta('lastReflectionAt'),
      lastExtractionAt: this.getMeta('lastExtractionAt'),
      lastError: this.getMeta('lastError')
    }
  }

  exportAll(): Record<string, unknown> {
    return {
      exportedAt: nowIso(),
      blocks: this.blocks(),
      entities: this.entities({ limit: 100000 }),
      facts: this.facts({ activeOnly: false, limit: 100000 }),
      insights: this.insights(100000),
      episodes: this.episodes({ limit: 100000 })
    }
  }
}

// ---------------------------------------------------------------- row mapping

const FACT_COLS = 'f.*, s.name AS subject_name, o.name AS object_name'
const FACT_SELECT = `SELECT ${FACT_COLS} FROM facts f LEFT JOIN entities s ON s.id = f.subject_id LEFT JOIN entities o ON o.id = f.object_id`

const clamp01 = (v: number): number => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5))

function safeJsonArray(s: string): string[] {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

function rowToEpisode(r: Row): Episode {
  let meta: Record<string, unknown> = {}
  try {
    meta = JSON.parse(String(r.meta ?? '{}'))
  } catch {
    /* keep empty */
  }
  return { id: String(r.id), at: String(r.at), kind: r.kind as EpisodeKind, text: String(r.text), meta, importance: Number(r.importance) }
}

function rowToEntity(r: Row): Entity {
  return {
    id: String(r.id),
    name: String(r.name),
    type: r.type as EntityType,
    aliases: safeJsonArray(String(r.aliases ?? '[]')),
    summary: String(r.summary ?? ''),
    mentions: Number(r.mentions ?? 0),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at)
  }
}

function rowToFact(r: Row): Fact {
  return {
    id: String(r.id),
    subjectId: String(r.subject_id),
    subject: String(r.subject_name ?? ''),
    predicate: String(r.predicate),
    objectId: r.object_id == null ? null : String(r.object_id),
    object: r.object_name == null ? null : String(r.object_name),
    text: String(r.text),
    kind: r.kind as FactKind,
    confidence: Number(r.confidence),
    importance: Number(r.importance),
    validFrom: r.valid_from == null ? null : String(r.valid_from),
    validUntil: r.valid_until == null ? null : String(r.valid_until),
    createdAt: String(r.created_at),
    invalidatedAt: r.invalidated_at == null ? null : String(r.invalidated_at),
    sourceEpisodeId: r.source_episode_id == null ? null : String(r.source_episode_id),
    supersededBy: r.superseded_by == null ? null : String(r.superseded_by),
    recallCount: Number(r.recall_count ?? 0)
  }
}

function rowToInsight(r: Row): Insight {
  return { id: String(r.id), at: String(r.at), text: String(r.text), importance: Number(r.importance), evidence: safeJsonArray(String(r.evidence ?? '[]')) }
}
