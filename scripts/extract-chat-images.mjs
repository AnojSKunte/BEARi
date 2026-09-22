/**
 * Extracts every user-pasted image from a Claude Code session transcript
 * (.jsonl) and writes them as PNG/JPEG files at original quality.
 *
 * Usage: node scripts/extract-chat-images.mjs <transcript.jsonl> <outDir>
 */
import { createReadStream, mkdirSync, writeFileSync } from 'fs'
import { createInterface } from 'readline'
import { join } from 'path'

const [, , transcript, outDir] = process.argv
if (!transcript || !outDir) {
  console.error('Usage: node extract-chat-images.mjs <transcript.jsonl> <outDir>')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })

const seen = new Set()
let count = 0

function walk(node, cb) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) walk(item, cb)
    return
  }
  cb(node)
  for (const value of Object.values(node)) walk(value, cb)
}

const rl = createInterface({ input: createReadStream(transcript, 'utf-8') })
let lineNo = 0
for await (const line of rl) {
  lineNo++
  if (!line.includes('"base64"')) continue
  let obj
  try {
    obj = JSON.parse(line)
  } catch {
    continue
  }
  walk(obj, (node) => {
    const src = node.source
    if (node.type === 'image' && src?.type === 'base64' && typeof src.data === 'string' && src.data.length > 5000) {
      // Dedupe identical images by a cheap signature.
      const sig = src.data.length + ':' + src.data.slice(0, 64) + src.data.slice(-64)
      if (seen.has(sig)) return
      seen.add(sig)
      count++
      const ext = (src.media_type ?? 'image/png').includes('jpeg') ? 'jpg' : 'png'
      const file = join(outDir, `chat-image-${String(count).padStart(2, '0')}-line${lineNo}.${ext}`)
      writeFileSync(file, Buffer.from(src.data, 'base64'))
      console.log(`${file}  (${Math.round(src.data.length * 0.75 / 1024)} KB, ${src.media_type})`)
    }
  })
}
console.log(`\nextracted ${count} unique images`)
