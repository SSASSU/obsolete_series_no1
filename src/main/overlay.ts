import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { store } from './store'
import { MEMES, type MemeConfig } from './memes'

let win: BrowserWindow | null = null

function getWindowBounds(meme: MemeConfig): { width: number; height: number; x: number; y: number } {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const size = store.get('size')
  const pos = store.get('position')
  const margin = 12

  if (meme.windowMode === 'fixed') {
    const w = meme.windowWidth  ?? 700
    const h = meme.windowHeight ?? 160
    return { width: w, height: h, x: Math.round((sw - w) / 2), y: sh - h - margin }
  }

  const corners = {
    'bottom-right': { x: sw - size - margin, y: sh - size - margin },
    'bottom-left': { x: margin, y: sh - size - margin },
    'top-right':   { x: sw - size - margin, y: margin },
    'top-left':    { x: margin, y: margin }
  }
  return { width: size, height: size, ...corners[pos] }
}

export function createOverlayWindow(): BrowserWindow {
  const memeId = store.get('memeId')
  const meme = MEMES.find((m) => m.id === memeId) ?? MEMES[0]
  const bounds = getWindowBounds(meme)

  win = new BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      preload: join(__dirname, '../preload/overlay.js')
    }
  })

  win.setIgnoreMouseEvents(true)

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay/index.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/overlay/index.html'))
  }

  return win
}

export function updatePosition(): void {
  if (!win) return
  const memeId = store.get('memeId')
  const meme = MEMES.find((m) => m.id === memeId) ?? MEMES[0]
  const bounds = getWindowBounds(meme)
  win.setBounds(bounds)
}

export function sendSpeed(kps: number): void {
  win?.webContents.send('speed-update', kps)
}

export function sendState(state: string, speed: number): void {
  win?.webContents.send('state-update', state, speed)
}

export function sendCombo(rank: string): void {
  win?.webContents.send('combo-update', rank)
}

export function sendMemeConfig(): void {
  const memeId = store.get('memeId')
  const meme = MEMES.find((m) => m.id === memeId) ?? MEMES[0]
  win?.webContents.send('meme-config', meme)
  updatePosition()
}

export function setVisible(visible: boolean): void {
  if (!win) return
  visible ? win.show() : win.hide()
}

export function getOverlayWindow(): BrowserWindow | null {
  return win
}

let _shaking = false

export function shakeOverlay(): void {
  if (!win || _shaking) return
  _shaking = true
  const { x: ox, y: oy } = win.getBounds()
  const amp = 8
  const seq: [number, number][] = [
    [-amp, -amp], [amp,  amp], [-amp,  amp], [amp, -amp],
    [-amp,    0], [amp,    0], [   0, -amp], [  0,  amp], [0, 0]
  ]
  let i = 0
  const iv = setInterval(() => {
    if (!win) { clearInterval(iv); _shaking = false; return }
    if (i >= seq.length) { clearInterval(iv); win.setPosition(ox, oy); _shaking = false; return }
    const [dx, dy] = seq[i++]
    win.setPosition(ox + dx, oy + dy)
  }, 38)
}
