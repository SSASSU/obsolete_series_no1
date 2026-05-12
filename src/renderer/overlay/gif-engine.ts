interface Frame {
  bitmap: ImageBitmap
  delay:  number   // ms
}

export class GifEngine {
  naturalWidth  = 0
  naturalHeight = 0

  private frames:    Frame[]       = []
  private glowMask:  ImageBitmap[] = []  // lazy — buildGlowMask() 첫 호출 시 생성
  private rawBuf:    ArrayBuffer | null = null
  private idx        = 0
  private elapsed    = 0
  private rate       = 1.0
  running             = false
  lerpProgress        = 1
  loadPhase           = 0  // 0=idle, 1=loading, 2=lerp
  private forceMsPerFrame: number | null = null

  async load(buf: ArrayBuffer): Promise<void> {
    this.loadPhase = 1
    this.rawBuf    = buf

    await new Promise<void>(r => setTimeout(r, 0))  // yield — 펄스 바 첫 그리기 기회

    let frameCount = 0
    let resolveLoad!: () => void
    const loadDone = new Promise<void>(r => { resolveLoad = r })

    // GIF 디코딩을 별도 Worker 스레드에서 실행 — 메인 스레드 블로킹 없음
    const worker = new Worker(new URL('./gif-worker.ts', import.meta.url), { type: 'module' })

    worker.onmessage = ({ data: msg }) => {
      if (msg.type === 'meta') {
        this.naturalWidth  = msg.W
        this.naturalHeight = msg.H
        frameCount         = msg.frameCount
      } else if (msg.type === 'frame') {
        this.frames.push({ bitmap: msg.bitmap, delay: msg.delay })
        // 첫 프레임 도착 — 즉시 재생 시작, 진행 바로 전환
        if (this.frames.length === 1) {
          this.idx       = 0
          this.elapsed   = 0
          this.loadPhase = 2
          this.running   = true
        }
        this.lerpProgress = (msg.index + 1) / Math.max(frameCount, 1)
      } else if (msg.type === 'done') {
        worker.terminate()
        resolveLoad()
      }
    }
    worker.onerror = (e) => {
      console.error('[gif-worker]', e)
      worker.terminate()
      resolveLoad()
    }

    // buf를 복사해 Worker에 전달 — 원본은 glow mask 생성용으로 보관
    const workerBuf = buf.slice(0)
    worker.postMessage({ buf: workerBuf, forGlowMask: false }, [workerBuf])

    await loadDone  // Worker 완료까지 대기 (메인 스레드는 자유롭게 실행)

    const rawFrames = [...this.frames]
    const W = this.naturalWidth, H = this.naturalHeight
    this.lerpProgress = 0
    console.log(`[GifEngine] ${W}×${H}, ${rawFrames.length} raw frames ready, lerp expanding in background`)

    // lerp 확장은 백그라운드에서 — 완료 후 교체
    this.lerpExpand(rawFrames, W, H, 24).then(expanded => {
      const ratio = rawFrames.length > 0 ? this.idx / rawFrames.length : 0
      this.frames  = expanded
      this.idx     = Math.min(Math.floor(ratio * expanded.length), expanded.length - 1)
      this.lerpProgress = 1
      this.loadPhase    = 0
      const delays = expanded.map(f => f.delay)
      console.log(`[GifEngine] lerp done: ${expanded.length} frames, delay ${Math.min(...delays)}~${Math.max(...delays)}ms`)
    })
  }

  private async lerpExpand(src: Frame[], W: number, H: number, targetFps = 60): Promise<Frame[]> {
    const result: Frame[] = []
    const msPerFrame = 1000 / targetFps
    const MAX_EFFECTIVE_DELAY = 100
    for (let i = 0; i < src.length; i++) {
      this.lerpProgress = i / src.length
      const curr = src[i]
      const next = src[(i + 1) % src.length]
      const effectiveDelay = Math.min(curr.delay, MAX_EFFECTIVE_DELAY)
      const steps = Math.max(1, Math.round(effectiveDelay / msPerFrame))
      const stepDelay = effectiveDelay / steps
      result.push({ bitmap: curr.bitmap, delay: stepDelay })
      for (let s = 1; s < steps; s++) {
        result.push({ bitmap: await this.lerpBitmap(curr.bitmap, next.bitmap, s / steps, W, H), delay: stepDelay })
      }
    }
    return result
  }

  private async lerpBitmap(a: ImageBitmap, b: ImageBitmap, t: number, W: number, H: number): Promise<ImageBitmap> {
    const oc  = new OffscreenCanvas(W, H)
    const ctx = oc.getContext('2d', { willReadFrequently: true })!

    ctx.drawImage(a, 0, 0)
    const dA = ctx.getImageData(0, 0, W, H).data

    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(b, 0, 0)
    const dB = ctx.getImageData(0, 0, W, H).data

    const out = ctx.createImageData(W, H)
    const d   = out.data
    const inv = 1 - t
    for (let i = 0; i < d.length; i += 4) {
      const aA = dA[i+3], aB = dB[i+3]
      const alpha = aA * inv + aB * t
      d[i+3] = alpha
      if (alpha > 0) {
        // premultiplied alpha 보간 — 투명 픽셀 색상이 경계에 번지지 않음
        d[i]   = (dA[i]   * aA * inv + dB[i]   * aB * t) / alpha
        d[i+1] = (dA[i+1] * aA * inv + dB[i+1] * aB * t) / alpha
        d[i+2] = (dA[i+2] * aA * inv + dB[i+2] * aB * t) / alpha
      } else {
        d[i] = d[i+1] = d[i+2] = 0
      }
    }
    ctx.putImageData(out, 0, 0)
    return createImageBitmap(oc)
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
