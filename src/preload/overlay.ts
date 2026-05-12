import { contextBridge, ipcRenderer } from 'electron'
import type { MemeConfig } from '../main/memes'

contextBridge.exposeInMainWorld('electronAPI', {
  onSpeedUpdate: (cb: (tpm: number) => void) =>
    ipcRenderer.on('speed-update', (_e, tpm) => cb(tpm)),
  onMemeConfig: (cb: (config: MemeConfig) => void) =>
    ipcRenderer.on('meme-config', (_e, config) => cb(config)),
  getGif: (memeId: string) =>
    ipcRenderer.send('get-gif', memeId),
  onGifData: (cb: (memeId: string, buf: ArrayBuffer | null) => void) =>
    ipcRenderer.on('gif-data', (_e, memeId, buf) => cb(memeId, buf)),
  onStateUpdate: (cb: (state: string, speed: number) => void) =>
    ipcRenderer.on('state-update', (_e, state, speed) => cb(state, speed)),
  onComboUpdate: (cb: (rank: string) => void) =>
    ipcRenderer.on('combo-update', (_e, rank) => cb(rank)),
})
