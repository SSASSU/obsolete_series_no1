"use strict";
const electron = require("electron");
const path = require("path");
const Store = require("electron-store");
const fs = require("fs");
const store = new Store({
  defaults: {
    memeId: "oiia-cat",
    position: "bottom-right",
    size: 120,
    opacity: 0.9,
    autoStart: false,
    enabled: true
  }
});
let win$1 = null;
function createSettingsWindow() {
  if (win$1 && !win$1.isDestroyed()) {
    win$1.focus();
    return;
  }
  win$1 = new electron.BrowserWindow({
    width: 380,
    height: 520,
    resizable: false,
    frame: false,
    transparent: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "../preload/settings.js")
    }
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    win$1.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/settings/index.html`);
  } else {
    win$1.loadFile(path.join(__dirname, "../renderer/settings/index.html"));
  }
  win$1.on("closed", () => {
    win$1 = null;
  });
}
const MEMES = [
  {
    id: "oiia-cat",
    name: "Oiia Cat (우끼끼)",
    animationType: "spin",
    windowMode: "corner",
    imageUrl: "https://media.tenor.com/ue7Q8JmP_0MAAAAd/oiia-oiiaoiia.gif"
  },
  {
    id: "nyan-cat",
    name: "Nyan Cat (냥켓)",
    animationType: "run",
    windowMode: "fixed",
    imageUrl: "https://media.tenor.com/zBc1XhcbTSoAAAAd/nyan-cat-rainbow.gif",
    windowWidth: 700,
    windowHeight: 448
  }
];
let win = null;
function getWindowBounds(meme) {
  const { width: sw, height: sh } = electron.screen.getPrimaryDisplay().workAreaSize;
  const size = store.get("size");
  const pos = store.get("position");
  const margin = 12;
  if (meme.windowMode === "fullwidth") {
    return { width: sw, height: size + 40, x: 0, y: sh - size - 40 - margin };
  }
  const corners = {
    "bottom-right": { x: sw - size - margin, y: sh - size - margin },
    "bottom-left": { x: margin, y: sh - size - margin },
    "top-right": { x: sw - size - margin, y: margin },
    "top-left": { x: margin, y: margin }
  };
  return { width: size, height: size, ...corners[pos] };
}
function createOverlayWindow() {
  const memeId = store.get("memeId");
  const meme = MEMES.find((m) => m.id === memeId) ?? MEMES[0];
  const bounds = getWindowBounds(meme);
  win = new electron.BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "../preload/overlay.js")
    }
  });
  win.setIgnoreMouseEvents(true);
  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/overlay/index.html`);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/overlay/index.html"));
  }
  return win;
}
function updatePosition() {
  if (!win) return;
  const memeId = store.get("memeId");
  const meme = MEMES.find((m) => m.id === memeId) ?? MEMES[0];
  const bounds = getWindowBounds(meme);
  win.setBounds(bounds);
}
function sendSpeed(kps) {
  win?.webContents.send("speed-update", kps);
}
function sendMemeConfig() {
  const memeId = store.get("memeId");
  const meme = MEMES.find((m) => m.id === memeId) ?? MEMES[0];
  win?.webContents.send("meme-config", meme);
  updatePosition();
}
function setVisible(visible) {
  if (!win) return;
  visible ? win.show() : win.hide();
}
function getOverlayWindow() {
  return win;
}
let tray = null;
function setupTray() {
  const iconPath = path.join(__dirname, "../../resources/tray.png");
  const icon = electron.nativeImage.createFromPath(iconPath);
  tray = new electron.Tray(icon.isEmpty() ? electron.nativeImage.createEmpty() : icon);
  tray.setToolTip("Meme Desk Pet");
  refreshMenu();
}
function refreshMenu() {
  if (!tray) return;
  const enabled = store.get("enabled");
  const menu = electron.Menu.buildFromTemplate([
    {
      label: enabled ? "숨기기" : "보이기",
      click: () => {
        const next = !store.get("enabled");
        store.set("enabled", next);
        setVisible(next);
        refreshMenu();
      }
    },
    { label: "설정", click: () => createSettingsWindow() },
    { type: "separator" },
    { label: "종료", click: () => electron.app.quit() }
  ]);
  tray.setContextMenu(menu);
}
let recentKeys = [];
let speedCallback = null;
let decayTimer = null;
function startKeyboardHook(onSpeed) {
  speedCallback = onSpeed;
  try {
    const { uIOhook } = require("uiohook-napi");
    uIOhook.on("keydown", () => {
      const now = Date.now();
      recentKeys.push(now);
      recentKeys = recentKeys.filter((t) => now - t < 2e3);
      speedCallback?.(recentKeys.length / 2);
    });
    uIOhook.start();
  } catch {
    console.warn("[keyboard] uiohook-napi 로드 실패 — 데모 모드로 실행");
    let t = 0;
    setInterval(() => {
      t += 0.1;
      speedCallback?.(Math.max(0, Math.sin(t) * 6));
    }, 100);
  }
  decayTimer = setInterval(() => {
    const now = Date.now();
    recentKeys = recentKeys.filter((t) => now - t < 2e3);
    speedCallback?.(recentKeys.length / 2);
  }, 200);
}
function stopKeyboardHook() {
  try {
    const { uIOhook } = require("uiohook-napi");
    uIOhook.stop();
  } catch {
  }
  if (decayTimer) {
    clearInterval(decayTimer);
    decayTimer = null;
  }
}
const cacheDir = path.join(electron.app.getPath("userData"), "cache");
async function getCachedAsset(url, filename) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, filename);
  if (!fs.existsSync(cachePath)) {
    const res = await electron.net.fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    const buf = await res.arrayBuffer();
    fs.writeFileSync(cachePath, Buffer.from(buf));
  }
  return `file://${cachePath.replace(/\\/g, "/")}`;
}
electron.app.on("window-all-closed", (e) => e.preventDefault());
electron.app.whenReady().then(async () => {
  for (const meme of MEMES) {
    getCachedAsset(meme.imageUrl, `${meme.id}.gif`).catch(() => {
      console.warn(`[cache] ${meme.id} 다운로드 실패 — CSS 폴백 사용`);
    });
  }
  setupTray();
  const overlay = createOverlayWindow();
  overlay.webContents.once("did-finish-load", () => sendMemeConfig());
  if (!store.get("enabled")) overlay.hide();
  startKeyboardHook((kps) => {
    if (store.get("enabled")) sendSpeed(kps);
  });
  electron.app.setLoginItemSettings({ openAtLogin: store.get("autoStart") });
  registerIpc();
});
electron.app.on("before-quit", () => stopKeyboardHook());
function registerIpc() {
  electron.ipcMain.handle("get-settings", () => store.store);
  electron.ipcMain.handle("get-memes", () => MEMES);
  electron.ipcMain.handle("get-asset-url", async (_e, memeId) => {
    const meme = MEMES.find((m) => m.id === memeId);
    if (!meme) return null;
    try {
      return await getCachedAsset(meme.imageUrl, `${memeId}.gif`);
    } catch {
      return null;
    }
  });
  electron.ipcMain.on("set-setting", (_e, key, value) => {
    store.set(key, value);
    if (key === "autoStart") electron.app.setLoginItemSettings({ openAtLogin: value });
    if (key === "enabled") {
      setVisible(value);
      refreshMenu();
    }
    if (key === "position" || key === "size") updatePosition();
    if (key === "memeId") sendMemeConfig();
    if (key === "opacity") getOverlayWindow()?.setOpacity(value);
  });
}
