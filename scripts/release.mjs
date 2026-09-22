/**
 * Cut a BEARi release: bump the version, build the installer, publish it to
 * GitHub Releases (where installed copies look for updates), tag the commit.
 *
 *   npm run release                      patch  1.0.0 -> 1.0.1
 *   npm run release -- minor             1.0.1 -> 1.1.0
 *   npm run release -- major             1.1.0 -> 2.0.0
 *   npm run release -- 1.4.2             exact version
 *   npm run release -- patch --notes "Smoother walk, screen awareness"
 *   npm run release -- --dry             build everything, publish nothing
 *
 * First time only:
 *   npm run release -- --repo YOURNAME/beari
 * which records the GitHub repository in package.json (electron-builder bakes
 * it into the app as app-update.yml, so every installed copy knows where to
 * look). The repository must exist on GitHub and be PUBLIC for other people's
 * copies to update; create it empty, that is enough.
 *
 * Needs GH_TOKEN in the environment: a GitHub personal access token with the
 * "repo" scope (Settings -> Developer settings -> Tokens). It is only used on
 * this machine to upload the release; it never ships with the app.
 */
import { execSync, spawnSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve('.')
const PKG = resolve(ROOT, 'package.json')
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const has = (name) => args.includes(name)
const bump = args.find((a) => !a.startsWith('--') && a !== flag('--repo') && a !== flag('--notes')) ?? 'patch'
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
const repoArg = flag('--repo')
if (repoArg) {
  const m = /^([\w.-]+)\/([\w.-]+)$/.exec(repoArg)
  if (!m) fail(`--repo must look like owner/name, got "${repoArg}"`)
  pkg.repository = { type: 'git', url: `https://github.com/${m[1]}/${m[2]}.git` }
  pkg.build.publish = [{ provider: 'github', owner: m[1], repo: m[2], releaseType: 'release' }]
  writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`✓ releases will be published to github.com/${m[1]}/${m[2]}`)
}
const publish = pkg.build?.publish?.[0]
if (!publish || !publish.owner || publish.owner === 'YOUR_GITHUB_USERNAME') {
  fail('No GitHub repository configured yet. Run once:\n   npm run release -- --repo YOURNAME/beari')
}
if (!dry && !process.env.GH_TOKEN) {
  fail(
    'GH_TOKEN is not set. Create a GitHub token with the "repo" scope, then in PowerShell:\n' +
      '   $env:GH_TOKEN = "ghp_..."\n   npm run release'
  )
}

// ---- 2. version
const prev = pkg.version
run(`npm version ${bump} --no-git-tag-version`)
const next = JSON.parse(readFileSync(PKG, 'utf8')).version
console.log(`\n✓ version ${prev} -> ${next}`)

// ---- 3. notes
const notes = flag('--notes') ?? `BEARi ${next}`
writeFileSync(resolve(ROOT, 'release', 'RELEASE_NOTES.md'), `# BEARi ${next}\n\n${notes}\n`)

// ---- 4. build + publish
run('npm run build')
const publishMode = dry ? 'never' : 'always'
run(`npx electron-builder --win --publish ${publishMode} -c.releaseInfo.releaseNotes="${notes.replace(/"/g, '\\"')}"`)

// ---- 5. tag, when this is a git checkout with an identity
const isGit = existsSync(resolve(ROOT, '.git'))
const identity = isGit && spawnSync('git', ['config', 'user.email'], { encoding: 'utf8' }).stdout.trim()
if (isGit && identity && !dry) {
  run('git add package.json package-lock.json')
  run(`git commit -m "release v${next}"`)
  run(`git tag v${next}`)
  console.log(`\n✓ committed and tagged v${next} - push with: git push && git push --tags`)
} else if (!isGit) {
  console.log('\n(i) Not a git checkout - the release was published without a tag. To keep history:')
  console.log(`    git init && git add -A && git commit -m "v${next}" && git remote add origin https://github.com/${publish.owner}/${publish.repo}.git && git push -u origin HEAD --tags`)
}

console.log(
  dry
    ? `\n✓ dry run complete - installer in release/, nothing published`
    : `\n✓ BEARi ${next} published: https://github.com/${publish.owner}/${publish.repo}/releases/tag/v${next}\n  Installed copies will offer the update within a few hours (or immediately via "Check now").`
)
