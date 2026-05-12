"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  getSettings: () => electron.ipcRenderer.invoke("get-settings"),
  getMemes: () => electron.ipcRenderer.invoke("get-memes"),
  setSetting: (key, value) => electron.ipcRenderer.send("set-setting", key, value),
  closeWindow: () => electron.ipcRenderer.send("close-settings")
});
