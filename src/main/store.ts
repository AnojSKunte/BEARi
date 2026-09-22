import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'fs'
import { join } from 'path'

/**
 * Minimal atomic JSON file store. One file per domain (settings, memory).
 * Kept dependency-free on purpose — replaceable by SQLite later without
 * touching anything above the engine layer.
 */
export class JsonStore<T> {
  private readonly file: string
  private cache: T

  constructor(name: string, defaults: T) {
    const dir = join(app.getPath('userData'), 'data')
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, `${name}.json`)
    this.cache = this.load(defaults)
  }

  private load(defaults: T): T {
    if (!existsSync(this.file)) return structuredClone(defaults)
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf-8'))
      // Shallow-merge over defaults so new fields appear after upgrades.
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return { ...structuredClone(defaults), ...raw }
      }
      return raw as T
    } catch {
      return structuredClone(defaults)
    }
  }

  get(): T {
    return this.cache
  }

  set(value: T): void {
    this.cache = value
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf-8')
    renameSync(tmp, this.file)
  }

  update(patch: Partial<T>): T {
    this.set({ ...this.cache, ...patch })
    return this.cache
  }
}
