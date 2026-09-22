import type { AiProvider, ChatRequest, CompleteRequest, StreamHandlers, VisionRequest } from './provider'
import { ensureOk, readSse, withTimeout } from './provider'

const base = (model: string): string =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`

const headers = (apiKey: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-goog-api-key': apiKey
})

function textOf(body: { candidates?: { content?: { parts?: { text?: string }[] } }[] }): string {
  return (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
}

export const geminiProvider: AiProvider = {
  id: 'gemini',

  async chat(req: ChatRequest, { onChunk, signal }: StreamHandlers): Promise<string> {
    const res = await fetch(`${base(req.model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      signal,
      headers: headers(req.apiKey),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: req.messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        })),
        generationConfig: { maxOutputTokens: req.maxTokens ?? 1024 }
      })
    })
    await ensureOk(res, 'Gemini')

    let full = ''
    await readSse(res, signal, (payload) => {
      try {
        const event = JSON.parse(payload)
        const delta: string | undefined = event.candidates?.[0]?.content?.parts?.[0]?.text
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
    const res = await fetch(`${base(req.model)}:generateContent`, {
      method: 'POST',
      signal: withTimeout(90_000, signal),
      headers: headers(req.apiKey),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
        generationConfig: {
          maxOutputTokens: req.maxTokens ?? 4096,
          ...(req.json ? { responseMimeType: 'application/json' } : {})
        }
      })
    })
    await ensureOk(res, 'Gemini')
    return textOf(await res.json())
  },

  async describeImage(req: VisionRequest, signal?: AbortSignal): Promise<string> {
    const res = await fetch(`${base(req.model)}:generateContent`, {
      method: 'POST',
      signal: withTimeout(90_000, signal),
      headers: headers(req.apiKey),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [
          {
            role: 'user',
            parts: [{ inlineData: { mimeType: req.mime, data: req.imageBase64 } }, { text: req.prompt }]
          }
        ],
        generationConfig: {
          maxOutputTokens: req.maxTokens ?? 1024,
          ...(req.json ? { responseMimeType: 'application/json' } : {})
        }
      })
    })
    await ensureOk(res, 'Gemini')
    return textOf(await res.json())
  }
}
