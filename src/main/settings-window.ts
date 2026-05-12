import { BrowserWindow } from 'electron'
import { join } from 'path'

let win: BrowserWindow | null = null

export function createSettingsWindow(): void {
  if (win && !win.isDestroyed()) {
    win.focus()
    return
  }

  win = new BrowserWindow({
    width: 360,
    height: 580,
    resizable: false,
    frame: false,
    transparent: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      preload: join(__dirname, '../preload/settings.js')
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/settings/index.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/settings/index.html'))
  }

  win.on('closed', () => {
    win = null
  })
}
