const { readdirSync, rmSync, existsSync } = require('fs')
const { join } = require('path')

const KEEP = new Set(['en-US.pak', 'ko.pak'])

exports.default = async ({ appOutDir }) => {
  const localesDir = join(appOutDir, 'locales')
  // mac 빌드는 locales가 .app/Contents/Frameworks/... 내부에 있어 이 경로엔 없음 — skip
  if (!existsSync(localesDir)) {
    console.log(`  • locales pruning skipped (no ${localesDir})`)
    return
  }
  for (const file of readdirSync(localesDir)) {
    if (!KEEP.has(file)) rmSync(join(localesDir, file))
  }
  console.log(`  • locales pruned — kept: ${[...KEEP].join(', ')}`)
}
