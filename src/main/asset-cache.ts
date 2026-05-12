import { app, net } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'

export async function getCachedAsset(url: string, filename: string): Promise<string> {
  const cacheDir = join(app.getPath('userData'), 'cache')
  mkdirSync(cacheDir, { recursive: true })
  const cachePath = join(cacheDir, filename)

  if (!existsSync(cachePath)) {
    const res = await net.fetch(url)
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
    const buf = await res.arrayBuffer()
    writeFileSync(cachePath, Buffer.from(buf))
  }

  return cachePath
}
