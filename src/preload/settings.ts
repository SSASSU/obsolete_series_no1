import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getMemes: () => ipcRenderer.invoke('get-memes'),
  setSetting: (key: string, value: unknown) => ipcRenderer.send('set-setting', key, value),
  closeWindow: () => ipcRenderer.send('close-settings')
})
