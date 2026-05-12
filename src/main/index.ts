import { app, ipcMain, session, protocol, globalShortcut } from 'electron'

// EPIPE: broken pipe — 터미널 파이프 끊길 때 dev 모드에서 튀는 에러 억제
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') return
  if (err.message?.includes('Object has been destroyed')) return
  throw err
})

app.setName('obsolete_series_no1')

// meme:// 스킴을 fetch() 가능한 secure 스킴으로 등록 (app ready 이전에 호출 필수)
protocol.registerSchemesAsPrivileged([
  { scheme: 'meme', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
])
import { setupTray, refreshMenu, updateTrayTooltip } from './tray'
import { createOverlayWindow, sendSpeed, sendState, sendCombo, sendMemeConfig, updatePosition, setVisible, getOverlayWindow, shakeOverlay } from './overlay'
import { startKeyboardHook, stopKeyboardHook } from './keyboard'
import { StateMachine } from './state-machine'
import { ComboRank } from './combo-rank'
import { store } from './store'
import { MEMES } from './memes'
import { getCachedAsset } from './asset-cache'
import { readFileSync } from 'fs'
import { join } from 'path'

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.on('window-all-closed', (e) => e.preventDefault())

app.whenReady().then(async () => {
  // meme:// → assets/ 로컬 파일 서빙 (CORS 헤더 포함)
  const MIME: Record<string, string> = {
    json: 'application/json',
    png:  'image/png',
    gif:  'image/gif',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  }
  session.defaultSession.protocol.handle('meme', (request) => {
    const url      = new URL(request.url)
    const relative = decodeURIComponent(url.host + url.pathname)
    const filePath = join(app.getAppPath(), 'assets', relative)
    try {
      const data = readFileSync(filePath)
      const ext  = filePath.split('.').pop()?.toLowerCase() ?? ''
      return new Response(data, {
        headers: {
          'Content-Type':                MIME[ext] ?? 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
        }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  // push 방식 GIF 전송: renderer → 'get-gif' → main → 'gif-data' → renderer
  ipcMain.on('get-gif', async (_e, memeId: string) => {
    const meme = MEMES.find((m) => m.id === memeId)
    if (!meme) { _e.sender.send('gif-data', memeId, null); return }
    try {
      let p: string
      if (meme.localFile) {
        p = join(app.getAppPath(), 'assets', meme.localFile)
      } else {
        p = await getCachedAsset(meme.imageUrl, `${memeId}.gif`)
      }
      const buf = readFileSync(p)
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      _e.sender.send('gif-data', memeId, ab)
    } catch (e) {
      console.error('[gif] error:', e)
      _e.sender.send('gif-data', memeId, null)
    }
  })

  function registerHotkey(accelerator: string): void {
    globalShortcut.unregisterAll()
    if (!accelerator) return
    try {
      const ok = globalShortcut.register(accelerator, () => {
        const next = !store.get('enabled')
        store.set('enabled', next)
        setVisible(next)
        refreshMenu()
      })
      if (!ok) console.error('[hotkey] 등록 실패 (이미 사용 중):', accelerator)
      else console.log('[hotkey] 등록됨:', accelerator)
    } catch (e) {
      console.error('[hotkey] 등록 오류:', e)
    }
  }

  registerHotkey(store.get('hotkey') ?? '')

  ipcMain.on('set-setting', (_e, key: string, value: unknown) => {
    store.set(key as never, value as never)
    if (key === 'autoStart') app.setLoginItemSettings({ openAtLogin: value as boolean })
    if (key === 'enabled') { setVisible(value as boolean); refreshMenu() }
    if (key === 'position' || key === 'size') updatePosition()
    if (key === 'memeId') sendMemeConfig()
    if (key === 'opacity') getOverlayWindow()?.setOpacity(value as number)
    if (key === 'hotkey') registerHotkey(value as string)
  })

  ipcMain.removeHandler('get-settings')
  ipcMain.handle('get-settings', () => store.store)
  ipcMain.removeHandler('get-memes')
  ipcMain.handle('get-memes', () => MEMES)
  ipcMain.removeHandler('get-debug')
  ipcMain.handle('get-debug', () => {
    const ud = app.getPath('userData')
    const { existsSync } = require('fs')
    const p = join(ud, 'cache', 'oiia-cat.gif')
    return `userData=${ud}\nexists=${existsSync(p)}`
  })

  try { setupTray() } catch (e) { console.error('[main] setupTray 실패:', e) }

  const overlay = createOverlayWindow()
  overlay.webContents.on('console-message', (_e, _level, message) => {
    if (message.startsWith('[GifEngine]') || message.startsWith('[state]') || message.startsWith('[render]') || message.startsWith('[oiia]') || message.startsWith('[SequenceEngine]'))
      console.log('[renderer]', message)
  })
  if (!store.get('enabled')) overlay.hide()

  const stateMachine = new StateMachine((state, speed) => {
    if (store.get('enabled')) sendState(state, speed)
    if (state === 'fever') shakeOverlay()
  })

  const comboRank = new ComboRank((rank) => {
    if (store.get('enabled')) sendCombo(rank)
  })

  overlay.webContents.once('did-finish-load', () => {
    sendMemeConfig()
    sendState(stateMachine.state, stateMachine.initialSpeed)
    sendCombo(comboRank.current)
  })

  let dailyMaxTpm = 0

  startKeyboardHook((wpm) => {
    if (store.get('enabled')) sendSpeed(wpm)
    stateMachine.update(wpm)
    comboRank.update(wpm)
    if (wpm > dailyMaxTpm) dailyMaxTpm = wpm
    updateTrayTooltip(wpm, dailyMaxTpm)
  })

  app.setLoginItemSettings({ openAtLogin: store.get('autoStart') })
})

app.on('before-quit', () => { stopKeyboardHook(); globalShortcut.unregisterAll() })
