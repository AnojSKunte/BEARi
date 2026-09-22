/**
 * Finding and using the GitHub CLI.
 *
 * `gh` is often installed without being on the current shell's PATH, so look
 * in the usual places too. Everything that needs credentials goes through
 * `gh`, which holds its own login - this project never stores, prints or asks
 * for a token.
 */
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

export function findGh() {
  const candidates = [
    'gh',
    join(process.env.ProgramFiles ?? 'C:/Program Files', 'GitHub CLI', 'gh.exe'),
    join(process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', 'GitHub CLI', 'gh.exe'),
    join(process.env.LOCALAPPDATA ?? '', 'GitHubCLI', 'gh.exe'),
    join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Links', 'gh.exe')
  ]
  for (const c of candidates) {
    if (c !== 'gh' && !existsSync(c)) continue
    try {
      execFileSync(c, ['--version'], { stdio: 'ignore' })
      return c
    } catch {
      /* try the next one */
    }
  }
  return null
}

export function gh(args, opts = {}) {
  const bin = opts.bin ?? findGh()
  if (!bin) throw new Error('GitHub CLI not found')
  return execFileSync(bin, args, { encoding: 'utf8', ...opts }).trim()
}

export function isLoggedIn(bin) {
  try {
    execFileSync(bin, ['auth', 'status'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * A token for tools that insist on one (electron-builder publish), taken from
 * gh's own login. It is passed straight into a child process environment and
 * never printed or written to disk.
 */
export function tokenEnv(bin) {
  if (process.env.GH_TOKEN) return { GH_TOKEN: process.env.GH_TOKEN }
  const token = execFileSync(bin, ['auth', 'token'], { encoding: 'utf8' }).trim()
  if (!token) throw new Error('gh has no token - run: gh auth login')
  return { GH_TOKEN: token }
}

export const LOGIN_HELP = [
  'You need to log the GitHub CLI in once (it opens your browser):',
  '',
  '    gh auth login --hostname github.com --git-protocol https --web',
  '',
  'Pick your account, and that is it - the login is remembered.'
].join('\n')
