import { Menu, Tray, nativeImage } from 'electron'
import type { AwarenessState, UpdateState } from '@shared/types'

/**
 * Draws BEARi's tray icon procedurally (no asset pipeline needed yet):
 * a soft lavender face with dark hair, pink glasses and a smile, rendered
 * into a raw BGRA bitmap.
 */
function drawTrayIcon(size = 32): Electron.NativeImage {
  const buf = Buffer.alloc(size * size * 4, 0)
  const set = (x: number, y: number, r: number, g: number, b: number, a = 255): void => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    buf[i] = b
    buf[i + 1] = g
    buf[i + 2] = r
    buf[i + 3] = a
  }

  const cx = size / 2
  const cy = size / 2
  const faceR = size * 0.42

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx
      const dy = y - cy
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < faceR) {
        // Hair: top arc and sides; face: warm skin tone.
        const hair = dy < -faceR * 0.25 || Math.abs(dx) > faceR * 0.72
        if (hair) set(x, y, 62, 44, 77)
        else set(x, y, 248, 224, 200)
      }
    }
  }

  // Pink round glasses.
  const eyeY = Math.round(cy + 1)
  for (const ex of [Math.round(cx - faceR * 0.38), Math.round(cx + faceR * 0.38)]) {
    for (let t = 0; t < Math.PI * 2; t += 0.12) {
      set(Math.round(ex + Math.cos(t) * 4), Math.round(eyeY + Math.sin(t) * 4), 242, 169, 196)
    }
    set(ex, eyeY, 58, 44, 77)
    set(ex + 1, eyeY, 58, 44, 77)
  }

  // Smile.
  for (let t = 0.3; t < Math.PI - 0.3; t += 0.2) {
    set(Math.round(cx + Math.cos(t) * 4), Math.round(cy + faceR * 0.45 + Math.sin(t) * 2), 200, 90, 110)
  }

  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}

export interface TrayActions {
  onOpenDashboard: () => void
  onToggleCharacter: () => void
  onQuit: () => void
  onPauseWatching: (ms: number) => void
  onDownloadUpdate: () => void
  onInstallUpdate: () => void
  awareness: () => AwarenessState
  update: () => UpdateState
}

export interface TrayHandle {
  tray: Tray
  /** Rebuild the menu after awareness or update state changes. */
  refresh: () => void
}

export function createTray(actions: TrayActions): TrayHandle {
  const tray = new Tray(drawTrayIcon())
  tray.setToolTip('BEARi — your desktop companion')

  const refresh = (): void => {
    const a = actions.awareness()
    const u = actions.update()
    const items: Electron.MenuItemConstructorOptions[] = [
      { label: 'Open Dashboard', click: actions.onOpenDashboard },
      { label: 'Show / Hide BEARi', click: actions.onToggleCharacter },
      { type: 'separator' }
    ]
    if (a.enabled) {
      items.push(
        a.pausedUntil
          ? { label: 'Resume watching the screen', click: () => actions.onPauseWatching(0) }
          : { label: 'Pause watching for 1 hour', click: () => actions.onPauseWatching(60 * 60 * 1000) },
        { type: 'separator' }
      )
    }
    if (u.phase === 'available') {
      items.push({ label: `Download BEARi ${u.latestVersion}`, click: actions.onDownloadUpdate }, { type: 'separator' })
    } else if (u.phase === 'downloading') {
      items.push({ label: `Downloading update… ${u.percent}%`, enabled: false }, { type: 'separator' })
    } else if (u.phase === 'downloaded') {
      items.push({ label: `Restart to update to ${u.latestVersion}`, click: actions.onInstallUpdate }, { type: 'separator' })
    }
    items.push({ label: 'Quit BEARi', click: actions.onQuit })
    tray.setContextMenu(Menu.buildFromTemplate(items))
    tray.setToolTip(
      u.phase === 'downloaded'
        ? `BEARi — update ${u.latestVersion} ready`
        : a.enabled && !a.pausedUntil
          ? 'BEARi — watching to help (pause from this menu)'
          : 'BEARi — your desktop companion'
    )
  }

  refresh()
  tray.on('double-click', actions.onOpenDashboard)
  return { tray, refresh }
}
