const { readdirSync, rmSync } = require('fs')
const { join } = require('path')

const KEEP = new Set(['en-US.pak', 'ko.pak'])

exports.default = async ({ appOutDir }) => {
  const localesDir = join(appOutDir, 'locales')
  for (const file of readdirSync(localesDir)) {
    if (!KEEP.has(file)) rmSync(join(localesDir, file))
  }
  console.log(`  • locales pruned — kept: ${[...KEEP].join(', ')}`)
}
