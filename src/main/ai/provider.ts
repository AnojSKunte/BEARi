import type { ChatMessage } from '@shared/types'

export interface StreamHandlers {
  onChunk: (text: string) => void
  signal: AbortSignal
}

export interface ChatRequest {
  system: string
  messages: ChatMessage[]
  apiKey: string
  model: string
  maxTokens?: number
}

/** One-shot, non-streaming completion - what her background thinking uses. */
export interface CompleteRequest {
  system: string
  prompt: string
  apiKey: string
  model: string
  maxTokens?: number
  /** Ask the provider for a JSON object (where the API supports forcing it). */
  json?: boolean
}

/** A look at one image - how she sees the screen. */
export interface VisionRequest extends CompleteRequest {
  imageBase64: string
  mime: 'image/jpeg' | 'image/png'
}

/** Every AI provider implements exactly this. */
export interface AiProvider {
  readonly id: string
  /** Stream a completion; resolves with the full text when finished. */
  chat(req: ChatRequest, handlers: StreamHandlers): Promise<string>
  /** Plain completion, returned whole. */
  complete(req: CompleteRequest, signal?: AbortSignal): Promise<string>
  /** Describe an image, returned whole. */
  describeImage(req: VisionRequest, signal?: AbortSignal): Promise<string>
}

/** Read an SSE body line by line, invoking cb for each `data:` payload. */
export async function readSse(
  res: Response,
  signal: AbortSignal,
  onData: (payload: string) => void
): Promise<void> {
  if (!res.body) throw new Error('Response has no body')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (signal.aborted) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload && payload !== '[DONE]') onData(payload)
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export async function ensureOk(res: Response, provider: string): Promise<void> {
  if (res.ok) return
  let detail = ''
  try {
    detail = (await res.text()).slice(0, 500)
  } catch {
    /* body unavailable */
  }
  throw new Error(`${provider} request failed (${res.status}): ${detail}`)
}

/** A timeout signal merged with an optional caller signal. */
export function withTimeout(ms: number, outer?: AbortSignal): AbortSignal {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(new Error('timed out')), ms)
  outer?.addEventListener('abort', () => ctrl.abort(outer.reason), { once: true })
  ctrl.signal.addEventListener('abort', () => clearTimeout(t), { once: true })
  return ctrl.signal
}
