import type { AiProvider, ChatRequest, CompleteRequest, StreamHandlers, VisionRequest } from './provider'
import { ensureOk, readSse, withTimeout } from './provider'

const URL = 'https://api.anthropic.com/v1/messages'

const headers = (apiKey: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-api-key': apiKey,
  'anthropic-version': '2023-06-01'
})

/** Collect the text blocks of a non-streaming Messages response. */
function textOf(body: { content?: { type: string; text?: string }[] }): string {
  return (body.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
}

export const anthropicProvider: AiProvider = {
  id: 'anthropic',

  async chat(req: ChatRequest, { onChunk, signal }: StreamHandlers): Promise<string> {
    const res = await fetch(URL, {
      method: 'POST',
      signal,
      headers: headers(req.apiKey),
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? 1024,
        system: req.system,
        messages: req.messages,
        stream: true
      })
    })
    await ensureOk(res, 'Anthropic')

    let full = ''
    await readSse(res, signal, (payload) => {
      try {
        const event = JSON.parse(payload)
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          full += event.delta.text
          onChunk(event.delta.text)
        }
      } catch {
        /* ignore malformed SSE lines */
      }
    })
    return full
  },

  async complete(req: CompleteRequest, signal?: AbortSignal): Promise<string> {
    const res = await fetch(URL, {
      method: 'POST',
      signal: withTimeout(90_000, signal),
      headers: headers(req.apiKey),
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? 4096,
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }]
      })
    })
    await ensureOk(res, 'Anthropic')
    return textOf(await res.json())
  },

  async describeImage(req: VisionRequest, signal?: AbortSignal): Promise<string> {
    const res = await fetch(URL, {
      method: 'POST',
      signal: withTimeout(90_000, signal),
      headers: headers(req.apiKey),
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? 1024,
        system: req.system,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: req.mime, data: req.imageBase64 } },
              { type: 'text', text: req.prompt }
            ]
          }
        ]
      })
    })
    await ensureOk(res, 'Anthropic')
    return textOf(await res.json())
  }
}
