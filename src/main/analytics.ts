import { app } from 'electron'
import { randomUUID } from 'crypto'
import { release } from 'os'
import type { AppSettings } from '@shared/types'
import { JsonStore } from './store'

/**
 * A once-a-day hello, so the person who made BEARi knows roughly how many
 * people are using her and which versions are out there.
 *
 * What is sent: a random id generated on this machine, the app version, the
 * Windows version, the display language, and how many days this copy has been
 * used. That is the whole payload - it is printed verbatim in Settings.
 *
 * What is never sent: anything she remembers, anything you type, anything she
 * sees on screen, your name, your API keys, your files, your IP beyond the
 * ordinary fact of making a request.
 *
 * It is off entirely unless a collection endpoint was configured at build
 * time, and any user can switch it off in Settings.
 */

/** Baked in at build time from package.json -> beari.analyticsEndpoint. */
declare const __ANALYTICS_URL__: string
const ENDPOINT = typeof __ANALYTICS_URL__ === 'string' ? __ANALYTICS_URL__ : ''

interface AnalyticsState {
  installId: string
  firstSeen: string
  lastSent: string
  daysUsed: number
  lastDay: string
}

export interface AnalyticsPayload {
  installId: string
  version: string
  platform: string
  os: string
  locale: string
  firstSeen: string
  daysUsed: number
}

const DAY = 24 * 60 * 60 * 1000

export class Analytics {
  private store = new JsonStore<AnalyticsState>('analytics', {
    installId: '',
    firstSeen: '',
    lastSent: '',
    daysUsed: 0,
    lastDay: ''
  })
  private timer: NodeJS.Timeout | null = null

  constructor(private getSettings: () => AppSettings) {
    const s = this.store.get()
    if (!s.installId) {
      this.store.update({ installId: randomUUID(), firstSeen: new Date().toISOString() })
    }
  }

  /** True when this build was made with a collection endpoint. */
  get configured(): boolean {
    return !!ENDPOINT
  }

  /** Exactly what would be sent - shown to the user in Settings. */
  payload(): AnalyticsPayload {
    const s = this.store.get()
    return {
      installId: s.installId,
      version: app.getVersion(),
      platform: process.platform,
      os: release(),
      locale: app.getLocale(),
      firstSeen: s.firstSeen,
      daysUsed: s.daysUsed
    }
  }

  start(): void {
    if (!this.configured || this.timer) return
    this.countToday()
    setTimeout(() => void this.maybeSend(), 60_000)
    this.timer = setInterval(() => void this.maybeSend(), 6 * 60 * 60 * 1000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private countToday(): void {
    const today = new Date().toISOString().slice(0, 10)
    const s = this.store.get()
    if (s.lastDay !== today) this.store.update({ lastDay: today, daysUsed: s.daysUsed + 1 })
  }

  private async maybeSend(): Promise<void> {
    if (!this.configured || !this.getSettings().shareUsage) return
    const s = this.store.get()
    if (s.lastSent && Date.now() - new Date(s.lastSent).getTime() < DAY) return
    this.countToday()
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 8000)
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(this.payload())
      })
      clearTimeout(t)
      if (res.ok) this.store.update({ lastSent: new Date().toISOString() })
    } catch {
      // Never let a failed ping matter - try again in six hours.
    }
  }
}
