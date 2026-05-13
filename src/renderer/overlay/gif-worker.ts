import { parseGIF, decompressFrames } from 'gifuct-js'

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

interface WorkerInput {
  buf: ArrayBuffer
  forGlowMask: boolean
}

const TARGET_FPS   = 24
const MS_PER_FRAME = 1000 / TARGET_FPS
const MAX_DELAY    = 100

self.onmessage = async (e: MessageEvent<WorkerInput>) => {
  try {
    const { buf, forGlowMask } = e.data

    const gif       = parseGIF(buf)
    const W         = gif.lsd.width
    const H         = gif.lsd.height
    const rawFrames = decompressFrames(gif, true) as any[]

    if (!rawFrames.length) { ;(self as any).postMessage({ type: 'done' }); return }

    // 최종 프레임 수 계산 (lerp 포함)
    const totalFrames = forGlowMask
      ? rawFrames.length
      : rawFrames.reduce((s, f) => {
          const delay = Math.max((f.delay ?? 10) * 10, 20)
          return s + Math.max(1, Math.round(Math.min(delay, MAX_DELAY) / MS_PER_FRAME))
        }, 0)

    ;(self as any).postMessage({ type: 'meta', W, H, frameCount: totalFrames })

    const oc  = new OffscreenCanvas(W, H)
    const ctx = oc.getContext('2d', { willReadFrequently: true })!

    if (forGlowMask) {
      // 글로우 마스크: raw 프레임, 배경 제거
      for (let i = 0; i < rawFrames.length; i++) {
        const f = rawFrames[i]
        ctx.clearRect(0, 0, W, H)
        const tmp = new OffscreenCanvas(f.dims.width, f.dims.height)
        tmp.getContext('2d')!.putImageData(
          new ImageData(new Uint8ClampedArray(f.patch), f.dims.width, f.dims.height), 0, 0
        )
        ctx.drawImage(tmp, f.dims.left, f.dims.top)
        removeBackgroundFlood(ctx, W, H, 32, true)
        const bitmap = await createImageBitmap(oc)
        ;(self as any).postMessage(
          { type: 'frame', bitmap, delay: Math.max((f.delay ?? 10) * 10, 20), index: i },
          [bitmap]
        )
      }
    } else {
      // 메인 렌더: raw → 픽셀 배열, CPU lerp 확장, 비트맵 전송
      const pixelFrames: { pixels: Uint8ClampedArray; delay: number }[] = []
      for (const f of rawFrames) {
        if (f.disposalType >= 2) ctx.clearRect(0, 0, W, H)
        const tmp = new OffscreenCanvas(f.dims.width, f.dims.height)
        tmp.getContext('2d')!.putImageData(
          new ImageData(new Uint8ClampedArray(f.patch), f.dims.width, f.dims.height), 0, 0
        )
        ctx.drawImage(tmp, f.dims.left, f.dims.top)
        pixelFrames.push({
          pixels: new Uint8ClampedArray(ctx.getImageData(0, 0, W, H).data),
          delay:  Math.max((f.delay ?? 10) * 10, 20),
        })
      }

      let index = 0
      for (let i = 0; i < pixelFrames.length; i++) {
        const curr = pixelFrames[i]
        const next = pixelFrames[(i + 1) % pixelFrames.length]
        const effectiveDelay = Math.min(curr.delay, MAX_DELAY)
        const steps     = Math.max(1, Math.round(effectiveDelay / MS_PER_FRAME))
        const stepDelay = effectiveDelay / steps

        // 원본 프레임 전송
        ctx.putImageData(new ImageData(curr.pixels, W, H), 0, 0)
        const b0 = await createImageBitmap(oc)
        ;(self as any).postMessage({ type: 'frame', bitmap: b0, delay: stepDelay, index: index++ }, [b0])

        // 보간 프레임 전송
        for (let s = 1; s < steps; s++) {
          const t = s / steps, inv = 1 - t
          const cP = curr.pixels, nP = next.pixels
          const blend = new Uint8ClampedArray(cP.length)
          for (let j = 0; j < blend.length; j += 4) {
            const aA = cP[j+3], aB = nP[j+3]
            const alpha = aA * inv + aB * t
            blend[j+3] = alpha
            if (alpha > 0) {
              blend[j]   = (cP[j]   * aA * inv + nP[j]   * aB * t) / alpha
              blend[j+1] = (cP[j+1] * aA * inv + nP[j+1] * aB * t) / alpha
              blend[j+2] = (cP[j+2] * aA * inv + nP[j+2] * aB * t) / alpha
            }
          }
          ctx.putImageData(new ImageData(blend, W, H), 0, 0)
          const bN = await createImageBitmap(oc)
          ;(self as any).postMessage({ type: 'frame', bitmap: bN, delay: stepDelay, index: index++ }, [bN])
        }
      }
    }

    ;(self as any).postMessage({ type: 'done' })
  } catch (err) {
    ;(self as any).postMessage({ type: 'error', message: String(err) })
  }
}
