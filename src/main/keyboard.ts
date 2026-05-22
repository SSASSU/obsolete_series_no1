// TPM (Typing Per Minute) 엔진
// - 모든 키 keydown 이벤트를 10초 슬라이딩 윈도우로 계산
// - 꾹 누름(repeat) 무시
// - 50ms마다 콜백 호출
//
// 스파이크 방지:
//   1) MIN_SAMPLES — 표본이 적을 땐 분모를 WINDOW_MS로 강제해 false-high 차단
//   2) MIN_WINDOW_MS — 표본이 충분해도 분모 하한선
//   3) MAX_JUMP_PER_TICK — burst 이벤트(키 입력 큐 flush 등)로 인한 1-tick 점프 제한

const WINDOW_MS         = 10_000
const MIN_WINDOW_MS     = 2_000
const MIN_SAMPLES       = 4
const MAX_JUMP_PER_TICK = 25
const TICK_MS           = 50

let keyTimestamps: number[] = []
let pressedKeys     = new Set<number>()
let lastReportedTpm = 0
let speedCallback:  ((tpm: number) => void) | null = null
let decayTimer:     ReturnType<typeof setInterval> | null = null
let demoTimer:      ReturnType<typeof setInterval> | null = null

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
  const samples = keyTimestamps.length
  if (samples === 0) return 0

  const oldest = keyTimestamps[0]!
  const naturalElapsed = now - oldest + TICK_MS

  // 표본이 부족하면 분모를 WINDOW_MS로 → 첫 몇 타에서 over-estimate 방지
  const minDenom = samples < MIN_SAMPLES ? WINDOW_MS : MIN_WINDOW_MS
  const elapsed  = Math.min(Math.max(naturalElapsed, minDenom), WINDOW_MS)

  return Math.round((samples / elapsed) * WINDOW_MS)
}

function smoothTpm(raw: number): number {
  // 상승은 tick당 MAX_JUMP_PER_TICK 만큼만, 하락은 즉시
  // → 인위적 burst(예: OS event queue flush)로 인한 스파이크 차단
  if (raw > lastReportedTpm + MAX_JUMP_PER_TICK) {
    raw = lastReportedTpm + MAX_JUMP_PER_TICK
  }
  lastReportedTpm = raw
  return raw
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
      const raw = Math.round(Math.max(0, Math.sin(t) * 100 + 100))
      speedCallback?.(smoothTpm(raw))
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
      const raw = Math.round(Math.max(0, Math.sin(t) * 400 + 200))
      speedCallback?.(smoothTpm(raw))
    }, TICK_MS)
    return
  }

  decayTimer = setInterval(() => {
    speedCallback?.(smoothTpm(currentTpm()))
  }, TICK_MS)
}

export function stopKeyboardHook(): void {
  if (demoTimer)  { clearInterval(demoTimer);  demoTimer  = null }
  if (decayTimer) { clearInterval(decayTimer); decayTimer = null }
  keyTimestamps   = []
  pressedKeys.clear()
  lastReportedTpm = 0
  try {
    const { uIOhook } = require('uiohook-napi')
    uIOhook.stop()
  } catch { /* noop */ }
}
