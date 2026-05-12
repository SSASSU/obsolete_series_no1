/**
 * GIF Importer
 * 사용법: npm run import -- <input.gif> <output-dir> [--fps 60]
 *
 * 처리 순서:
 *   1. GIF 디코딩 (disposal / transparency 완전 적용)
 *   2. 완성된 합성 프레임 배열 생성
 *   3. 인접 프레임 간 픽셀 선형 보간 → 목표 FPS 달성
 *   4. PNG 시퀀스 + timeline.json 저장
 */

import { parseGIF, decompressFrames } from 'gifuct-js'
import { PNG } from 'pngjs'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, basename } from 'path'

// ── 인수 파싱 ────────────────────────────────────────
const args = process.argv.slice(2)
const inputPath  = args[0]
const outputDir  = args[1]
const fpsArg     = args.indexOf('--fps')
const targetFps  = fpsArg >= 0 ? Number(args[fpsArg + 1]) : 60

if (!inputPath || !outputDir) {
  console.log('사용법: npm run import -- <input.gif> <output-dir> [--fps 60]')
  process.exit(1)
}

// ── 1. GIF → 합성 프레임 배열 ───────────────────────
function composite(
  raw: ReturnType<typeof decompressFrames>,
  W: number, H: number
): { rgba: Uint8ClampedArray; delay: number }[] {
  const canvas   = new Uint8ClampedArray(W * H * 4)
  const result: { rgba: Uint8ClampedArray; delay: number }[] = []
  let prevDisposal = 2
  let snapshot: Uint8ClampedArray | null = null

  for (const f of raw) {
    // 이전 프레임 disposal 처리
    if      (prevDisposal === 2)              canvas.fill(0)
    else if (prevDisposal === 3 && snapshot)  canvas.set(snapshot)

    // restore 타입이면 그리기 전 스냅샷 저장
    if ((f.disposalType ?? 0) === 3) snapshot = canvas.slice()

    // 패치 적용
    const { left, top, width, height } = f.dims
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const si = (y * width + x) * 4
        const di = ((top + y) * W + (left + x)) * 4
        if (f.patch[si + 3] === 0) continue   // 투명 픽셀 스킵
        canvas[di]     = f.patch[si]
        canvas[di + 1] = f.patch[si + 1]
        canvas[di + 2] = f.patch[si + 2]
        canvas[di + 3] = f.patch[si + 3]
      }
    }

    result.push({
      rgba:  canvas.slice(),
      delay: Math.max((f.delay ?? 10) * 10, 20),
    })
    prevDisposal = f.disposalType ?? 0
  }

  return result
}

// ── 2. 프레임 보간 ───────────────────────────────────
function interpolate(
  frames: { rgba: Uint8ClampedArray; delay: number }[],
  fps: number
): { rgba: Uint8ClampedArray; delay: number }[] {
  const targetDelay = Math.round(1000 / fps)
  const out: { rgba: Uint8ClampedArray; delay: number }[] = []
  const len = frames.length

  for (let i = 0; i < len; i++) {
    const a = frames[i]
    const b = frames[(i + 1) % len]
    const steps = Math.max(1, Math.round(a.delay / targetDelay))

    for (let s = 0; s < steps; s++) {
      const t = s / steps
      const px = new Uint8ClampedArray(a.rgba.length)
      for (let j = 0; j < px.length; j++) {
        px[j] = Math.round(a.rgba[j] * (1 - t) + b.rgba[j] * t)
      }
      out.push({ rgba: px, delay: targetDelay })
    }
  }

  return out
}

// ── 3. PNG 저장 ──────────────────────────────────────
function savePng(rgba: Uint8ClampedArray, W: number, H: number, path: string): void {
  const png  = new PNG({ width: W, height: H })
  png.data   = Buffer.from(rgba)
  writeFileSync(path, PNG.sync.write(png))
}

// ── main ─────────────────────────────────────────────
async function run(): Promise<void> {
  console.log(`\n[import] 입력: ${inputPath}`)
  console.log(`[import] 출력: ${outputDir}`)
  console.log(`[import] 목표 FPS: ${targetFps}\n`)

  const raw = readFileSync(inputPath)
  const ab  = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer
  const gif = parseGIF(ab)
  const frames = decompressFrames(gif, true)

  const W = gif.lsd.width
  const H = gif.lsd.height

  console.log(`[import] GIF 정보: ${W}×${H}, ${frames.length}프레임`)
  const delays = frames.map(f => Math.max((f.delay ?? 10) * 10, 20))
  console.log(`[import] 딜레이: ${Math.min(...delays)}ms ~ ${Math.max(...delays)}ms`)

  process.stdout.write('[import] 합성 중...')
  const composited = composite(frames, W, H)
  console.log(' 완료')

  process.stdout.write(`[import] 보간 중 (→ ${targetFps}fps)...`)
  const interpolated = interpolate(composited, targetFps)
  console.log(` 완료 → ${interpolated.length}프레임\n`)

  mkdirSync(outputDir, { recursive: true })

  const timelineFrames: { image: string; duration_ms: number }[] = []

  for (let i = 0; i < interpolated.length; i++) {
    const filename = `frame_${String(i).padStart(4, '0')}.png`
    savePng(interpolated[i].rgba, W, H, join(outputDir, filename))
    timelineFrames.push({ image: filename, duration_ms: interpolated[i].delay })
    if (i % 20 === 0 || i === interpolated.length - 1) {
      process.stdout.write(`\r[import] PNG 저장: ${i + 1}/${interpolated.length}`)
    }
  }
  console.log()

  const timeline = {
    name:   basename(outputDir),
    width:  W,
    height: H,
    loop:   true,
    frames: timelineFrames,
  }
  writeFileSync(join(outputDir, 'timeline.json'), JSON.stringify(timeline, null, 2))

  console.log(`\n[import] 완료!`)
  console.log(`[import] PNG ${interpolated.length}장, timeline.json → ${outputDir}`)
}

run().catch(e => { console.error(e); process.exit(1) })
