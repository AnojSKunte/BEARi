import type { AppSettings } from '@shared/types'
import type { AiProvider } from '../ai/provider'
import { anthropicProvider } from '../ai/anthropic'
import { openaiProvider } from '../ai/openai'
import { geminiProvider } from '../ai/gemini'

const PROVIDERS: Record<string, AiProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  gemini: geminiProvider
}

/**
 * The model calls her background thinking makes (extraction, reflection,
 * looking at the screen). Always the provider and model the user picked for
 * chat - one key, one bill, no surprises.
 */
export class BrainLlm {
  constructor(private getSettings: () => AppSettings) {}

  private active(): { provider: AiProvider; apiKey: string; model: string } | null {
    const s = this.getSettings()
    const id = s.ai.activeProvider
    const cfg = s.ai.providers[id]
    const provider = PROVIDERS[id]
    if (!provider || !cfg?.apiKey) return null
    return { provider, apiKey: cfg.apiKey, model: cfg.model }
  }

  ready(): boolean {
    return this.active() !== null
  }

  /** Ask for a JSON object and parse it defensively; null when unusable. */
  async json<T>(system: string, prompt: string, maxTokens = 4096): Promise<T | null> {
    const a = this.active()
    if (!a) return null
    const raw = await a.provider.complete({ system, prompt, apiKey: a.apiKey, model: a.model, maxTokens, json: true })
    return parseJson<T>(raw)
  }

  async look<T>(system: string, prompt: string, imageBase64: string, mime: 'image/jpeg' | 'image/png'): Promise<T | null> {
    const a = this.active()
    if (!a) return null
    const raw = await a.provider.describeImage({
      system,
      prompt,
      imageBase64,
      mime,
      apiKey: a.apiKey,
      model: a.model,
      maxTokens: 800,
      json: true
    })
    return parseJson<T>(raw)
  }
}

/** Models wrap JSON in prose or fences now and then - dig the object out. */
export function parseJson<T>(raw: string): T | null {
  const text = raw.trim()
  const candidates = [text, text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')]
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1))
  for (const c of candidates) {
    try {
      const v = JSON.parse(c)
      if (v && typeof v === 'object') return v as T
    } catch {
      /* try the next shape */
    }
  }
  return null
}
