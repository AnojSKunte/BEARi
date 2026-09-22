import { useEffect, useMemo, useRef } from 'react'
import type { JSX } from 'react'
import { marked } from 'marked'

marked.setOptions({ breaks: true, gfm: true })

/** Minimal HTML sanitizer: strips scripts/handlers from marked output. */
function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, iframe, object, embed').forEach((el) => el.remove())
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || (name === 'href' && attr.value.trim().startsWith('javascript:'))) {
        el.removeAttribute(attr.name)
      }
    }
  }
  return doc.body.innerHTML
}

export interface BubbleProps {
  x: number
  /** px above the window floor — tracks her on-screen height. */
  bottom: number
  stageWidth: number
  text: string
  phase: 'idle' | 'thinking' | 'streaming'
  onSend: (text: string) => void
  onClose: () => void
  onInteractive: (v: boolean) => void
}

/** BEARi's speech bubble — markdown-capable, anchored above her head. */
export function Bubble(props: BubbleProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const width = 340
  const left = Math.max(10, Math.min(props.x - width / 2, props.stageWidth - width - 10))
  const tailLeft = Math.max(24, Math.min(props.x - left, width - 24))

  const html = useMemo(
    () => (props.text ? sanitize(marked.parse(props.text, { async: false })) : ''),
    [props.text]
  )

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight })
  }, [html])

  const submit = (): void => {
    const value = inputRef.current?.value.trim()
    if (!value || props.phase !== 'idle') return
    inputRef.current!.value = ''
    props.onSend(value)
  }

  return (
    <div
      className="bubble"
      style={{ left, width, bottom: props.bottom }}
      onMouseEnter={() => props.onInteractive(true)}
      onMouseLeave={() => props.onInteractive(false)}
    >
      <button className="bubble-close" onClick={props.onClose} title="Close">
        ×
      </button>

      {props.phase === 'thinking' && (
        <div className="bubble-thinking">
          <span />
          <span />
          <span />
        </div>
      )}

      {html && (
        <div ref={bodyRef} className="bubble-body markdown" dangerouslySetInnerHTML={{ __html: html }} />
      )}
      {!html && props.phase === 'idle' && <div className="bubble-hint">Say hi to BEARi…</div>}

      <div className="bubble-input-row">
        <input
          ref={inputRef}
          className="bubble-input"
          placeholder="Talk to me…"
          spellCheck={false}
          disabled={props.phase !== 'idle'}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') props.onClose()
          }}
        />
        <button className="bubble-send" onClick={submit} disabled={props.phase !== 'idle'} title="Send">
          ➤
        </button>
      </div>

      <div className="bubble-tail" style={{ left: tailLeft }} />
    </div>
  )
}
