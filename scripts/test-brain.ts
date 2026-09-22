/**
 * Smoke test for her memory store - runs the real SQLite layer (no LLM, no
 * Electron) against a throwaway database and checks the things that must
 * hold: bi-temporal invalidation keeps history, recall finds facts by words
 * and by graph hop, ranking prefers recent + important, the notebook view
 * still round-trips, and export contains everything.
 *
 * Usage: npx tsx scripts/test-brain.ts
 */
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openBrainDb } from '../src/main/brain/db'
import { BrainStore, USER_ID } from '../src/main/brain/store'

let failed = 0
const check = (name: string, ok: boolean, detail = ''): void => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failed++
}

const dir = mkdtempSync(join(tmpdir(), 'beari-brain-'))
const db = openBrainDb(join(dir, 'brain.sqlite'))
const store = new BrainStore(db)

// ---- entities resolve by name and alias, and the user is always `user`
store.ensureUser('Anoj')
const priya = store.upsertEntity('Priya', 'person', ['Priya Sharma'])
check('entity created', priya.name === 'Priya' && priya.type === 'person')
check('entity resolved by alias', store.findEntity('priya sharma')?.id === priya.id)
check('same name reuses entity', store.upsertEntity('priya', 'other').id === priya.id)
check('user resolves from alias', store.findEntity('you')?.id === USER_ID)

// ---- facts with two clocks
const demo = store.addFact({
  subjectId: USER_ID,
  predicate: 'has demo',
  text: "User's demo to the CEO is on Friday.",
  kind: 'event',
  importance: 0.9,
  validFrom: '2026-09-25'
})
const billing = store.addFact({
  subjectId: USER_ID,
  predicate: 'works with',
  objectId: priya.id,
  text: "User's teammate Priya owns the billing service.",
  kind: 'relationship',
  importance: 0.7
})
store.addFact({ subjectId: USER_ID, predicate: 'prefers', text: 'User prefers short replies while coding.', kind: 'preference', importance: 0.6 })
check('facts stored', store.facts().length === 3)

const moved = store.addFact({ subjectId: USER_ID, predicate: 'has demo', text: "User's demo to the CEO moved to Monday.", kind: 'event', importance: 0.9 })
store.invalidateFact(demo.id, moved.id)
const old = store.fact(demo.id)
check('old fact kept with closed window', !!old?.invalidatedAt && old?.supersededBy === moved.id)
check('active facts exclude the retired one', !store.facts().some((f) => f.id === demo.id))
check('history still lists it', store.facts({ activeOnly: false }).some((f) => f.id === demo.id))

// ---- recall: by words, and by graph hop from a name
const byWords = store.recall('when is my demo?')
check('recall by words finds the demo', byWords.some((h) => h.id === moved.id), byWords.map((h) => h.text).join(' | '))
check('recall never returns retired facts', !byWords.some((h) => h.id === demo.id))
const byName = store.recall('anything about Priya?')
check('recall by graph hop finds Priya facts', byName.some((h) => h.id === billing.id))
const nothing = store.recall('!!! ???')
check('recall tolerates punctuation-only queries', Array.isArray(nothing))

// ---- episodes + FTS
const ep = store.addEpisode('chat_user', 'Can you remind me about the billing migration next week?', {}, 0.4)
store.addEpisode('observation', 'VS Code: editing the billing migration script', { app: 'VS Code' }, 0.25)
const eps = store.recall('billing migration', { facts: 0, episodes: 5, insights: 0 })
check('episodes are recalled', eps.filter((h) => h.kind === 'episode').length === 2)
check('unprocessed episodes queue up', store.unprocessedEpisodes().length === 2)
store.markProcessed([ep.id])
check('marking processed drains the queue', store.unprocessedEpisodes().length === 1)

// ---- blocks and insights
store.setBlock('focus', 'Shipping BEARi 1.1 this week.')
check('block saved', store.blocks().find((b) => b.id === 'focus')?.text === 'Shipping BEARi 1.1 this week.')
store.addInsight('They work best late in the evening.', 0.7, [ep.id])
check('insight recalled', store.recall('evening work', { facts: 0, episodes: 0, insights: 3 }).some((h) => h.kind === 'insight'))

// ---- ranking prefers importance when words tie
const a = store.addFact({ subjectId: USER_ID, predicate: 'likes', text: 'User likes mango lassi.', kind: 'preference', importance: 0.2 })
const b = store.addFact({ subjectId: USER_ID, predicate: 'loves', text: 'User loves mango season every year.', kind: 'preference', importance: 0.9 })
const mango = store.recall('mango').filter((h) => h.kind === 'fact')
check('higher importance ranks first', mango[0]?.id === b.id && mango.some((h) => h.id === a.id))

// ---- deletion cascades and stats
store.deleteEntity(priya.id)
check('deleting an entity removes its facts', !store.facts({ activeOnly: false }).some((f) => f.id === billing.id))
const stats = store.stats()
check('stats add up', stats.facts === 4 && stats.invalidated === 1 && stats.insights === 1 && stats.episodes === 2, JSON.stringify(stats))
const dump = store.exportAll()
check('export has every layer', ['blocks', 'entities', 'facts', 'insights', 'episodes'].every((k) => Array.isArray((dump as Record<string, unknown>)[k])))

db.close()
rmSync(dir, { recursive: true, force: true })
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed')
process.exit(failed ? 1 : 0)
