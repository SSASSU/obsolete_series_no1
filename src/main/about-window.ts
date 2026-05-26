import { BrowserWindow, app, shell } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'

let win: BrowserWindow | null = null

export function createAboutWindow(): void {
  if (win && !win.isDestroyed()) {
    win.focus()
    return
  }

  const version  = app.getVersion()
  const iconPath = join(app.getAppPath(), 'assets/icons/app/peeking-256.png')
  const iconB64  = (() => {
    try { return readFileSync(iconPath).toString('base64') }
    catch { return '' }
  })()

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    -webkit-app-region: drag;
    user-select: none;
    background: #1a1a1a;
    color: #eee;
    font: 13px -apple-system, "Segoe UI", system-ui, sans-serif;
    height: 100vh;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 24px;
    text-align: center;
  }
  img { width: 96px; height: 96px; image-rendering: -webkit-optimize-contrast; }
  h1 { font-size: 17px; font-weight: 600; margin-top: 14px; }
  .version { font-size: 11px; color: #888; margin-top: 2px; }
  .link {
    font-family: ui-monospace, "Consolas", monospace;
    font-size: 12px;
    color: #6cf;
    -webkit-app-region: no-drag;
    cursor: pointer;
    text-decoration: none;
    display: block;
  }
  .link:hover { text-decoration: underline; }
  .links { margin-top: 18px; display: flex; flex-direction: column; gap: 6px; }
  .author { font-size: 11px; color: #aaa; margin-top: 12px; }
</style></head>
<body>
  ${iconB64 ? `<img src="data:image/png;base64,${iconB64}" alt="icon">` : ''}
  <h1>obsolete_series_no1</h1>
  <div class="version">v${version}</div>
  <div class="author">made by pururoong</div>
  <div class="links">
    <a class="link" href="mailto:pururoong@gmail.com">pururoong@gmail.com</a>
    <a class="link" href="https://github.com/pururoong">github.com/pururoong</a>
  </div>
</body></html>`

  win = new BrowserWindow({
    width: 280,
    height: 300,
    resizable: false,
    minimizable: false,
    maximizable: false,
    frame: false,
    transparent: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  })

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  win.setMenu(null)

  // mailto: 등 외부 링크는 OS 기본 핸들러로
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('data:')) {
      e.preventDefault()
      shell.openExternal(url)
    }
  })

  win.on('blur', () => win?.close())
  win.on('closed', () => { win = null })
}
