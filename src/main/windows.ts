import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

function loadPage(win: BrowserWindow, page: 'character' | 'dashboard'): void {
  if (isDev) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/${page}.html`)
  } else {
    win.loadFile(join(__dirname, `../renderer/${page}.html`))
  }
}

/**
 * The character overlay: a transparent, frameless, always-on-top strip
 * pinned to the bottom of the work area. BEARi walks inside it; the window
 * itself never moves, which keeps animation at a smooth 60 fps.
 * Mouse events pass through except where the renderer opts in.
 */
export function createCharacterWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay()
  // Tall enough that her biggest drawn frame - the top of a celebration jump at
  // the largest character size - still has room above her head.
  const height = 620

  const win = new BrowserWindow({
    x: workArea.x,
    y: workArea.y + workArea.height - height,
    width: workArea.width,
    height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setIgnoreMouseEvents(true, { forward: true })
  win.once('ready-to-show', () => win.showInactive())
  win.webContents.on('console-message', (_e, _level, message, line, sourceId) => {
    console.log(`[CHARACTER CONSOLE]: ${message} (${sourceId}:${line})`)
  })

  // Keep pinned to the work area if display metrics change.
  const reposition = (): void => {
    const wa = screen.getPrimaryDisplay().workArea
    win.setBounds({ x: wa.x, y: wa.y + wa.height - height, width: wa.width, height })
  }
  screen.on('display-metrics-changed', reposition)
  win.on('closed', () => screen.removeListener('display-metrics-changed', reposition))

  loadPage(win, 'character')

  return win
}

/** BEARi's home — the dashboard. Created lazily, hidden on close. */
export function createDashboardWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1120,
    height: 740,
    minWidth: 860,
    minHeight: 560,
    title: 'BEARi — Home',
    backgroundColor: '#F9F5FF',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('console-message', (_e, _level, message, line, sourceId) => {
    console.log(`[DASHBOARD CONSOLE]: ${message} (${sourceId}:${line})`)
  })

  loadPage(win, 'dashboard')
  return win
}
