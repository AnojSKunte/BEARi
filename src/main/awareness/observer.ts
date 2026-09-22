import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import { desktopCapturer, powerMonitor } from 'electron'
import type { AppSettings, AwarenessState, Observation } from '@shared/types'
import type { Brain } from '../brain'

/**
 * Her eyes. Every so often, while the user is active and has allowed it, she
 * takes one small look at the screen, asks the model what the person is
 * doing in one line, and keeps only that line. The picture is thrown away the
 * moment it has been described. Windows whose title or app matches the
 * exclusion lists are never looked at; anything the model flags as sensitive
 * is dropped; the user can pause her from the tray.
 */

const IDLE_LIMIT_SEC = 120
const TICK_MS = 5000
const THUMB = { width: 1024, height: 640 }

const LOOK_SYSTEM = `You are the eyes of BEARi, a small desktop companion who wants to understand what the person she lives with is working on, so she can help them later. You see one screenshot of their screen. Describe, in one short line, what they are doing - the application, the task and the subject - the way a considerate colleague glancing over would summarise it.

Strict rules:
- Never transcribe or quote text from the screen. Never record names of people from private messages, message contents, passwords, codes, card or account numbers, addresses, medical or financial details.
- If the screen shows a password field, banking, a private conversation, adult content, or anything a person would not want noted, set "sensitive": true and give activity "something private".
- Ignore the small animated girl at the bottom of the screen - that is BEARi herself.
Output only JSON: {"app":"application name","activity":"one line, at most 18 words","topic":"2-4 word subject","sensitive":false}`

interface LookResult {
  app?: string
  activity?: string
  topic?: string
  sensitive?: boolean
}

export class ScreenObserver {
  private timer: NodeJS.Timeout | null = null
  private pausedUntil = 0
  private lastLookAt = 0
  private lastSkipReason: string | null = null
  private looksToday = 0
  private looksDay = ''
  private lastFingerprint: Uint8Array | null = null
  private busy = false

  constructor(
    private getSettings: () => AppSettings,
    private brain: Brain,
    private emit: { state: (s: AwarenessState) => void; observed: (o: Observation) => void }
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.tick(false), TICK_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  state(): AwarenessState {
    return {
      enabled: this.getSettings().awareness.enabled,
      pausedUntil: this.pausedUntil > Date.now() ? this.pausedUntil : 0,
      lastLookAt: this.lastLookAt ? new Date(this.lastLookAt).toISOString() : null,
      lastSkipReason: this.lastSkipReason,
      looksToday: this.looksToday,
      running: this.busy
    }
  }

  pause(ms: number): void {
    this.pausedUntil = ms > 0 ? Date.now() + ms : 0
    this.publish()
  }

  /** A look right now, still honouring exclusions and the pause. */
  lookNow(): Promise<void> {
    return this.tick(true)
  }

  private publish(): void {
    this.emit.state(this.state())
  }

  private skip(reason: string): void {
    if (this.lastSkipReason !== reason) {
      this.lastSkipReason = reason
      this.publish()
    }
  }

  private async tick(forced: boolean): Promise<void> {
    const settings = this.getSettings().awareness
    if (this.busy) return
    if (!settings.enabled) return this.skip('off')
    if (this.pausedUntil > Date.now()) return this.skip('paused')
    if (!this.brain.llm.ready()) return this.skip('no AI key')
    if (!forced) {
      if (Date.now() - this.lastLookAt < Math.max(20, settings.intervalSec) * 1000) return
      if (powerMonitor.getSystemIdleTime() > IDLE_LIMIT_SEC) return this.skip('user away')
    }

    this.busy = true
    this.publish()
    try {
      const fg = await foregroundWindow()
      const title = fg.title.toLowerCase()
      const app = fg.app.toLowerCase()
      if (settings.excludeTitles.some((t) => t && title.includes(t.toLowerCase()))) return this.skip('excluded window')
      if (settings.excludeApps.some((a) => a && app === a.toLowerCase())) return this.skip('excluded app')

      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: THUMB })
      const shot = sources[0]?.thumbnail
      if (!shot || shot.isEmpty()) return this.skip('no screen')

      const print = fingerprint(shot)
      if (!forced && this.lastFingerprint && differs(print, this.lastFingerprint) < 4) return this.skip('screen unchanged')
      this.lastFingerprint = print

      const jpeg = shot.toJPEG(62).toString('base64')
      const result = await this.brain.llm.look<LookResult>(
        LOOK_SYSTEM,
        `Foreground window: "${fg.title}" (${fg.app}). Local time ${new Date().toLocaleTimeString()}.`,
        jpeg,
        'image/jpeg'
      )
      this.lastLookAt = Date.now()
      this.countLook()
      if (!result) return this.skip('could not describe')
      if (result.sensitive) return this.skip('private - not kept')
      const activity = (result.activity ?? '').trim().slice(0, 160)
      if (!activity) return this.skip('nothing to note')

      const obs: Observation = {
        id: randomUUID(),
        at: new Date().toISOString(),
        app: (result.app ?? fg.app).trim().slice(0, 60),
        title: fg.title.slice(0, 120),
        activity,
        topic: (result.topic ?? '').trim().slice(0, 60)
      }
      this.brain.observe(obs)
      this.lastSkipReason = null
      this.emit.observed(obs)
    } catch (err) {
      this.lastLookAt = Date.now()
      this.skip(`error: ${(err instanceof Error ? err.message : String(err)).slice(0, 120)}`)
    } finally {
      this.busy = false
      this.publish()
    }
  }

  private countLook(): void {
    const day = new Date().toDateString()
    if (day !== this.looksDay) {
      this.looksDay = day
      this.looksToday = 0
    }
    this.looksToday++
  }
}

// ---------------------------------------------------------------- helpers

/** 16x16 grey thumbnail - enough to tell "same screen" from "moved on". */
function fingerprint(img: Electron.NativeImage): Uint8Array {
  const small = img.resize({ width: 16, height: 16 })
  const bmp = small.toBitmap()
  const out = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    const o = i * 4
    out[i] = Math.round(0.114 * bmp[o] + 0.587 * bmp[o + 1] + 0.299 * bmp[o + 2])
  }
  return out
}

function differs(a: Uint8Array, b: Uint8Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
  return sum / a.length
}

// A here-string must open and close on lines of its own, so the script is
// handed over base64-encoded (-EncodedCommand) with its newlines intact.
const FOREGROUND_PS = Buffer.from(
  [
    'Add-Type -TypeDefinition @"',
    'using System; using System.Runtime.InteropServices; using System.Text;',
    'public class BeariFg {',
    '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);',
    '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
    '}',
    '"@',
    '$h = [BeariFg]::GetForegroundWindow()',
    '$sb = New-Object System.Text.StringBuilder 512',
    '[void][BeariFg]::GetWindowText($h, $sb, 512)',
    '$procId = 0',
    '[void][BeariFg]::GetWindowThreadProcessId($h, [ref]$procId)',
    '$p = Get-Process -Id $procId -ErrorAction SilentlyContinue',
    'Write-Output ($sb.ToString() + "`t" + $p.ProcessName)'
  ].join('\r\n'),
  'utf16le'
).toString('base64')

/** Title and process name of the window in front, via a short PowerShell call. */
function foregroundWindow(): Promise<{ title: string; app: string }> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve({ title: '', app: '' })
    const ps = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', FOREGROUND_PS],
      { windowsHide: true }
    )
    let out = ''
    const done = (): void => {
      const [title = '', app = ''] = out.trim().split('\t')
      resolve({ title: title.trim(), app: app.trim() })
    }
    const t = setTimeout(() => {
      ps.kill()
      done()
    }, 6000)
    ps.stdout.on('data', (d) => (out += String(d)))
    ps.on('close', () => {
      clearTimeout(t)
      done()
    })
    ps.on('error', () => {
      clearTimeout(t)
      done()
    })
  })
}
