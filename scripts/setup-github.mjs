/**
 * One-time: point BEARi's releases at a GitHub repository.
 *
 * Creates the repository if it does not exist, records it in package.json
 * (electron-builder bakes it into the app as app-update.yml, which is how
 * every installed copy knows where to look for updates), wires up the `origin`
 * remote and pushes.
 *
 *   npm run setup:github                 repo named after the app, public
 *   npm run setup:github -- --name beari-app
 *   npm run setup:github -- --private    only you can install updates
 *
 * Needs the GitHub CLI logged in: gh auth login
 */
import { execFileSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { findGh, gh, isLoggedIn, LOGIN_HELP } from './gh.mjs'

const args = process.argv.slice(2)
const flag = (n) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : undefined
}
const PKG = resolve('package.json')
const pkg = JSON.parse(readFileSync(PKG, 'utf8'))
const name = flag('--name') ?? pkg.name
const isPrivate = args.includes('--private')

const bin = findGh()
if (!bin) {
  console.error('\n✖ GitHub CLI (gh) is not installed.\n  Get it from https://cli.github.com, then run this again.\n')
  process.exit(1)
}
if (!isLoggedIn(bin)) {
  console.error(`\n✖ ${LOGIN_HELP}\n`)
  process.exit(1)
}

const owner = gh(['api', 'user', '--jq', '.login'], { bin })
const slug = `${owner}/${name}`
console.log(`GitHub account: ${owner}`)

// ---- the repository
let exists = true
try {
  gh(['repo', 'view', slug, '--json', 'name'], { bin, stdio: ['ignore', 'pipe', 'ignore'] })
} catch {
  exists = false
}
if (exists) {
  console.log(`✓ repository ${slug} already exists`)
} else {
  console.log(`Creating ${isPrivate ? 'private' : 'public'} repository ${slug}…`)
  gh(['repo', 'create', slug, isPrivate ? '--private' : '--public', '--description', pkg.description ?? 'BEARi'], {
    bin,
    stdio: ['ignore', 'pipe', 'inherit']
  })
  console.log(`✓ created https://github.com/${slug}`)
}
if (isPrivate) {
  console.log('(!) A private repository means only you can download updates - other people\'s copies cannot.')
}

// ---- record it where the app and the builder will read it
pkg.repository = { type: 'git', url: `https://github.com/${slug}.git` }
pkg.build.publish = [{ provider: 'github', owner, repo: name, releaseType: 'release' }]
writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n')
console.log('✓ package.json now points releases at this repository')

// ---- remote + push
// stdio:'inherit' makes execFileSync return null for stdout, so guard the trim.
const git = (a, opts = {}) => (execFileSync('git', a, { encoding: 'utf8', ...opts }) ?? '').trim()
const remotes = git(['remote']).split('\n').filter(Boolean)
const url = `https://github.com/${slug}.git`
if (remotes.includes('origin')) {
  git(['remote', 'set-url', 'origin', url])
} else {
  git(['remote', 'add', 'origin', url])
}
console.log(`✓ origin -> ${url}`)

if (git(['status', '--porcelain'])) {
  git(['add', '-A'])
  git(['commit', '-m', 'point releases at GitHub'], { stdio: 'inherit' })
}
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
console.log(`Pushing ${branch}…`)
execFileSync('git', ['push', '-u', 'origin', branch], { stdio: 'inherit' })

console.log(`\n✓ Ready. Publish a release with:\n    npm run release -- current      (publishes ${pkg.version} as it is)\n    npm run release                 (bumps the patch version first)\n`)
