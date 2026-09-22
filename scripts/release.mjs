/**
 * Cut a BEARi release: bump the version, build the installer, publish it to
 * GitHub Releases (where installed copies look for updates), tag the commit.
 *
 *   npm run release                      patch  1.0.0 -> 1.0.1
 *   npm run release -- minor             1.0.1 -> 1.1.0
 *   npm run release -- major             1.1.0 -> 2.0.0
 *   npm run release -- 1.4.2             exact version
 *   npm run release -- current           publish the version as it stands
 *   npm run release -- patch --notes "Smoother walk, screen awareness"
 *   npm run release -- --dry             build everything, publish nothing
 *
 * Set the repository up once with `npm run setup:github`.
 *
 * Credentials come from the GitHub CLI's own login (`gh auth login`) - nothing
 * is stored here and no token is ever printed. GH_TOKEN is honoured if set.
 */
import { execSync, execFileSync, spawnSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { findGh, isLoggedIn, tokenEnv, LOGIN_HELP } from './gh.mjs'

const ROOT = resolve('.')
const PKG = resolve(ROOT, 'package.json')
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const has = (name) => args.includes(name)
const positional = args.filter((a) => !a.startsWith('--') && a !== flag('--notes'))
const bump = positional[0] ?? 'patch'
const dry = has('--dry')

const pkg = JSON.parse(readFileSync(PKG, 'utf8'))
const fail = (msg) => {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}
const run = (cmd, env = {}) => {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } })
}

// ---- 1. where releases live
const publish = pkg.build?.publish?.[0]
if (!publish || !publish.owner || publish.owner === 'YOUR_GITHUB_USERNAME') {
  fail('No GitHub repository configured yet. Run once:\n     npm run setup:github')
}

// ---- 2. credentials, via the GitHub CLI's own login
let env = {}
if (!dry) {
  const bin = findGh()
  if (!bin && !process.env.GH_TOKEN) {
    fail('GitHub CLI not found and GH_TOKEN is not set.\n  Install https://cli.github.com then run: gh auth login')
  }
  if (bin && !isLoggedIn(bin) && !process.env.GH_TOKEN) fail(LOGIN_HELP)
  env = bin ? tokenEnv(bin) : { GH_TOKEN: process.env.GH_TOKEN }
}

// ---- 3. version
const prev = pkg.version
if (bump === 'current') {
  console.log(`\n✓ publishing version ${prev} as it stands`)
} else {
  run(`npm version ${bump} --no-git-tag-version`)
  console.log(`\n✓ version ${prev} -> ${JSON.parse(readFileSync(PKG, 'utf8')).version}`)
}
const next = JSON.parse(readFileSync(PKG, 'utf8')).version

// ---- 4. notes
const notes = flag('--notes') ?? `BEARi ${next}`
mkdirSync(resolve(ROOT, 'release'), { recursive: true })
writeFileSync(resolve(ROOT, 'release', 'RELEASE_NOTES.md'), `# BEARi ${next}\n\n${notes}\n`)

// ---- 5. build + publish
run('npm run build')
run(
  `npx electron-builder --win --publish ${dry ? 'never' : 'always'} -c.releaseInfo.releaseNotes="${notes.replace(/"/g, '\\"')}"`,
  env
)

// ---- 6. tag, when this is a git checkout with an identity
const isGit = existsSync(resolve(ROOT, '.git'))
const identity = isGit && spawnSync('git', ['config', 'user.email'], { encoding: 'utf8' }).stdout.trim()
if (isGit && identity && !dry) {
  const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
  if (dirty) {
    run('git add -A')
    run(`git commit -m "release v${next}"`)
  }
  const tags = execFileSync('git', ['tag', '--list', `v${next}`], { encoding: 'utf8' }).trim()
  if (!tags) run(`git tag v${next}`)
  try {
    run('git push --follow-tags')
  } catch {
    console.log('(i) Could not push - the release itself is published. Push when you can: git push --follow-tags')
  }
}

console.log(
  dry
    ? `\n✓ dry run complete - installer in release/, nothing published`
    : `\n✓ BEARi ${next} published: https://github.com/${publish.owner}/${publish.repo}/releases/tag/v${next}\n` +
      `  Installed copies offer the update within a few hours, or immediately via Dashboard -> About -> Check now.`
)
