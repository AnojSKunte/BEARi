/**
 * Who is using BEARi.
 *
 *   npm run stats
 *
 * Two sources, both optional:
 *
 *  - GitHub (always available): how many times each release was downloaded,
 *    plus how many people looked at the repository in the last two weeks.
 *    Downloads are the honest floor - one download is at least one person who
 *    wanted her.
 *  - The usage endpoint (only if you set one up - see cloudflare-worker.js):
 *    how many copies are actually still being used, which versions are out
 *    there, and roughly where. Needs BEARI_STATS_KEY in the environment.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { findGh, gh, isLoggedIn, LOGIN_HELP } from './gh.mjs'

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
const publish = pkg.build?.publish?.[0]
const bar = (n, max, width = 24) => '█'.repeat(Math.max(n > 0 ? 1 : 0, Math.round((n / Math.max(1, max)) * width)))
const pad = (s, n) => String(s).padEnd(n)

console.log(`\nBEARi usage - ${new Date().toLocaleString()}\n${'='.repeat(52)}`)

// ---------------------------------------------------------------- GitHub
const bin = findGh()
if (!bin || !isLoggedIn(bin)) {
  console.log(`\n(i) GitHub numbers need the CLI logged in.\n${LOGIN_HELP}`)
} else if (!publish?.owner) {
  console.log('\n(i) No repository configured yet - run: npm run setup:github')
} else {
  const slug = `${publish.owner}/${publish.repo}`
  const releases = JSON.parse(gh(['api', `repos/${slug}/releases`, '--paginate'], { bin }))

  console.log(`\nDOWNLOADS  (${slug})`)
  if (!releases.length) console.log('  no releases yet')
  let grand = 0
  for (const r of releases) {
    const installer = r.assets.filter((a) => a.name.endsWith('.exe'))
    const portable = r.assets.filter((a) => a.name.endsWith('.zip'))
    const n = [...installer, ...portable].reduce((s, a) => s + a.download_count, 0)
    grand += n
    const when = new Date(r.published_at).toLocaleDateString()
    console.log(`  ${pad(r.tag_name, 10)} ${pad(when, 12)} ${String(n).padStart(5)} downloads`)
    for (const a of [...installer, ...portable]) {
      console.log(`      ${pad(a.name, 36)} ${String(a.download_count).padStart(5)}`)
    }
  }
  if (releases.length) console.log(`  ${pad('TOTAL', 23)} ${String(grand).padStart(5)} downloads`)

  try {
    const views = JSON.parse(gh(['api', `repos/${slug}/traffic/views`], { bin }))
    const clones = JSON.parse(gh(['api', `repos/${slug}/traffic/clones`], { bin }))
    console.log('\nREPOSITORY  (last 14 days)')
    console.log(`  page views        ${views.count} (${views.uniques} unique visitors)`)
    console.log(`  clones            ${clones.count} (${clones.uniques} unique)`)
  } catch {
    console.log('\n(i) Traffic needs push access to the repo - skipping.')
  }

  const repo = JSON.parse(gh(['api', `repos/${slug}`], { bin }))
  console.log(`  stars ${repo.stargazers_count} · watchers ${repo.subscribers_count} · forks ${repo.forks_count}`)
}

// ---------------------------------------------------------------- live usage
const endpoint = pkg.beari?.analyticsEndpoint
if (!endpoint) {
  console.log(
    '\nACTIVE USE\n  Not set up. Downloads tell you how many people took a copy;' +
      '\n  to see how many still use her, deploy scripts/cloudflare-worker.js' +
      '\n  and put its URL in package.json under "beari": { "analyticsEndpoint" }.' +
      '\n  Instructions are at the top of that file.\n'
  )
} else if (!process.env.BEARI_STATS_KEY) {
  console.log('\nACTIVE USE\n  Endpoint configured, but BEARI_STATS_KEY is not set:\n    $env:BEARI_STATS_KEY = "<the secret you chose>"\n')
} else {
  try {
    const url = new URL(endpoint)
    url.pathname = '/stats'
    url.searchParams.set('key', process.env.BEARI_STATS_KEY)
    const res = await fetch(url, { headers: { 'user-agent': 'beari-stats' } })
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`)
    const s = await res.json()
    console.log('\nACTIVE USE')
    console.log(`  copies ever seen    ${s.total}`)
    console.log(`  used in last 7 days ${s.active7}`)
    console.log(`  used in last 30 days ${s.active30}`)
    if (s.newThisWeek !== undefined) console.log(`  new this week       ${s.newThisWeek}`)

    const show = (title, obj) => {
      const entries = Object.entries(obj ?? {}).sort((a, b) => b[1] - a[1])
      if (!entries.length) return
      const max = entries[0][1]
      console.log(`\n  ${title}`)
      for (const [k, v] of entries.slice(0, 8)) console.log(`    ${pad(k, 14)} ${String(v).padStart(4)} ${bar(v, max)}`)
    }
    show('versions in use', s.versions)
    show('countries', s.countries)
    show('days used', s.usage)
    console.log()
  } catch (err) {
    console.log(`\nACTIVE USE\n  Could not reach the endpoint: ${err.message}\n`)
  }
}
