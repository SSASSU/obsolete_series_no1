"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  onSpeedUpdate: (cb) => electron.ipcRenderer.on("speed-update", (_e, kps) => cb(kps)),
  onMemeConfig: (cb) => electron.ipcRenderer.on("meme-config", (_e, config) => cb(config)),
  getAssetUrl: (memeId) => electron.ipcRenderer.invoke("get-asset-url", memeId)
});
