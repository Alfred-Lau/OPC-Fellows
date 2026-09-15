const { execFileSync } = require('node:child_process')
const { existsSync, rmSync } = require('node:fs')
const { join } = require('node:path')

/** extraResources 会丢掉 node_modules；打包后再把 vendor 的 dsh 整树拷进 Resources。 */
module.exports = async function afterPack(context) {
  const src = join(context.packager.projectDir, 'resources', 'dsh')
  const bin = join(src, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  if (!existsSync(bin)) {
    throw new Error(`afterPack: 先跑 node scripts/vendor-dsh.mjs，缺少 ${bin}`)
  }

  const dest =
    context.electronPlatformName === 'darwin'
      ? join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources',
          'dsh',
        )
      : join(context.appOutDir, 'resources', 'dsh')

  rmSync(dest, { recursive: true, force: true })
  execFileSync('rsync', [
    '-aL',
    '--exclude',
    'node_modules/.bin',
    '--exclude',
    '.opc-vendor-stamp',
    `${src}/`,
    `${dest}/`,
  ])
  rmSync(join(dest, 'node_modules', '.bin'), { recursive: true, force: true })
  if (!existsSync(join(dest, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'))) {
    throw new Error(`afterPack: 拷贝后仍找不到 dsh bin（${dest}）`)
  }
}
