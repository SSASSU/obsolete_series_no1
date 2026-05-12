import { Tray, Menu, app, nativeImage, shell } from 'electron'
import { join } from 'path'
import { store } from './store'
import { createSettingsWindow } from './settings-window'
import { setVisible } from './overlay'

let tray: Tray | null = null

export function updateTrayTooltip(tpm: number, maxTpm: number): void {
  if (!tray) return
  const stats = tpm > 0
    ? `\n현재 ${tpm} TPM  ·  오늘 최고 ${maxTpm} TPM`
    : maxTpm > 0 ? `\n오늘 최고 ${maxTpm} TPM` : ''
  tray.setToolTip(`obsolete_series_no1${stats}`)
}

export function setupTray(): void {
  const iconPath = join(__dirname, '../../resources/tray.png')
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('obsolete_series_no1')
  refreshMenu()
}

export function refreshMenu(): void {
  if (!tray) return
  const enabled = store.get('enabled')

  const menu = Menu.buildFromTemplate([
    {
      label: enabled ? '숨기기' : '보이기',
      click: () => {
        const next = !store.get('enabled')
        store.set('enabled', next)
        setVisible(next)
        refreshMenu()
      }
    },
    { label: '설정', click: () => createSettingsWindow() },
    { type: 'separator' },
    {
      label: '언인스톨',
      click: () => shell.openExternal('ms-settings:appsfeatures')
    },
    { label: '종료', click: () => app.quit() }
  ])

  tray.setContextMenu(menu)
}
