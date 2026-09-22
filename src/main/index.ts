import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { writeFileSync } from 'fs'
import { IPC, DEFAULT_SETTINGS } from '@shared/types'
import type { AppInfo, AppSettings, CoreBlockId, CursorInfo, MemoryEntry, MemoryKind } from '@shared/types'
import { JsonStore } from './store'
import { Brain } from './brain'
import { ChatEngine } from './chat'
import { ScreenObserver } from './awareness/observer'
import { Updater } from './updater'
import { createCharacterWindow, createDashboardWindow } from './windows'
import { createTray } from './tray'
import type { TrayHandle } from './tray'

// ---------------------------------------------------------------- state

const settingsStore = new JsonStore<AppSettings>('settings', DEFAULT_SETTINGS)
const getSettings = (): AppSettings => settingsStore.get()

let brain: Brain
let chat: ChatEngine
let observer: ScreenObserver
let updater: Updater
let tray: TrayHandle | null = null

let characterWin: BrowserWindow | null = null
let dashboardWin: BrowserWindow | null = null

function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  }
}

function openDashboard(): void {
  if (dashboardWin && !dashboardWin.isDestroyed()) {
    dashboardWin.show()
    dashboardWin.focus()
    return
  }
  dashboardWin = createDashboardWindow()
  dashboardWin.on('closed', () => (dashboardWin = null))
}

/** Register/unregister BEARi to start with Windows (packaged builds only). */
function applyLaunchAtStartup(enabled: boolean): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--startup'] })
}

/** Everything that depends on `app` being ready. */
function createEngines(): void {
  brain = new Brain(getSettings)
  brain.onChange = () => {
    broadcast(IPC.brainChanged)
    broadcast(IPC.memoryChanged)
  }
  // The notebook she kept before she had a brain moves in once, then the file is left alone.
  const legacy = new JsonStore<MemoryEntry[]>('memory', [])
  brain.migrateLegacy(legacy.get())

  chat = new ChatEngine(getSettings, brain)
  observer = new ScreenObserver(getSettings, brain, {
    state: (s) => {
      broadcast(IPC.awarenessChanged, s)
      tray?.refresh()
    },
    observed: (o) => broadcast(IPC.awarenessObserved, o)
  })
  updater = new Updater(getSettings, (s) => {
    broadcast(IPC.updateChanged, s)
    tray?.refresh()
  })
}

// ---------------------------------------------------------------- ipc

function registerIpc(): void {
  // -- chat
  ipcMain.handle(IPC.chatSend, async (event, text: string) => {
    try {
      const result = await chat.send(text, (raw) => {
        if (!event.sender.isDestroyed()) event.sender.send(IPC.chatChunk, raw)
      })
      if (!event.sender.isDestroyed()) event.sender.send(IPC.chatDone, result)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!event.sender.isDestroyed()) event.sender.send(IPC.chatError, message)
      return null
    }
  })
  ipcMain.on(IPC.chatCancel, () => chat.cancel())

  // -- settings
  ipcMain.handle(IPC.settingsGet, () => settingsStore.get())
  ipcMain.handle(IPC.settingsSet, (_e, patch: Partial<AppSettings>) => {
    const next = settingsStore.update(patch)
    if (patch.alwaysOnTop !== undefined && characterWin && !characterWin.isDestroyed()) {
      characterWin.setAlwaysOnTop(patch.alwaysOnTop, 'screen-saver')
    }
    if (patch.launchAtStartup !== undefined) applyLaunchAtStartup(next.launchAtStartup)
    if (patch.userName !== undefined) brain.syncUserName()
    if (patch.awareness !== undefined) {
      broadcast(IPC.awarenessChanged, observer.state())
      tray?.refresh()
    }
    broadcast(IPC.settingsChanged, next)
    return next
  })

  // -- memory (notebook view)
  ipcMain.handle(IPC.memoryList, () => brain.list())
  ipcMain.handle(IPC.memoryAdd, (_e, kind: MemoryKind, text: string) => brain.add(kind, text))
  ipcMain.handle(IPC.memoryUpdate, (_e, id: string, patch: { kind?: MemoryKind; text?: string }) => brain.update(id, patch))
  ipcMain.handle(IPC.memoryRemove, (_e, id: string) => brain.remove(id))

  // -- brain
  ipcMain.handle(IPC.brainSnapshot, () => brain.snapshot())
  ipcMain.handle(IPC.brainTimeline, (_e, dayIso: string) => brain.timeline(dayIso))
  ipcMain.handle(IPC.brainRecall, (_e, query: string) => brain.recall(query))
  ipcMain.handle(IPC.brainSetBlock, (_e, id: CoreBlockId, text: string) => brain.setBlock(id, text))
  ipcMain.handle(IPC.brainForgetFact, (_e, id: string) => brain.forgetFact(id))
  ipcMain.handle(IPC.brainForgetEntity, (_e, id: string) => brain.forgetEntity(id))
  ipcMain.handle(IPC.brainReflect, () => brain.reflectNow())
  ipcMain.handle(IPC.brainExport, () => brain.export())

  // -- awareness
  ipcMain.handle(IPC.awarenessState, () => observer.state())
  ipcMain.handle(IPC.awarenessPause, (_e, ms: number) => {
    observer.pause(ms)
    tray?.refresh()
    return observer.state()
  })
  ipcMain.handle(IPC.awarenessLookNow, async () => {
    await observer.lookNow()
    return observer.state()
  })
  ipcMain.handle(IPC.awarenessRecent, (_e, n: number) => brain.recentObservations(n))

  // -- updates
  ipcMain.handle(IPC.updateState, () => updater.state)
  ipcMain.handle(IPC.updateCheck, () => updater.check(true))
  ipcMain.handle(IPC.updateDownload, () => updater.download())
  ipcMain.on(IPC.updateInstall, () => updater.install())

  // -- character window interactivity (per-region click-through)
  ipcMain.on(IPC.setInteractive, (_e, interactive: boolean) => {
    characterWin?.setIgnoreMouseEvents(!interactive, { forward: true })
  })

  // -- app
  ipcMain.handle(IPC.appInfo, (): AppInfo => ({ version: app.getVersion(), isPackaged: app.isPackaged, platform: process.platform }))
  ipcMain.on(IPC.openDashboard, openDashboard)
  ipcMain.on(IPC.quit, () => app.quit())
}

// ---------------------------------------------------------------- cursor & activity tracking

let lastCursor = { x: -1, y: -1 }
let lastActivityAt = Date.now()

function startCursorLoop(): void {
  setInterval(() => {
    if (!characterWin || characterWin.isDestroyed()) return
    const pt = screen.getCursorScreenPoint()
    if (pt.x !== lastCursor.x || pt.y !== lastCursor.y) {
      lastCursor = pt
      lastActivityAt = Date.now()
    }
    const bounds = characterWin.getBounds()
    const info: CursorInfo & { idleMs: number } = {
      x: pt.x,
      y: pt.y,
      winX: bounds.x,
      winY: bounds.y,
      winW: bounds.width,
      winH: bounds.height,
      idleMs: Date.now() - lastActivityAt
    }
    try {
      characterWin.webContents.send(IPC.cursorMove, info)
    } catch {
      // Renderer frame can be briefly disposed during dev reloads — skip the tick.
    }
  }, 100)
}

// ---------------------------------------------------------------- lifecycle

function smokeReport(line: string): void {
  console.log(line)
  const target = process.env.BEARI_SMOKE ?? ''
  if (/[\\/]/.test(target)) {
    try {
      writeFileSync(target, line + '\n')
    } catch {
      /* the console line is still there */
    }
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  if (process.env.BEARI_SMOKE) smokeReport('[smoke] another BEARi is already running - nothing checked')
  app.quit()
} else {
  app.on('second-instance', openDashboard)

  app.whenReady().then(() => {
    createEngines()
    registerIpc()
    // Headless start-up check for builds and CI: engines up, brain open, one
    // real update check against GitHub, then leave. A GUI executable has no
    // console, so the line is also written to the file named in BEARI_SMOKE
    // when that looks like a path.
    if (process.env.BEARI_SMOKE) {
      const stats = brain.store.stats()
      const report = (): void => {
        const u = updater.state
        smokeReport(
          `[smoke] brain ok - ${stats.facts} facts, ${stats.episodes} episodes` +
            ` | update: ${u.phase}${u.latestVersion ? ` latest=${u.latestVersion}` : ''}${u.message ? ` (${u.message})` : ''}` +
            ` | awareness ${observer.state().enabled ? 'on' : 'off'}`
        )
        app.quit()
      }
      const bail = setTimeout(report, 25_000)
      updater.check(true).then(() => {
        // the result arrives on an event just after the promise settles
        setTimeout(() => {
          clearTimeout(bail)
          report()
        }, 2500)
      })
      return
    }
    applyLaunchAtStartup(settingsStore.get().launchAtStartup)
    characterWin = createCharacterWindow()
    characterWin.on('closed', () => (characterWin = null))
    characterWin.setAlwaysOnTop(settingsStore.get().alwaysOnTop, 'screen-saver')

    tray = createTray({
      onOpenDashboard: openDashboard,
      onToggleCharacter: () => {
        if (!characterWin) return
        if (characterWin.isVisible()) characterWin.hide()
        else characterWin.showInactive()
      },
      onQuit: () => app.quit(),
      onPauseWatching: (ms) => {
        observer.pause(ms)
        tray?.refresh()
      },
      onDownloadUpdate: () => void updater.download(),
      onInstallUpdate: () => updater.install(),
      awareness: () => observer.state(),
      update: () => updater.state
    })

    // Auto-open dashboard on startup so the user sees it immediately
    openDashboard()

    startCursorLoop()
    observer.start()
    updater.start()
  })

  app.on('before-quit', () => {
    observer?.stop()
    updater?.stop()
  })

  // BEARi lives in the tray — closing the dashboard must not quit the app.
  app.on('window-all-closed', () => {
    /* keep running */
  })
}
