interface Frame {
  bitmap: ImageBitmap
  delay:  number   // ms
}

export class GifEngine {
  naturalWidth  = 0
  naturalHeight = 0

  private frames:   Frame[]       = []
  private glowMask: ImageBitmap[] = []
  private rawBuf:   ArrayBuffer | null = null
  private idx       = 0
  private elapsed   = 0
  private rate      = 1.0
  running            = false
  lerpProgress       = 1
  loadPhase          = 0  // 0=idle, 1=loading, 2=lerp
  private forceMsPerFrame: number | null = null

  async load(buf: ArrayBuffer): Promise<void> {
    this.loadPhase = 1
    this.rawBuf    = buf

    await new Promise<void>(r => setTimeout(r, 0))  // yield — 펄스 바 첫 그리기 기회

    let frameCount = 0
    const worker = new Worker(new URL('./gif-worker.ts', import.meta.url), { type: 'module' })

    worker.onmessage = ({ data: msg }) => {
      if (msg.type === 'error') {
        console.error('[GifEngine] worker error:', msg.message)
        worker.terminate()
        return
      }
      if (msg.type === 'meta') {
        this.naturalWidth  = msg.W
        this.naturalHeight = msg.H
        frameCount         = msg.frameCount
      } else if (msg.type === 'frame') {
        this.frames.push({ bitmap: msg.bitmap, delay: msg.delay })
        if (this.frames.length === 1) {
          this.idx       = 0
          this.elapsed   = 0
          this.loadPhase = 2
          this.running   = true
        }
        this.lerpProgress = (msg.index + 1) / Math.max(frameCount, 1)
      } else if (msg.type === 'done') {
        worker.terminate()
        this.lerpProgress = 1
        this.loadPhase    = 0
        console.log(`[GifEngine] ${this.naturalWidth}×${this.naturalHeight}, ${this.frames.length} frames ready`)
      }
    }
    worker.onerror = (e) => {
      console.error('[GifEngine] worker-error:', e)
      worker.terminate()
    }

    // buf를 복사해 Worker에 전달 — 원본은 glow mask 생성용으로 보관
    const workerBuf = buf.slice(0)
    worker.postMessage({ buf: workerBuf, forGlowMask: false }, [workerBuf])
    // Worker가 백그라운드에서 lerp까지 처리 — 메인 스레드 블로킹 없음
  }

  // ── 공개 API ────────────────────────────────────────────
  setRate(r: number): void {
    if (Math.abs(r - this.rate) > 0.5) console.log(`[GifEngine] rate: ${this.rate.toFixed(2)} → ${r.toFixed(2)}`)
    this.rate = r
  }

  setForceFps(fps: number): void { this.forceMsPerFrame = 1000 / fps }

  start(): void { if (this.frames.length) this.running = true }
  stop():  void { this.running = false }

  drawTo(ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number): void {
    const f = this.frames[this.idx]
    if (!f) return
    ctx.drawImage(f.bitmap, dx, dy, dw, dh)
  }

  // A랭크 첫 진입 시 호출 — glow mask를 그때 생성 (로딩 시간 / RAM 절약)
  async buildGlowMask(): Promise<void> {
    if (this.glowMask.length || !this.rawBuf) return

    const bitmaps: ImageBitmap[] = []
    let resolveGlow!: () => void
    const glowDone = new Promise<void>(r => { resolveGlow = r })

    const worker = new Worker(new URL('./gif-worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data: msg }) => {
      if (msg.type === 'frame') bitmaps.push(msg.bitmap)
      else if (msg.type === 'done') { worker.terminate(); resolveGlow() }
    }
    worker.onerror = (e) => { console.error('[gif-worker glow]', e); worker.terminate(); resolveGlow() }

    const workerBuf = this.rawBuf.slice(0)
    worker.postMessage({ buf: workerBuf, forGlowMask: true }, [workerBuf])

    await glowDone
    this.glowMask = bitmaps
    this.rawBuf   = null  // GC 허용
  }

  drawGlowTo(ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number): void {
    if (!this.glowMask.length) return
    const ratio   = this.frames.length ? this.idx / this.frames.length : 0
    const maskIdx = Math.floor(ratio * this.glowMask.length) % this.glowMask.length
    ctx.drawImage(this.glowMask[maskIdx], dx, dy, dw, dh)
  }

  get isLoaded():   boolean { return this.frames.length > 0 }
  get frameCount(): number  { return this.frames.length }

  tick(dt: number): void {
    if (!this.running || this.rate <= 0 || !this.frames.length) return
    this.elapsed += dt * this.rate
    const delay = this.forceMsPerFrame ?? (this.frames[this.idx]?.delay ?? 100)
    while (this.elapsed >= delay) {
      this.elapsed -= delay
      this.idx = (this.idx + 1) % this.frames.length
    }
  }
}
