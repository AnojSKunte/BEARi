import type { AiProvider, ChatRequest, CompleteRequest, StreamHandlers, VisionRequest } from './provider'
import { ensureOk, readSse, withTimeout } from './provider'

const URL = 'https://api.openai.com/v1/chat/completions'

const headers = (apiKey: string): Record<string, string> => ({
  'content-type': 'application/json',
  authorization: `Bearer ${apiKey}`
})

function textOf(body: { choices?: { message?: { content?: string | null } }[] }): string {
  return body.choices?.[0]?.message?.content ?? ''
}

export const openaiProvider: AiProvider = {
  id: 'openai',

  async chat(req: ChatRequest, { onChunk, signal }: StreamHandlers): Promise<string> {
    const res = await fetch(URL, {
      method: 'POST',
      signal,
      headers: headers(req.apiKey),
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? 1024,
        messages: [{ role: 'system', content: req.system }, ...req.messages],
        stream: true
      })
    })
    await ensureOk(res, 'OpenAI')

    let full = ''
    await readSse(res, signal, (payload) => {
      try {
        const event = JSON.parse(payload)
        const delta: string | undefined = event.choices?.[0]?.delta?.content
        if (delta) {
          full += delta
          onChunk(delta)
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
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.prompt }
        ],
        ...(req.json ? { response_format: { type: 'json_object' } } : {})
      })
    })
    await ensureOk(res, 'OpenAI')
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
        messages: [
          { role: 'system', content: req.system },
          {
            role: 'user',
            content: [
              { type: 'text', text: req.prompt },
              { type: 'image_url', image_url: { url: `data:${req.mime};base64,${req.imageBase64}`, detail: 'low' } }
            ]
          }
        ],
        ...(req.json ? { response_format: { type: 'json_object' } } : {})
      })
    })
    await ensureOk(res, 'OpenAI')
    return textOf(await res.json())
  }
}
