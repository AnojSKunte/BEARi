/**
 * Assembles a portable, double-clickable BEARi.exe distributable without the
 * code-signing toolchain (which needs privileges unavailable in some
 * sandboxes). Copies the local Electron runtime, drops the built app into
 * resources/app, stamps her icon and version info onto the launcher when
 * rcedit is around, and repairs the PE checksum rcedit zeroes (Windows App
 * Control refuses a zero-checksum image). Output: release/BEARi-win32-x64/BEARi.exe
 *
 * Prereq: `npm run build` (electron-vite) has produced out/.
 * Usage: node scripts/pack-portable.mjs
 */
import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'fs'
import { resolve, join } from 'path'
import { execFileSync } from 'child_process'
import { tidyExecutable } from './strip-signature.mjs'

const ROOT = resolve('.')
const ELECTRON_DIST = resolve('node_modules/electron/dist')
const OUT = resolve('out')
const DEST = resolve('release/BEARi-win32-x64')
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'))

if (!existsSync(OUT)) {
  console.error('Missing out/. Run `npm run build` first.')
  process.exit(1)
}
if (!existsSync(ELECTRON_DIST)) {
  console.error('Missing node_modules/electron/dist.')
  process.exit(1)
}

console.log('Cleaning previous build…')
rmSync(DEST, { recursive: true, force: true })
mkdirSync(DEST, { recursive: true })

console.log('Copying Electron runtime…')
cpSync(ELECTRON_DIST, DEST, { recursive: true })

// Rename the launcher to the product name.
const launcher = resolve(DEST, 'BEARi.exe')
renameSync(resolve(DEST, 'electron.exe'), launcher)

// electron loads resources/app (folder) ahead of the bundled default_app.
const appDir = resolve(DEST, 'resources/app')
mkdirSync(appDir, { recursive: true })

console.log('Copying app (out/)…')
cpSync(OUT, resolve(appDir, 'out'), { recursive: true })

// Minimal runtime manifest — main + product identity only.
writeFileSync(
  resolve(appDir, 'package.json'),
  JSON.stringify(
    { name: pkg.name, productName: pkg.productName, version: pkg.version, main: 'out/main/index.js' },
    null,
    2
  )
)

// Tidy licenses that don't apply to the distributable.
rmSync(resolve(DEST, 'resources/default_app.asar'), { force: true })

// Her icon and version info on the launcher, when electron-builder's rcedit is cached locally.
const rcedit = findRcedit()
const ico = resolve('release/.icon-ico/icon.ico')
if (rcedit && existsSync(ico)) {
  console.log('Stamping icon and version info…')
  execFileSync(rcedit, [
    launcher,
    '--set-icon', ico,
    '--set-version-string', 'ProductName', pkg.productName,
    '--set-version-string', 'FileDescription', `${pkg.productName} - your desktop AI companion`,
    '--set-version-string', 'CompanyName', pkg.author ?? '',
    '--set-version-string', 'LegalCopyright', pkg.build?.copyright ?? '',
    '--set-version-string', 'OriginalFilename', 'BEARi.exe',
    '--set-file-version', pkg.version,
    '--set-product-version', pkg.version
  ])
} else {
  console.log('(i) rcedit not found - launcher keeps the stock Electron icon (run `npm run dist` once to cache it)')
}
const r = tidyExecutable(launcher)
console.log(`Fixed PE checksum ${r.old.toString(16)} -> ${r.checksum.toString(16)}`)

console.log(`\n✓ Portable build ready: ${launcher}`)
console.log('  Double-click BEARi.exe to run. Zip the folder to share.')

function findRcedit() {
  const cache = join(process.env.LOCALAPPDATA ?? '', 'electron-builder', 'Cache', 'winCodeSign')
  if (!existsSync(cache)) return null
  for (const d of readdirSync(cache)) {
    const p = join(cache, d, 'rcedit-x64.exe')
    if (existsSync(p)) return p
  }
  return null
}
