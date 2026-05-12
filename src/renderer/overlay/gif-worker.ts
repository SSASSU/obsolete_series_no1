import { parseGIF, decompressFrame } from 'gifuct-js'

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

self.onmessage = async (e: MessageEvent<WorkerInput>) => {
  const { buf, forGlowMask } = e.data

  const gif = parseGIF(buf)
  const W = gif.lsd.width
  const H = gif.lsd.height
  const frameCount = gif.frames.length

  const hasTransparency = gif.frames.some(
    (f: any) => f.transparentIndex != null && f.transparentIndex >= 0
  )

  ;(self as any).postMessage({ type: 'meta', W, H, frameCount })

  const oc  = new OffscreenCanvas(W, H)
  const ctx = oc.getContext('2d', { willReadFrequently: true })!
  ctx.clearRect(0, 0, W, H)

  let prevDisposal = 2
  let snapshot: ImageData | null = null

  for (let i = 0; i < gif.frames.length; i++) {
    const raw = decompressFrame(gif.frames[i], gif.gct, true) as any

    if (hasTransparency && !forGlowMask) {
      switch (prevDisposal) {
        case 2: ctx.clearRect(0, 0, W, H); break
        case 3: if (snapshot) ctx.putImageData(snapshot, 0, 0); break
        default: break
      }
    } else {
      ctx.clearRect(0, 0, W, H)
    }

    if (!forGlowMask && (raw.disposalType ?? 0) === 3) {
      snapshot = ctx.getImageData(0, 0, W, H)
    }

    const tmp = new OffscreenCanvas(raw.dims.width, raw.dims.height)
    tmp.getContext('2d')!.putImageData(
      new ImageData(new Uint8ClampedArray(raw.patch), raw.dims.width, raw.dims.height),
      0, 0
    )
    ctx.drawImage(tmp, raw.dims.left, raw.dims.top)

    if (!hasTransparency || forGlowMask) {
      removeBackgroundFlood(ctx, W, H, 32, forGlowMask)
    }

    const bitmap = await createImageBitmap(oc)
    const delay  = Math.max((raw.delay ?? 10) * 10, 20)

    ;(self as any).postMessage({ type: 'frame', bitmap, delay, index: i }, [bitmap])

    prevDisposal = raw.disposalType ?? 0
  }

  ;(self as any).postMessage({ type: 'done' })
}
