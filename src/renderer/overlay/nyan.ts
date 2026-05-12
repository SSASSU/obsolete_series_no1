import { GifEngine } from './gif-engine'

const C = {
  bg:      '#000014',
  rainbow: ['#ff4040','#ff9900','#ffee00','#44dd44','#4488ff','#bb44ff'],
  starLg:  '#ffffaa',
  starSm:  '#aaaaff',
}

interface Star { x: number; y: number; big: boolean }

function initStars(w: number, h: number, count = 28): Star[] {
  return Array.from({ length: count }, (_, i) => ({
    x:   (i / count) * w * 1.4,
    y:   (Math.sin(i * 1.7 + 0.5) * 0.5 + 0.5) * h,
    big: i % 5 === 0
  }))
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, big: boolean): void {
  ctx.fillStyle = big ? C.starLg : C.starSm
  if (big) {
    ctx.fillRect(x - 3, y - 1, 6, 2)
    ctx.fillRect(x - 1, y - 3, 2, 6)
  } else {
    ctx.fillRect(x - 1, y - 1, 2, 2)
  }
}

export class NyanRenderer {
  private canvas:  HTMLCanvasElement
  private ctx:     CanvasRenderingContext2D
  private stars:   Star[]
  private engine:  GifEngine
  private bobPh  = 0
  private rate   = 0.3
  private last   = 0
  private raf    = 0
  private ready  = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx    = canvas.getContext('2d')!
    this.resize()
    this.stars  = initStars(canvas.width, canvas.height)
    this.engine = new GifEngine()
    window.addEventListener('resize', () => {
      this.resize()
      this.stars = initStars(canvas.width, canvas.height)
    })
  }

  async loadGif(buf: ArrayBuffer): Promise<void> {
    await this.engine.load(buf)
    this.ready = true
  }

  resize(): void {
    const p = this.canvas.parentElement!
    this.canvas.width  = p.clientWidth  || 480
    this.canvas.height = p.clientHeight || 120
  }

  setRate(r: number): void {
    this.rate = r
    this.engine.setRate(r)
  }

  start(): void {
    this.engine.start()
    this.raf = requestAnimationFrame(ts => this.tick(ts))
  }

  stop(): void {
    this.engine.stop()
    cancelAnimationFrame(this.raf)
  }

  private tick(ts: number): void {
    const dt = Math.min(ts - this.last, 50)
    this.last = ts
    this.draw(dt)
    this.raf = requestAnimationFrame(t => this.tick(t))
  }

  private draw(dt: number): void {
    const { canvas: cv, ctx, stars, rate } = this
    const W = cv.width, H = cv.height

    ctx.fillStyle = C.bg
    ctx.fillRect(0, 0, W, H)

    // 별
    stars.forEach(s => {
      s.x -= s.big ? rate * dt * 0.12 : rate * dt * 0.08
      if (s.x < -8) s.x = W + 8
      drawStar(ctx, s.x, s.y, s.big)
    })

    this.bobPh += rate * dt * 0.003
    const catH  = H * 0.75
    const catW  = this.ready
      ? catH * (this.engine.naturalWidth / this.engine.naturalHeight)
      : catH
    const catX  = W * 0.55
    const catCY = H * 0.5 + Math.sin(this.bobPh * Math.PI * 2) * (H * 0.06)
    const catY  = catCY - catH / 2

    // 무지개 — 캐릭터 높이에 맞춰 수직 중앙 정렬
    const stripeH    = catH / 6
    const rainbowY   = catY
    const rainbowRight = catX - 4
    C.rainbow.forEach((color, i) => {
      ctx.fillStyle = color
      ctx.fillRect(0, rainbowY + i * stripeH, rainbowRight, stripeH)
    })

    // GIF 프레임 렌더
    if (this.ready) {
      this.engine.drawTo(ctx, catX, catY, catW, catH)
    }
  }
}
