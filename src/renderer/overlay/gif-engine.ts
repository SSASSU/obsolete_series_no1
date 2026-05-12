import { parseGIF, decompressFrames } from 'gifuct-js'

// 4 모서리에서 flood fill — 배경과 연결된 픽셀만 제거해 객체 경계 보존
// forceRemove=true: 배경이 어두워도 강제 제거 (glow 마스크 전용)
function removeBackgroundFlood(
  ctx: OffscreenCanvasRenderingContext2D,
  w: number, h: number,
  threshold = 32,
  forceRemove = false
): void {
  const data    = ctx.getImageData(0, 0, w, h)
  const d       = data.data
  const visited = new Uint8Array(w * h)
  const queue   = new Int32Array(w * h)
  let head = 0, tail = 0

  const corners = [0, w - 1, (h - 1) * w, (h - 1) * w + (w - 1)]
  let bgR = 0, bgG = 0, bgB = 0
  for (const c of corners) { bgR += d[c*4]; bgG += d[c*4+1]; bgB += d[c*4+2] }
  bgR = Math.round(bgR / 4); bgG = Math.round(bgG / 4); bgB = Math.round(bgB / 4)

  // 어두운 배경은 제거하지 않음 (glow 마스크용 forceRemove는 예외)
  if (!forceRemove && (bgR + bgG + bgB) / 3 < 80) return

  const seed = (idx: number) => {
    if (visited[idx]) return
    visited[idx] = 1
    queue[tail++] = idx
  }

  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x) }
  for (let y = 1; y < h - 1; y++) { seed(y * w); seed(y * w + w - 1) }

  while (head < tail) {
    const idx = queue[head++]
    const pi  = idx * 4
    if (d[pi+3] === 0) continue
    if (Math.abs(d[pi]   - bgR) > threshold ||
        Math.abs(d[pi+1] - bgG) > threshold ||
        Math.abs(d[pi+2] - bgB) > threshold) continue
    d[pi] = d[pi+1] = d[pi+2] = d[pi+3] = 0
    const x = idx % w, y = (idx / w) | 0
    if (x > 0)     seed(idx - 1)
    if (x < w - 1) seed(idx + 1)
    if (y > 0)     seed(idx - w)
    if (y < h - 1) seed(idx + w)
  }

  ctx.putImageData(data, 0, 0)
}

interface Frame {
  bitmap: ImageBitmap
  delay:  number   // ms
}

export class GifEngine {
  naturalWidth  = 0
  naturalHeight = 0

  private frames:    Frame[]       = []
  private glowMask:  ImageBitmap[] = []  // cat 실루엣 마스크 (glow 전용, 16프레임)
  private idx        = 0
  private elapsed    = 0
  private rate       = 1.0
  running             = false
  private forceMsPerFrame: number | null = null

  async load(buf: ArrayBuffer): Promise<void> {
    const gif = parseGIF(buf)
    const raw = decompressFrames(gif, true)

    this.naturalWidth  = gif.lsd.width
    this.naturalHeight = gif.lsd.height

    const W = this.naturalWidth
    const H = this.naturalHeight

    const hasTransparency = raw.some(
      f => (f as { transparentIndex?: number }).transparentIndex != null &&
           (f as { transparentIndex?: number }).transparentIndex! >= 0
    )

    const oc  = new OffscreenCanvas(W, H)
    const ctx = oc.getContext('2d', { willReadFrequently: true })!
    ctx.clearRect(0, 0, W, H)

    // glow 마스크용 캔버스 (항상 flood fill 적용 — 배경 밝기 무관)
    const oc2  = new OffscreenCanvas(W, H)
    const ctx2 = oc2.getContext('2d', { willReadFrequently: true })!
    ctx2.clearRect(0, 0, W, H)

    let prevDisposal = 2
    let snapshot: ImageData | null = null
    const bitmaps: Frame[]       = []
    const glowBitmaps: ImageBitmap[] = []

    for (const f of raw) {
      if (hasTransparency) {
        switch (prevDisposal) {
          case 2: ctx.clearRect(0, 0, W, H);                    break
          case 3: if (snapshot) ctx.putImageData(snapshot, 0, 0); break
          default: break
        }
      } else {
        ctx.clearRect(0, 0, W, H)
      }
      ctx2.clearRect(0, 0, W, H)

      if ((f.disposalType ?? 0) === 3) {
        snapshot = ctx.getImageData(0, 0, W, H)
      }

      const tmp    = new OffscreenCanvas(f.dims.width, f.dims.height)
      const tmpCtx = tmp.getContext('2d')!
      tmpCtx.putImageData(
        new ImageData(new Uint8ClampedArray(f.patch), f.dims.width, f.dims.height),
        0, 0
      )
      ctx.drawImage(tmp, f.dims.left, f.dims.top)
      ctx2.drawImage(tmp, f.dims.left, f.dims.top)

      if (!hasTransparency) {
        removeBackgroundFlood(ctx, W, H)   // 배경 밝으면 제거, 어두우면 유지
        removeBackgroundFlood(ctx2, W, H, 32, true)  // 항상 제거 (glow 마스크)
      }

      bitmaps.push({
        bitmap: await createImageBitmap(oc),
        delay:  Math.max((f.delay ?? 10) * 10, 20)
      })
      glowBitmaps.push(await createImageBitmap(oc2))

      prevDisposal = f.disposalType ?? 0
    }

    this.frames   = await this.lerpExpand(bitmaps, W, H, 60)
    this.glowMask = glowBitmaps   // 16프레임 — 메모리 절약, blur로 계단 안 보임
    this.idx      = 0
    this.elapsed  = 0

    const delays = bitmaps.map(f => f.delay)
    const minDelay = Math.min(...delays)
    const maxDelay = Math.max(...delays)
    console.log(`[GifEngine] ${W}×${H}, ${bitmaps.length} frames → lerp ${this.frames.length}frames, hasTransparency=${hasTransparency}`)
    console.log(`[GifEngine] delay range: ${minDelay}ms ~ ${maxDelay}ms (avg ${Math.round(delays.reduce((a,b)=>a+b,0)/delays.length)}ms)`)
  }

  private async lerpExpand(src: Frame[], W: number, H: number, targetFps = 60): Promise<Frame[]> {
    const result: Frame[] = []
    const msPerFrame = 1000 / targetFps
    // 느린 GIF (>100ms/frame) 는 100ms로 캡핑 → ~10fps 기준으로 lerp 생성
    // 그렇지 않으면 500ms GIF가 8초 사이클로 느리게 보임
    const MAX_EFFECTIVE_DELAY = 100
    for (let i = 0; i < src.length; i++) {
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
        // premultiplied alpha 보간 — 투명 픽셀의 색상이 경계에 번지지 않음
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

  /** GIF 내장 딜레이 무시하고 목표 fps 고정 */
  setForceFps(fps: number): void {
    this.forceMsPerFrame = 1000 / fps
  }

  start(): void { if (this.frames.length) this.running = true }
  stop():  void { this.running = false }

  drawTo(
    ctx: CanvasRenderingContext2D,
    dx: number, dy: number,
    dw: number, dh: number
  ): void {
    const f = this.frames[this.idx]
    if (!f) return
    ctx.drawImage(f.bitmap, dx, dy, dw, dh)
  }

  // cat 실루엣 마스크로 그리기 — shadowBlur 글로우 전용
  drawGlowTo(
    ctx: CanvasRenderingContext2D,
    dx: number, dy: number,
    dw: number, dh: number
  ): void {
    if (!this.glowMask.length) return
    const ratio  = this.frames.length ? this.idx / this.frames.length : 0
    const maskIdx = Math.floor(ratio * this.glowMask.length) % this.glowMask.length
    ctx.drawImage(this.glowMask[maskIdx], dx, dy, dw, dh)
  }

  get isLoaded():   boolean { return this.frames.length > 0 }
  get frameCount(): number  { return this.frames.length }

  /** renderLoop에서 draw 직전에 호출. dt = 실제 경과 ms */
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
