import { GifEngine } from './gif-engine'

interface MemeConfig { id: string }
interface ElectronAPI {
  onSpeedUpdate:  (cb: (wpm: number) => void) => void
  onMemeConfig:   (cb: (config: MemeConfig) => void) => void
  getGif:         (memeId: string) => void
  onGifData:      (cb: (memeId: string, buf: ArrayBuffer | null) => void) => void
  onStateUpdate:  (cb: (state: string, speed: number) => void) => void
  onComboUpdate:  (cb: (rank: string) => void) => void
}
declare const window: Window & { electronAPI: ElectronAPI }

// ── GifEngine 공통 캔버스 렌더러 ─────────────────────
function makeCanvasRenderer(canvasId: string): {
  canvas: HTMLCanvasElement | null
  ctx: CanvasRenderingContext2D | null
  resize: () => void
  draw: (engine: GifEngine, dt: number, rate: number, rank: string) => void
} {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null
  const ctx = canvas?.getContext('2d') ?? null
  if (ctx) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high' }

  let timeAcc = 0

  const resize = () => {
    if (!canvas) return
    canvas.width  = window.innerWidth  || canvas.offsetWidth  || 120
    canvas.height = window.innerHeight || canvas.offsetHeight || 120
  }
  resize()
  window.addEventListener('resize', resize)

  const draw = (engine: GifEngine, dt: number, rate: number, rank: string) => {
    if (!canvas || !ctx) return
    engine.tick(dt)
    timeAcc += dt

    const cw = canvas.width, ch = canvas.height
    ctx.clearRect(0, 0, cw, ch)

    const scale = Math.max(cw / engine.naturalWidth, ch / engine.naturalHeight)
    const dw = engine.naturalWidth  * scale
    const dh = engine.naturalHeight * scale

    let oxAmp = 0, oyAmp = 0, xPeriod = 1000, yPeriod = 780
    let trailCount = 0, trailSpacing = 0

    if (rank === 'SSS') {
      trailCount = 7; trailSpacing = 42
    } else if (rank === 'SS') {
      trailCount = 5; trailSpacing = 27
    } else if (rank === 'S') {
      trailCount = 3; trailSpacing = 17
    } else if (rank === 'A') {
      trailCount = 1; trailSpacing = 10
    }

    const phi  = timeAcc * 2 * Math.PI
    const ox   = oxAmp * Math.sin(phi / xPeriod)
    const oy   = oyAmp * Math.cos(phi / yPeriod)
    const vx   =  Math.cos(phi / xPeriod)
    const vy   = -Math.sin(phi / yPeriod)

    const baseDx = (cw - dw) / 2 + ox
    const baseDy = (ch - dh) / 2 + oy

    // A 이상: cat 마스크에 shadowBlur + 랭크 색상 → 고양이 윤곽만 빛남
    const GLOW: Record<string, { color: string; maxBlur: number; speed: number }> = {
      'A':   { color: 'rgba(255,220,60,1.0)',  maxBlur: 28, speed: 2.5 },
      'S':   { color: 'rgba(255,255,255,1.0)', maxBlur: 42, speed: 5   },
      'SS':  { color: 'rgba(255,150,50,1.0)',  maxBlur: 60, speed: 10  },
      'SSS': { color: 'rgba(255,60,255,1.0)',  maxBlur: 85, speed: 18  },
    }
    const glow = GLOW[rank]

    for (let i = trailCount; i >= 1; i--) {
      ctx.globalAlpha = (trailCount - i + 1) / (trailCount + 1) * 0.5
      engine.drawTo(ctx,
        baseDx - vx * trailSpacing * i,
        baseDy - vy * trailSpacing * 0.25 * i,
        dw, dh)
    }
    ctx.globalAlpha = 1
    engine.drawTo(ctx, baseDx, baseDy, dw, dh)

    if (glow) {
      const pulse = 0.5 + 0.5 * Math.sin(timeAcc * glow.speed / 1000 * Math.PI * 2)
      ctx.save()
      ctx.shadowColor = glow.color
      ctx.shadowBlur  = glow.maxBlur * pulse
      ctx.globalAlpha = 1.0
      engine.drawGlowTo(ctx, baseDx, baseDy, dw, dh)
      ctx.restore()
    }
  }

  return { canvas, ctx, resize, draw }
}

// ── 밈 엔진 LRU 캐시 ─────────────────────────────────
const MAX_CACHED_MEMES = 1

interface MemeEntry {
  engine:   GifEngine
  renderer: ReturnType<typeof makeCanvasRenderer>
}

const memeCache   = new Map<string, MemeEntry>()
const lruOrder:     string[] = []
const loadingSet  = new Set<string>()

function touchLRU(id: string): void {
  const idx = lruOrder.indexOf(id)
  if (idx !== -1) lruOrder.splice(idx, 1)
  lruOrder.push(id)
}

function evictLRU(): void {
  while (memeCache.size >= MAX_CACHED_MEMES) {
    const evictId = lruOrder.shift()!
    const entry   = memeCache.get(evictId)
    if (entry) { entry.engine.stop(); memeCache.delete(evictId) }
    console.log(`[cache] evicted: ${evictId}`)
  }
}

async function loadMemeEngine(id: string): Promise<MemeEntry | null> {
  if (memeCache.has(id)) { touchLRU(id); return memeCache.get(id)! }
  if (loadingSet.has(id)) return null

  loadingSet.add(id)
  evictLRU()
  ensureScene(id)

  const renderer = makeCanvasRenderer(`${id}-canvas`)
  const gif = new GifEngine()
  const buf = await new Promise<ArrayBuffer | null>(resolve => {
    window.electronAPI.onGifData((memeId, b) => { if (memeId === id) resolve(b) })
    window.electronAPI.getGif(id)
  })

  loadingSet.delete(id)
  if (!buf) return null

  await gif.load(buf)
  const entry: MemeEntry = { engine: gif, renderer }
  memeCache.set(id, entry)
  touchLRU(id)
  return entry
}

// ── 씬 전환 ──────────────────────────────────────────
let activeMeme = 'nyan-cat'
const scenes: Record<string, HTMLElement | null> = {
  'oiia-cat': document.getElementById('scene-oiia'),
  'nyan-cat':  document.getElementById('scene-nyan')
}

// GIF 기반 새 밈: scene div + canvas 동적 생성 — memes.ts + 파일만 추가하면 됨
function ensureScene(id: string): void {
  if (scenes[id]) return
  const existing = document.getElementById(`scene-${id}`)
  if (existing) { scenes[id] = existing; return }
  const scene = document.createElement('div')
  scene.id = `scene-${id}`
  scene.className = 'scene'
  const canvas = document.createElement('canvas')
  canvas.id = `${id}-canvas`
  canvas.style.cssText = 'width:100%;height:100%'
  scene.appendChild(canvas)
  document.getElementById('combo-display')?.before(scene)
  scenes[id] = scene
}

function showMeme(id: string): void {
  activeMeme = id
  ensureScene(id)
  Object.entries(scenes).forEach(([k, el]) => el?.classList.toggle('active', k === id))

  memeCache.forEach((entry, memeId) => { if (memeId !== id) entry.engine.stop() })

  const entry = memeCache.get(id)
  if (entry) {
    entry.engine.start()
  } else {
    loadMemeEngine(id).then(e => { if (e && activeMeme === id) e.engine.start() })
  }
}

// ── 통합 렌더 루프 ────────────────────────────────────
let currentRate  = 0
let targetRate   = 0
let currentState = 'idle'

let _lastTs  = 0
let _logTick = 0
function renderLoop(ts: number): void {
  const dt = _lastTs > 0 ? Math.min(ts - _lastTs, 100) : 0
  _lastTs   = ts
  const lerpK = targetRate > currentRate ? 0.45 : 0.12
  currentRate += (targetRate - currentRate) * lerpK

  const entry = memeCache.get(activeMeme)
  if (entry) {
    // nyan-cat은 최소 1× 보장
    const r = activeMeme === 'nyan-cat' ? Math.max(1.0, currentRate) : currentRate
    entry.engine.setRate(r)
    entry.renderer.draw(entry.engine, dt, currentRate, currentRank)
  }

  if (++_logTick % 60 === 0) {
    console.log(`[render] rate=${currentRate.toFixed(2)} meme=${activeMeme} frames=${entry?.engine.frameCount} cached=${memeCache.size}`)
  }
  requestAnimationFrame(renderLoop)
}

// ── WPM / 상태 / 콤보 랭크 수신 ─────────────────────────
const wpmDisplay  = document.getElementById('wpm-label')
const rankDisplay = document.getElementById('rank-label')
const comboEl     = document.getElementById('combo-display')
const RANK_ORDER  = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS']
let   currentRank = 'D'

function onWpmUpdate(wpm: number): void {
  if (wpmDisplay) wpmDisplay.textContent = `${wpm} TPM`
  targetRate = 0.5 + Math.pow(wpm / 40, 2)
}

function onStateChange(state: string, _speed: number): void {
  currentState = state
}

const WAVE_RANKS = new Set(['S', 'SS', 'SSS'])

function setRankText(el: HTMLElement, rank: string): void {
  if (WAVE_RANKS.has(rank)) {
    const delay = 0.07
    el.innerHTML = [...rank].map((ch, i) =>
      `<span style="animation-delay:${(i*delay).toFixed(2)}s,${(i*delay).toFixed(2)}s">${ch}</span>`
    ).join('')
  } else {
    el.textContent = rank
  }
}

const GLOW_RANKS = new Set(['A', 'S', 'SS', 'SSS'])
let glowMaskBuilding = false

function onComboUpdate(rank: string): void {
  if (!rankDisplay || !comboEl) return
  const prevIdx = RANK_ORDER.indexOf(currentRank)
  const nextIdx = RANK_ORDER.indexOf(rank)
  currentRank = rank

  // A 랭크 첫 진입 시 glow mask 지연 빌드
  if (GLOW_RANKS.has(rank) && !glowMaskBuilding) {
    glowMaskBuilding = true
    const entry = memeCache.get(activeMeme)
    entry?.engine.buildGlowMask()
  }

  document.body.dataset.rank = rank
  comboEl.className = `rank-${rank}`
  setRankText(rankDisplay, rank)

  if (nextIdx > prevIdx) {
    rankDisplay.style.transition = ''
    rankDisplay.style.transform  = 'scale(1.9)'
    requestAnimationFrame(() => requestAnimationFrame(() => {
      rankDisplay!.style.transition = 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)'
      rankDisplay!.style.transform  = 'scale(1)'
    }))
  }
}

// ── 초기화 ───────────────────────────────────────────
window.addEventListener('load', async () => {
  window.electronAPI.onMemeConfig((config) => showMeme(config.id))
  window.electronAPI.onSpeedUpdate(onWpmUpdate)
  window.electronAPI.onComboUpdate(onComboUpdate)
  window.electronAPI.onStateUpdate(onStateChange)
  requestAnimationFrame(renderLoop)
  await loadMemeEngine(activeMeme)
  showMeme(activeMeme)
})
