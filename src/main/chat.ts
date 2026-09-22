import type { AppSettings, ChatMessage, ReplyDirectives } from '@shared/types'
import type { AiProvider } from './ai/provider'
import { anthropicProvider } from './ai/anthropic'
import { openaiProvider } from './ai/openai'
import { geminiProvider } from './ai/gemini'
import { buildSystemPrompt } from './ai/persona'
import { parseDirectives } from '@shared/directives'
import type { Brain } from './brain'

const PROVIDERS: Record<string, AiProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  gemini: geminiProvider
}

const HISTORY_LIMIT = 30

export interface ChatResult {
  text: string
  directives: ReplyDirectives
}

/**
 * Chat Engine — holds the running conversation, routes to the active
 * provider, hands each exchange to her brain and returns clean text.
 */
export class ChatEngine {
  private history: ChatMessage[] = []
  private abort: AbortController | null = null

  constructor(
    private getSettings: () => AppSettings,
    private brain: Brain
  ) {}

  cancel(): void {
    this.abort?.abort()
    this.abort = null
  }

  async send(userText: string, onChunk: (raw: string) => void): Promise<ChatResult> {
    const settings = this.getSettings()
    const { activeProvider } = settings.ai
    const provider = PROVIDERS[activeProvider]
    const config = settings.ai.providers[activeProvider]

    if (!config?.apiKey) {
      throw new Error(
        `No API key configured for ${activeProvider}. Open the dashboard → AI Providers to add one.`
      )
    }

    this.cancel()
    this.abort = new AbortController()

    this.history.push({ role: 'user', content: userText })
    if (this.history.length > HISTORY_LIMIT) {
      this.history = this.history.slice(-HISTORY_LIMIT)
    }

    // What she remembers that bears on this message - recalled fresh each turn.
    const system = buildSystemPrompt(settings, this.brain.contextFor(userText))
    const raw = await provider.chat(
      {
        system,
        messages: this.history,
        apiKey: config.apiKey,
        model: config.model
      },
      { onChunk, signal: this.abort.signal }
    )

    const { text, directives } = parseDirectives(raw)
    this.history.push({ role: 'assistant', content: raw })

    // Learning happens after the reply is on screen, never in its way.
    this.brain.afterExchange(userText, text, directives.remember)
    return { text, directives }
  }
}
