import type { EntityType, FactKind, Observation } from '@shared/types'
import { ENTITY_TYPES } from '@shared/types'
import type { BrainStore } from './store'
import { USER_ID, normKey } from './store'
import type { BrainLlm } from './llm'

/**
 * How she learns.
 *
 * After every exchange an extraction pass (Mem0's shape) reads what was said,
 * is shown the facts she already holds that look related, and decides per
 * candidate: ADD, UPDATE (which here means "the old one stops being true and
 * this replaces it" - Graphiti keeps history, so nothing is overwritten),
 * INVALIDATE, or NOOP. It may also rewrite her three core blocks.
 *
 * While she sleeps a reflection pass (Generative Agents) reads everything
 * since the last one and writes a few higher-level insights, refreshing what
 * matters to the user right now.
 */

const FACT_KINDS: FactKind[] = ['fact', 'preference', 'event', 'relationship', 'goal', 'habit']

interface ExtractedFact {
  op?: 'add' | 'update' | 'invalidate' | 'noop'
  id?: string
  subject?: string
  subject_type?: string
  predicate?: string
  object?: string | null
  object_type?: string
  text?: string
  kind?: string
  confidence?: number
  importance?: number
  valid_from?: string | null
  valid_until?: string | null
}

interface ExtractionResult {
  facts?: ExtractedFact[]
  blocks?: { profile?: string; focus?: string; style?: string }
  entities?: { name: string; type?: string; summary?: string; aliases?: string[] }[]
  importance?: number
}

export interface LearnSummary {
  added: number
  updated: number
  invalidated: number
  blocksChanged: number
}

const EXTRACT_SYSTEM = `You maintain the long-term memory of BEARi, a desktop companion who wants to genuinely know the person she lives with. You read one exchange and decide what is worth keeping for weeks and months: who the people in their life are, what they are working on, what they like and avoid, how they want to be helped, their goals, habits, plans and important dates.

Rules:
- Keep only durable, specific information. Skip small talk, one-off requests, and anything already fully covered by an existing fact (op "noop").
- The person you are learning about is always the entity "User". Refer to them as "User" in subject/object fields, never by pronoun.
- Write each fact as one clear sentence in third person, e.g. "User's teammate Priya owns the billing service."
- When new information changes or contradicts an existing fact, use op "update" with that fact's id and give the corrected sentence; if something simply stopped being true, use op "invalidate" with the id. Never restate an existing fact as "add".
- Dates: resolve relative dates against today's date into ISO dates (valid_from / valid_until) when a fact is time-bound (an event, a temporary situation).
- Core blocks: "profile" (who they are: name, role, life context), "focus" (what matters to them these days: current projects, deadlines, worries), "style" (how they like to be helped and spoken to). Only include a block when this exchange genuinely changes it; return the complete new text (max 600 characters), keeping everything still true from the current version.
- Be conservative with confidence for guesses, generous with importance for people, goals and deadlines.

Output only a JSON object:
{"facts":[{"op":"add|update|invalidate|noop","id":"existing id when update/invalidate/noop","subject":"User","subject_type":"person|project|organization|place|tool|topic|event|other","predicate":"short verb phrase","object":"name or null","object_type":"…","text":"one sentence","kind":"fact|preference|event|relationship|goal|habit","confidence":0.0-1.0,"importance":0.0-1.0,"valid_from":"YYYY-MM-DD or null","valid_until":"YYYY-MM-DD or null"}],
 "entities":[{"name":"…","type":"…","summary":"one line","aliases":["…"]}],
 "blocks":{"profile":"…","focus":"…","style":"…"},
 "importance":0.0-1.0}
Empty arrays and an omitted "blocks" are normal - most exchanges teach nothing new.`

export async function extractFromExchange(
  store: BrainStore,
  llm: BrainLlm,
  input: {
    userName: string
    userText: string
    assistantText: string
    sourceEpisodeId: string
    recentObservations: Observation[]
  }
): Promise<LearnSummary | null> {
  const related = store.recall(`${input.userText} ${input.assistantText}`, { facts: 14, episodes: 0, insights: 0 })
  const relatedFacts = related.map((h) => store.fact(h.id)).filter((f): f is NonNullable<typeof f> => !!f)
  const blocks = store.blocks()
  const known = store
    .entities({ limit: 80 })
    .map((e) => `${e.name} (${e.type})`)
    .join(', ')

  const prompt = [
    `Today: ${new Date().toDateString()}. The user's name: ${input.userName || 'unknown'}.`,
    '',
    'CURRENT CORE BLOCKS',
    ...blocks.map((b) => `${b.id}: ${b.text || '(empty)'}`),
    '',
    `KNOWN ENTITIES: ${known || '(none yet)'}`,
    '',
    'EXISTING FACTS THAT MAY BE RELATED (id | text)',
    ...(relatedFacts.length ? relatedFacts.map((f) => `${f.id} | ${f.text}`) : ['(none)']),
    '',
    input.recentObservations.length
      ? 'WHAT SHE SAW ON THEIR SCREEN RECENTLY\n' +
        input.recentObservations.map((o) => `- ${o.at.slice(11, 16)} ${o.app}: ${o.activity}`).join('\n') +
        '\n'
      : '',
    'THE EXCHANGE',
    `User: ${input.userText}`,
    `BEARi: ${input.assistantText}`
  ].join('\n')

  const result = await llm.json<ExtractionResult>(EXTRACT_SYSTEM, prompt)
  if (!result) return null
  return applyExtraction(store, result, input.sourceEpisodeId)
}

function applyExtraction(store: BrainStore, result: ExtractionResult, sourceEpisodeId: string): LearnSummary {
  const summary: LearnSummary = { added: 0, updated: 0, invalidated: 0, blocksChanged: 0 }
  store.transaction(() => {
    for (const e of result.entities ?? []) {
      if (!e?.name || normKey(e.name) === USER_ID || isUserName(e.name)) continue
      const ent = store.upsertEntity(e.name, asEntityType(e.type), e.aliases ?? [])
      if (e.summary) store.setEntitySummary(ent.id, e.summary)
    }

    for (const f of result.facts ?? []) {
      const op = f.op ?? 'add'
      if (op === 'noop') continue
      if (op === 'invalidate') {
        if (f.id && store.fact(f.id)) {
          store.invalidateFact(f.id, null, f.valid_until ?? null)
          summary.invalidated++
        }
        continue
      }
      if (!f.text || !f.subject) continue
      const text = f.text
      const subject = resolve(store, f.subject, asEntityType(f.subject_type))
      const object = f.object ? resolve(store, f.object, asEntityType(f.object_type)) : null
      if (!subject) continue
      if (op === 'update' && f.id && store.fact(f.id)) {
        const old = store.fact(f.id)!
        if (normKey(old.text) === normKey(f.text)) continue
        const fresh = store.addFact({
          subjectId: subject.id,
          predicate: f.predicate ?? old.predicate,
          objectId: object?.id ?? null,
          text: f.text,
          kind: asFactKind(f.kind ?? old.kind),
          confidence: f.confidence ?? old.confidence,
          importance: f.importance ?? old.importance,
          validFrom: f.valid_from ?? null,
          validUntil: f.valid_until ?? null,
          sourceEpisodeId
        })
        store.invalidateFact(old.id, fresh.id, f.valid_from ?? null)
        summary.updated++
        continue
      }
      // add - but never a sentence she already holds about this subject
      const dup = store
        .facts({ entityId: subject.id, limit: 400 })
        .some((x) => normKey(x.text) === normKey(text))
      if (dup) continue
      store.addFact({
        subjectId: subject.id,
        predicate: f.predicate ?? 'relates to',
        objectId: object?.id ?? null,
        text: f.text,
        kind: asFactKind(f.kind),
        confidence: f.confidence,
        importance: f.importance,
        validFrom: f.valid_from ?? null,
        validUntil: f.valid_until ?? null,
        sourceEpisodeId
      })
      summary.added++
    }

    for (const id of ['profile', 'focus', 'style'] as const) {
      const text = result.blocks?.[id]
      if (typeof text === 'string' && text.trim() && text.trim() !== store.blocks().find((b) => b.id === id)?.text) {
        store.setBlock(id, text)
        summary.blocksChanged++
      }
    }
  })
  return summary
}

// ---------------------------------------------------------------- reflection

const REFLECT_SYSTEM = `You are BEARi's quiet, reflective side. While the user is away you read what happened recently - conversations and what was on their screen - together with what you already know, and you write down a few genuine insights: patterns, what they seem to care about, how their week is going, what might help them next. Think like a thoughtful friend, not a report.

Rules:
- 2 to 5 insights, each one or two sentences, specific to this person, useful next week. No restating raw facts.
- "evidence" lists the ids of the episodes an insight rests on.
- Refresh "focus" (what matters to them right now, max 600 characters) whenever the recent period shifts it; keep everything still true. Only touch "profile" or "style" if you learned something lasting about who they are or how they like to be helped.
- Optionally give one-line summaries for entities you now understand better.

Output only a JSON object:
{"insights":[{"text":"…","importance":0.0-1.0,"evidence":["episode id",…]}],
 "blocks":{"focus":"…","profile":"…","style":"…"},
 "entities":[{"name":"…","summary":"…"}]}`

export async function reflect(
  store: BrainStore,
  llm: BrainLlm,
  opts: { userName: string; force?: boolean }
): Promise<{ insights: number; blocksChanged: number } | null> {
  const pending = store.unprocessedEpisodes(60)
  const last = store.getMeta('lastReflectionAt')
  const recent = last ? Date.now() - new Date(last).getTime() < 90 * 60 * 1000 : false
  if (!opts.force && (pending.length < 8 || recent)) return null
  if (pending.length === 0) return null

  const blocks = store.blocks()
  const topFacts = store.facts({ limit: 40 })
  const prompt = [
    `Today: ${new Date().toDateString()}. The user's name: ${opts.userName || 'unknown'}.`,
    '',
    'CORE BLOCKS',
    ...blocks.map((b) => `${b.id}: ${b.text || '(empty)'}`),
    '',
    'WHAT YOU ALREADY KNOW (most important facts)',
    ...topFacts.map((f) => `- ${f.text}`),
    '',
    'WHAT HAPPENED SINCE YOU LAST REFLECTED (id | time | kind | text)',
    ...pending.map((e) => `${e.id} | ${e.at.slice(0, 16).replace('T', ' ')} | ${e.kind} | ${e.text.slice(0, 300)}`)
  ].join('\n')

  const result = await llm.json<{
    insights?: { text?: string; importance?: number; evidence?: string[] }[]
    blocks?: { profile?: string; focus?: string; style?: string }
    entities?: { name?: string; summary?: string }[]
  }>(REFLECT_SYSTEM, prompt)
  if (!result) return null

  let insights = 0
  let blocksChanged = 0
  const known = new Set(pending.map((e) => e.id))
  store.transaction(() => {
    for (const i of result.insights ?? []) {
      if (!i?.text) continue
      store.addInsight(i.text, i.importance ?? 0.6, (i.evidence ?? []).filter((id) => known.has(id)))
      insights++
    }
    for (const id of ['profile', 'focus', 'style'] as const) {
      const text = result.blocks?.[id]
      if (typeof text === 'string' && text.trim() && text.trim() !== store.blocks().find((b) => b.id === id)?.text) {
        store.setBlock(id, text)
        blocksChanged++
      }
    }
    for (const e of result.entities ?? []) {
      if (!e?.name || !e.summary) continue
      const ent = store.findEntity(e.name)
      if (ent && ent.id !== USER_ID) store.setEntitySummary(ent.id, e.summary)
    }
    store.markProcessed(pending.map((e) => e.id))
    store.setMeta('lastReflectionAt', new Date().toISOString())
  })
  return { insights, blocksChanged }
}

// ---------------------------------------------------------------- helpers

function resolve(store: BrainStore, name: string, type: EntityType): { id: string } | null {
  const key = normKey(name)
  if (!key) return null
  if (key === USER_ID || isUserName(name) || store.findEntity(name)?.id === USER_ID) return { id: USER_ID }
  return store.upsertEntity(name, type)
}

function isUserName(name: string): boolean {
  const k = normKey(name)
  return k === 'user' || k === 'the user' || k === 'you' || k === 'me'
}

function asEntityType(t?: string): EntityType {
  return t && (ENTITY_TYPES as readonly string[]).includes(t) ? (t as EntityType) : 'other'
}

function asFactKind(k?: string): FactKind {
  return k && FACT_KINDS.includes(k as FactKind) ? (k as FactKind) : 'fact'
}
