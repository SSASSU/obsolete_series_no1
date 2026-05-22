const { readdirSync, rmSync, existsSync } = require('fs')
const { join } = require('path')

const KEEP = new Set(['en-US.pak', 'ko.pak'])

function prunePakDir(dir) {
  let removed = 0
  for (const file of readdirSync(dir)) {
    if (file.endsWith('.pak') && !KEEP.has(file)) {
      rmSync(join(dir, file))
      removed++
    }
  }
  return removed
}

exports.default = async ({ appOutDir }) => {
  // Windows / Linux: <appOutDir>/locales/*.pak
  const winLocalesDir = join(appOutDir, 'locales')
  if (existsSync(winLocalesDir)) {
    const removed = prunePakDir(winLocalesDir)
    console.log(`  • locales pruned (${removed} removed) — kept: ${[...KEEP].join(', ')}`)
    return
  }

  // macOS: <appOutDir>/<AppName>.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/*.pak
  const apps = readdirSync(appOutDir).filter(f => f.endsWith('.app'))
  for (const app of apps) {
    const resPath = join(
      appOutDir, app,
      'Contents/Frameworks/Electron Framework.framework/Versions/A/Resources'
    )
    if (existsSync(resPath)) {
      const removed = prunePakDir(resPath)
      console.log(`  • [${app}] locales pruned (${removed} removed) — kept: ${[...KEEP].join(', ')}`)
    }
  }
}
