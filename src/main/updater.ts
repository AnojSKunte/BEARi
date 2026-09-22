import { app } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import type { UpdateInfo } from 'electron-updater'
import type { AppSettings, UpdateState } from '@shared/types'

/**
 * In-app updates from GitHub Releases. Every `npm run release` publishes an
 * installer plus `latest.yml`; the installed app compares versions on launch
 * and every few hours, and the dashboard shows an Update button when there is
 * one. Downloads only happen when the user asks; installing restarts her.
 */
export class Updater {
  state: UpdateState = {
    phase: 'idle',
    currentVersion: app.getVersion(),
    latestVersion: null,
    releaseNotes: null,
    releaseDate: null,
    percent: 0,
    message: null,
    checkedAt: null
  }
  private timer: NodeJS.Timeout | null = null
  private wired = false

  constructor(
    private getSettings: () => AppSettings,
    private emit: (state: UpdateState) => void
  ) {}

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    this.emit(this.state)
  }

  /** Portable folders, dev runs and builds made before a repository was set have nothing to update against. */
  private supported(): boolean {
    if (!app.isPackaged) {
      this.set({ phase: 'unsupported', message: 'Updates only work in the installed app.' })
      return false
    }
    try {
      const cfg = readFileSync(join(process.resourcesPath, 'app-update.yml'), 'utf8')
      if (/YOUR_GITHUB_USERNAME/.test(cfg)) {
        this.set({ phase: 'unsupported', message: 'This build was made before a release channel was set up.' })
        return false
      }
    } catch {
      this.set({ phase: 'unsupported', message: 'This copy was not built with update support (portable build).' })
      return false
    }
    return true
  }

  private wire(): void {
    if (this.wired) return
    this.wired = true
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = null
    autoUpdater.on('checking-for-update', () => this.set({ phase: 'checking', message: null }))
    autoUpdater.on('update-available', (info: UpdateInfo) =>
      this.set({
        phase: 'available',
        latestVersion: info.version,
        releaseNotes: notesOf(info),
        releaseDate: info.releaseDate ?? null,
        percent: 0,
        message: null,
        checkedAt: new Date().toISOString()
      })
    )
    autoUpdater.on('update-not-available', (info: UpdateInfo) =>
      this.set({ phase: 'up-to-date', latestVersion: info.version, message: null, checkedAt: new Date().toISOString() })
    )
    autoUpdater.on('download-progress', (p) => this.set({ phase: 'downloading', percent: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', (info: UpdateInfo) =>
      this.set({ phase: 'downloaded', latestVersion: info.version, percent: 100, message: null })
    )
    autoUpdater.on('error', (err) => {
      const text = err?.message ?? String(err)
      // A missing app-update.yml means this copy was never built for updates.
      const phase = /app-update\.yml|ENOENT/i.test(text) ? 'unsupported' : 'error'
      this.set({ phase, message: friendly(text), checkedAt: new Date().toISOString() })
    })
  }

  start(): void {
    if (!this.supported()) return
    this.wire()
    if (this.getSettings().autoCheckUpdates) {
      setTimeout(() => this.check(false), 20_000)
      this.timer = setInterval(() => {
        if (this.getSettings().autoCheckUpdates) this.check(false)
      }, 6 * 60 * 60 * 1000)
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async check(manual: boolean): Promise<UpdateState> {
    if (!this.supported()) return this.state
    this.wire()
    if (this.state.phase === 'downloading' || this.state.phase === 'downloaded') return this.state
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      if (manual) this.set({ phase: 'error', message: friendly(err instanceof Error ? err.message : String(err)) })
    }
    return this.state
  }

  async download(): Promise<UpdateState> {
    if (!this.supported()) return this.state
    if (this.state.phase !== 'available') return this.state
    this.set({ phase: 'downloading', percent: 0 })
    try {
      await autoUpdater.downloadUpdate()
    } catch (err) {
      this.set({ phase: 'error', message: friendly(err instanceof Error ? err.message : String(err)) })
    }
    return this.state
  }

  install(): void {
    if (this.state.phase !== 'downloaded') return
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
  }
}

function notesOf(info: UpdateInfo): string | null {
  const n = info.releaseNotes
  if (!n) return null
  if (typeof n === 'string') return n
  return n.map((r) => (typeof r === 'string' ? r : `${r.version}\n${r.note ?? ''}`)).join('\n\n')
}

function friendly(text: string): string {
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR|fetch failed/i.test(text)) return 'Could not reach GitHub - check your connection.'
  if (/404|Not Found/i.test(text)) return 'No releases published yet.'
  if (/app-update\.yml|ENOENT/i.test(text)) return 'This copy was not built with update support (portable build).'
  return text.split('\n')[0].slice(0, 200)
}
