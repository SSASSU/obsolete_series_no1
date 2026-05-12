interface Frame { bitmap: ImageBitmap; delay: number }

export class SequenceEngine {
  naturalWidth  = 0
  naturalHeight = 0

  private frames:  Frame[] = []
  private idx      = 0
  private elapsed  = 0
  private rate     = 1.0
  running          = false

  async load(timelineUrl: string): Promise<void> {
    const res      = await fetch(timelineUrl)
    const timeline = await res.json() as {
      width: number; height: number
      frames: { image: string; duration_ms: number }[]
    }

    this.naturalWidth  = timeline.width
    this.naturalHeight = timeline.height

    const base = timelineUrl.substring(0, timelineUrl.lastIndexOf('/') + 1)

    const BATCH = 50
    const all   = timeline.frames
    for (let i = 0; i < all.length; i += BATCH) {
      const batch = all.slice(i, i + BATCH)
      const loaded = await Promise.all(batch.map(async f => {
        const r      = await fetch(base + f.image)
        const blob   = await r.blob()
        const bitmap = await createImageBitmap(blob)
        return { bitmap, delay: f.duration_ms }
      }))
      this.frames.push(...loaded)
    }

    console.log(`[SequenceEngine] ${this.naturalWidth}×${this.naturalHeight}, ${this.frames.length}프레임 로드 완료`)
  }

  setRate(r: number): void { this.rate = r }

  start(): void { if (this.frames.length) this.running = true }
  stop():  void { this.running = false }

  /** renderLoop에서 draw 직전에 호출. dt = 실제 경과 ms */
  tick(dt: number): void {
    if (!this.running || this.rate <= 0 || !this.frames.length) return
    this.elapsed += dt * this.rate
    let delay = this.frames[this.idx]?.delay ?? 16
    while (this.elapsed >= delay) {
      this.elapsed -= delay
      this.idx = (this.idx + 1) % this.frames.length
      delay    = this.frames[this.idx]?.delay ?? 16
    }
  }

  drawTo(ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number): void {
    const f = this.frames[this.idx]
    if (f) ctx.drawImage(f.bitmap, dx, dy, dw, dh)
  }

  get isLoaded():   boolean { return this.frames.length > 0 }
  get frameCount(): number  { return this.frames.length }
}
