/**
 * The whole usage endpoint for BEARi, in one file. Free to run.
 *
 * WHAT IT DOES
 *   POST /        a copy of BEARi says hello once a day. One row per install
 *                 is kept: when it was first and last seen, which version, the
 *                 OS, the language, days used, and the country Cloudflare
 *                 already knows from the connection. Nothing else is stored -
 *                 no IP address, no names, no content.
 *   GET  /stats?key=SECRET   the summary `npm run stats` prints.
 *
 * SETTING IT UP  (about five minutes, no card needed)
 *   1. Make a free account at https://dash.cloudflare.com
 *   2. Workers & Pages -> Create -> Worker -> name it "beari-usage" -> Deploy
 *   3. Edit code -> paste this whole file over what is there -> Deploy
 *   4. Storage & Databases -> KV -> Create namespace "beari"
 *      Back in the worker: Settings -> Bindings -> Add -> KV namespace
 *      Variable name: BEARI      Namespace: beari
 *   5. Settings -> Variables -> Add -> STATS_KEY = a long random password,
 *      and tick "Encrypt"
 *   6. Copy the worker URL (https://beari-usage.<you>.workers.dev) into
 *      package.json:   "beari": { "analyticsEndpoint": "https://..." }
 *   7. Release a new version so copies out there pick it up:
 *        npm run release -- minor --notes "..."
 *   8. Read it any time:
 *        $env:BEARI_STATS_KEY = "<the same password>"
 *        npm run stats
 *
 * Until step 6 the app never contacts anything - the endpoint is baked in at
 * build time and an empty one disables the whole feature.
 */

const DAY = 86400000

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'POST' && url.pathname === '/') return hello(request, env)
    if (request.method === 'GET' && url.pathname === '/stats') return stats(url, env)
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors() })
    return new Response('BEARi usage endpoint', { status: 200, headers: cors() })
  }
}

async function hello(request, env) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad json' }, 400)
  }

  // Only accept the exact shape the app sends, and cap every field.
  const id = str(body.installId, 64)
  if (!id || !/^[0-9a-f-]{16,64}$/i.test(id)) return json({ error: 'bad installId' }, 400)

  const now = new Date().toISOString()
  const key = `install:${id}`
  const prev = (await env.BEARI.get(key, 'json')) ?? {}

  const row = {
    firstSeen: prev.firstSeen ?? str(body.firstSeen, 32) ?? now,
    lastSeen: now,
    version: str(body.version, 20) ?? '?',
    os: str(body.os, 32) ?? '?',
    platform: str(body.platform, 16) ?? '?',
    locale: str(body.locale, 16) ?? '?',
    daysUsed: Math.max(0, Math.min(100000, Number(body.daysUsed) || 0)),
    country: request.cf?.country ?? '??'
  }
  // Rows expire a year after the last hello, so nothing lingers forever.
  await env.BEARI.put(key, JSON.stringify(row), { expirationTtl: 365 * 24 * 60 * 60 })
  return json({ ok: true })
}

async function stats(url, env) {
  if (!env.STATS_KEY || url.searchParams.get('key') !== env.STATS_KEY) {
    return json({ error: 'nope' }, 401)
  }

  const out = {
    total: 0,
    active7: 0,
    active30: 0,
    newThisWeek: 0,
    versions: {},
    countries: {},
    usage: {},
    generatedAt: new Date().toISOString()
  }
  const now = Date.now()
  let cursor
  do {
    const page = await env.BEARI.list({ prefix: 'install:', cursor, limit: 1000 })
    cursor = page.list_complete ? undefined : page.cursor
    for (const k of page.keys) {
      const row = await env.BEARI.get(k.name, 'json')
      if (!row) continue
      out.total++
      const last = Date.parse(row.lastSeen) || 0
      const first = Date.parse(row.firstSeen) || 0
      if (now - last < 7 * DAY) out.active7++
      if (now - last < 30 * DAY) out.active30++
      if (now - first < 7 * DAY) out.newThisWeek++
      bump(out.versions, row.version)
      bump(out.countries, row.country)
      bump(out.usage, bucket(row.daysUsed))
    }
  } while (cursor)

  return json(out)
}

const bump = (o, k) => {
  const key = k || '?'
  o[key] = (o[key] ?? 0) + 1
}

const bucket = (d) => (d <= 1 ? '1 day' : d <= 3 ? '2-3 days' : d <= 7 ? '4-7 days' : d <= 30 ? '1-4 weeks' : 'over a month')

const str = (v, max) => (typeof v === 'string' && v.length ? v.slice(0, max) : null)

const cors = () => ({
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type'
})

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json', ...cors() }
  })
