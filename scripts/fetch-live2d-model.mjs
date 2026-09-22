/**
 * Downloads a complete Live2D Cubism 4 model (all files referenced by its
 * .model3.json) into a local folder — moc3, textures, physics, pose,
 * motions, expressions, display info. Reusable for the sample model now and
 * BEARi's own rigged model later.
 *
 * Usage:
 *   node scripts/fetch-live2d-model.mjs <baseUrl> <model3.json name> <outDir>
 * Example:
 *   node scripts/fetch-live2d-model.mjs \
 *     https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/haru \
 *     haru_greeter_t03.model3.json \
 *     src/renderer/public/live2d/models/sample
 */
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

const [, , baseUrl, modelName, outDir] = process.argv
if (!baseUrl || !modelName || !outDir) {
  console.error('Usage: node fetch-live2d-model.mjs <baseUrl> <model3.json> <outDir>')
  process.exit(1)
}

async function fetchBuf(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

const REF_RE = /\.(moc3|png|json|physics3\.json|motion3\.json|exp3\.json|cdi3\.json|wav|mtn)$/i

function collectRefs(node, out) {
  if (typeof node === 'string') {
    if (REF_RE.test(node)) out.add(node)
    return
  }
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const v of node) collectRefs(v, out)
    return
  }
  for (const v of Object.values(node)) collectRefs(v, out)
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  const modelUrl = `${baseUrl}/${modelName}`
  console.log(`model3: ${modelUrl}`)
  const modelBuf = await fetchBuf(modelUrl)
  writeFileSync(join(outDir, modelName), modelBuf)

  const model = JSON.parse(modelBuf.toString('utf-8'))
  const refs = new Set()
  collectRefs(model.FileReferences ?? model, refs)

  console.log(`referenced files: ${refs.size}`)
  let ok = 0
  for (const rel of refs) {
    const clean = rel.replace(/^\.?\//, '')
    try {
      const buf = await fetchBuf(`${baseUrl}/${clean}`)
      const dest = join(outDir, clean)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, buf)
      ok++
      console.log(`  ✓ ${clean} (${Math.round(buf.length / 1024)} KB)`)
    } catch (e) {
      console.warn(`  ✗ ${clean} — ${e.message}`)
    }
  }
  console.log(`\ndone: ${ok}/${refs.size} files into ${outDir}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
