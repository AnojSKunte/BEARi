import { app } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'

/**
 * Her brain lives in one SQLite file (Node's built-in driver - no native
 * add-on to rebuild per Electron version). FTS5 gives full-text recall over
 * every layer; WAL mode keeps writes from ever blocking a reply.
 */
export type Row = Record<string, string | number | null>

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Core memory: small, always in her context, edited by her and by the user.
CREATE TABLE IF NOT EXISTS blocks (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  text       TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

-- Episodic memory: everything that happened, in order.
CREATE TABLE IF NOT EXISTS episodes (
  id         TEXT PRIMARY KEY,
  at         TEXT NOT NULL,
  kind       TEXT NOT NULL,
  text       TEXT NOT NULL,
  meta       TEXT NOT NULL DEFAULT '{}',
  importance REAL NOT NULL DEFAULT 0.3,
  processed  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS episodes_at ON episodes(at);
CREATE INDEX IF NOT EXISTS episodes_kind_at ON episodes(kind, at);
CREATE VIRTUAL TABLE IF NOT EXISTS episodes_fts USING fts5(text, content='episodes', content_rowid='rowid');
CREATE TRIGGER IF NOT EXISTS episodes_ai AFTER INSERT ON episodes BEGIN
  INSERT INTO episodes_fts(rowid, text) VALUES (new.rowid, new.text);
END;
CREATE TRIGGER IF NOT EXISTS episodes_ad AFTER DELETE ON episodes BEGIN
  INSERT INTO episodes_fts(episodes_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;

-- Semantic memory: who and what, and facts about them that carry two clocks -
-- when they were true (valid_from / valid_until) and when she learned or
-- retired them (created_at / invalidated_at). Nothing is overwritten.
CREATE TABLE IF NOT EXISTS entities (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  name_key   TEXT NOT NULL UNIQUE,
  type       TEXT NOT NULL,
  aliases    TEXT NOT NULL DEFAULT '[]',
  summary    TEXT NOT NULL DEFAULT '',
  mentions   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS facts (
  id                TEXT PRIMARY KEY,
  subject_id        TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  predicate         TEXT NOT NULL,
  object_id         TEXT REFERENCES entities(id) ON DELETE SET NULL,
  text              TEXT NOT NULL,
  kind              TEXT NOT NULL,
  confidence        REAL NOT NULL DEFAULT 0.8,
  importance        REAL NOT NULL DEFAULT 0.5,
  valid_from        TEXT,
  valid_until       TEXT,
  created_at        TEXT NOT NULL,
  invalidated_at    TEXT,
  source_episode_id TEXT,
  superseded_by     TEXT,
  last_recalled_at  TEXT,
  recall_count      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS facts_subject ON facts(subject_id, invalidated_at);
CREATE INDEX IF NOT EXISTS facts_object ON facts(object_id);
CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(text, content='facts', content_rowid='rowid');
CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
  INSERT INTO facts_fts(rowid, text) VALUES (new.rowid, new.text);
END;
CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN
  INSERT INTO facts_fts(facts_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;
CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE OF text ON facts BEGIN
  INSERT INTO facts_fts(facts_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
  INSERT INTO facts_fts(rowid, text) VALUES (new.rowid, new.text);
END;

-- Reflections: what she works out about the user while she sleeps.
CREATE TABLE IF NOT EXISTS insights (
  id         TEXT PRIMARY KEY,
  at         TEXT NOT NULL,
  text       TEXT NOT NULL,
  importance REAL NOT NULL DEFAULT 0.6,
  evidence   TEXT NOT NULL DEFAULT '[]'
);
CREATE VIRTUAL TABLE IF NOT EXISTS insights_fts USING fts5(text, content='insights', content_rowid='rowid');
CREATE TRIGGER IF NOT EXISTS insights_ai AFTER INSERT ON insights BEGIN
  INSERT INTO insights_fts(rowid, text) VALUES (new.rowid, new.text);
END;
CREATE TRIGGER IF NOT EXISTS insights_ad AFTER DELETE ON insights BEGIN
  INSERT INTO insights_fts(insights_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;
`

export function openBrainDb(file?: string): DatabaseSync {
  let path = file
  if (!path) {
    const dir = join(app.getPath('userData'), 'data')
    mkdirSync(dir, { recursive: true })
    path = join(dir, 'brain.sqlite')
  }
  const db = new DatabaseSync(path)
  db.exec(SCHEMA)
  return db
}

export const nowIso = (): string => new Date().toISOString()

/** Turn free text into an FTS5 query that tolerates any punctuation. */
export function ftsQuery(text: string, max = 12): string | null {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    const t = raw.trim()
    if (t.length < 2 || STOP.has(t) || seen.has(t)) continue
    seen.add(t)
    out.push(`"${t.replace(/"/g, '')}"`)
    if (out.length >= max) break
  }
  return out.length ? out.join(' OR ') : null
}

const STOP = new Set(
  (
    'a an the and or but if then so of to in on at by for with from as is are was were be been being am do does did ' +
    'have has had i me my mine you your yours he she it we they them their this that these those what which who whom ' +
    'when where why how not no yes can could should would will just about into over under again also very really ' +
    'okay ok hi hello hey thanks thank please'
  ).split(' ')
)
