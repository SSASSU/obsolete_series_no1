// TPM (Typing Per Minute) 엔진
// - 모든 키 keydown 이벤트를 1분 슬라이딩 윈도우로 계산
// - 꾹 누름(repeat) 무시
// - 200ms마다 콜백 호출

const WINDOW_MS = 10_000
const TICK_MS   = 200

let keyTimestamps: number[] = []
let pressedKeys   = new Set<number>()
let speedCallback: ((tpm: number) => void) | null = null
let decayTimer:    ReturnType<typeof setInterval> | null = null
let demoTimer:     ReturnType<typeof setInterval> | null = null

function recordKey(keycode: number): void {
  if (pressedKeys.has(keycode)) return   // 꾹 누름 repeat 무시
  pressedKeys.add(keycode)
  keyTimestamps.push(Date.now())
}

function releaseKey(keycode: number): void {
  pressedKeys.delete(keycode)
}

function currentTpm(): number {
  const now = Date.now()
  keyTimestamps = keyTimestamps.filter(t => now - t < WINDOW_MS)
  const oldest = keyTimestamps[0]
  if (!oldest) return 0
  const elapsed = Math.min(now - oldest + TICK_MS, WINDOW_MS)
  return Math.round((keyTimestamps.length / elapsed) * WINDOW_MS)
}

export function startKeyboardHook(onTpm: (tpm: number) => void): void {
  speedCallback = onTpm

  // dev 환경에서 uiohook-napi prebuilt 가 NAPI ABI 불일치로 fatal crash 를 일으킴
  // → dev 모드는 사인파 데모, 패키지 빌드에서만 실제 훅 사용
  const { app } = require('electron')
  if (!app.isPackaged) {
    console.log('[keyboard] dev 모드 — 데모 사인파 사용')
    let t = 0
    demoTimer = setInterval(() => {
      t += 0.05                                           // ~25s 한 사이클
      speedCallback?.(Math.round(Math.max(0, Math.sin(t) * 100 + 100)))
    }, TICK_MS)                                           // 0 ~ 200 TPM, 실측 범위
    return
  }

  try {
    const { uIOhook } = require('uiohook-napi')
    uIOhook.on('keydown', (e: { keycode: number }) => recordKey(e.keycode))
    uIOhook.on('keyup',   (e: { keycode: number }) => releaseKey(e.keycode))
    uIOhook.start()
    console.log('[keyboard] uiohook-napi 시작됨')
  } catch (e) {
    console.error('[keyboard] uiohook-napi 실패, 데모 모드:', e)
    let t = 0
    setInterval(() => {
      t += 0.05
      speedCallback?.(Math.round(Math.max(0, Math.sin(t) * 400 + 200)))
    }, TICK_MS)
    return
  }

  decayTimer = setInterval(() => {
    speedCallback?.(currentTpm())
  }, TICK_MS)
}

export function stopKeyboardHook(): void {
  if (demoTimer)  { clearInterval(demoTimer);  demoTimer  = null }
  if (decayTimer) { clearInterval(decayTimer); decayTimer = null }
  try {
    const { uIOhook } = require('uiohook-napi')
    uIOhook.stop()
  } catch { /* noop */ }
}
