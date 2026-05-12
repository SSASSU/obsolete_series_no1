const fs  = require('fs')
const { PNG } = require('pngjs')
const { parseGIF, decompressFrames } = require('gifuct-js')

// oiia-cat.gif 첫 프레임 추출
const buf = fs.readFileSync('assets/oiia-cat.gif')
const gif  = parseGIF(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
const frames = decompressFrames(gif, true)
const f0 = frames[0]

const W = gif.lsd.width, H = gif.lsd.height
const src = new PNG({ width: W, height: H })
src.data = Buffer.alloc(W * H * 4)

// patch를 캔버스에 올림
const patch = f0.patch
for (let i = 0; i < f0.dims.width * f0.dims.height; i++) {
  const dx = f0.dims.left + (i % f0.dims.width)
  const dy = f0.dims.top  + Math.floor(i / f0.dims.width)
  const si = i * 4, di = (dy * W + dx) * 4
  src.data[di] = patch[si]; src.data[di+1] = patch[si+1]
  src.data[di+2] = patch[si+2]; src.data[di+3] = patch[si+3]
}

function resize(src, tw, th) {
  const dst = new PNG({ width: tw, height: th })
  dst.data = Buffer.alloc(tw * th * 4)
  const sx = src.width / tw, sy = src.height / th
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const ix = Math.min(Math.floor(x * sx), src.width  - 1)
      const iy = Math.min(Math.floor(y * sy), src.height - 1)
      const si = (iy * src.width + ix) * 4
      const di = (y  * tw         + x)  * 4
      dst.data[di] = src.data[si]; dst.data[di+1] = src.data[si+1]
      dst.data[di+2] = src.data[si+2]; dst.data[di+3] = src.data[si+3]
    }
  }
  return dst
}

const sizes = [16, 32, 48, 256]
const bufs  = sizes.map(s => PNG.sync.write(resize(src, s, s)))

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4)

let offset = 6 + sizes.length * 16
const dirs = bufs.map((b, i) => {
  const d = Buffer.alloc(16)
  const s = sizes[i]
  d.writeUInt8(s === 256 ? 0 : s, 0); d.writeUInt8(s === 256 ? 0 : s, 1)
  d.writeUInt8(0, 2); d.writeUInt8(0, 3)
  d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6)
  d.writeUInt32LE(b.length, 8); d.writeUInt32LE(offset, 12)
  offset += b.length
  return d
})

fs.writeFileSync('resources/icon.ico', Buffer.concat([header, ...dirs, ...bufs]))
fs.writeFileSync('resources/icon.png', bufs[3])
console.log(`완료: ${W}×${H} GIF → ICO (${sizes.join('/')}px)`)
