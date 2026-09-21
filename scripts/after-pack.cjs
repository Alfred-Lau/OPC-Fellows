const { execFileSync } = require('node:child_process')
const { existsSync, lstatSync, readdirSync, rmSync, symlinkSync } = require('node:fs')
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

  const stagedHost = join(context.packager.projectDir, 'build', 'dsh-host')
  if (!existsSync(join(stagedHost, 'package.json'))) {
    throw new Error('afterPack: 先跑 node --experimental-strip-types scripts/stage-dsh-host.mjs，安装包必须带 extraResources/dsh-host 才能官方 boot()')
  }
  const packagesDir = join(context.packager.projectDir, 'packages')
  const occupations = readdirSync(packagesDir).filter((name) => name.startsWith('occupation-'))
  if (occupations.length === 0) {
    throw new Error('afterPack: 缺少 packages/occupation-* 职业包')
  }
  for (const name of occupations) {
    const occupation = join(packagesDir, name, 'dsh-plugin.js')
    if (!existsSync(occupation)) {
      throw new Error(`afterPack: 缺少职业包 ${occupation}`)
    }
  }
  const hostDest =
    context.electronPlatformName === 'darwin'
      ? join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources',
          'dsh-host',
        )
      : join(context.appOutDir, 'resources', 'dsh-host')
  rmSync(hostDest, { recursive: true, force: true })
  execFileSync('rsync', ['-aL', `${stagedHost}/`, `${hostDest}/`])
  const resourcesDir = join(hostDest, '..')
  const link = join(resourcesDir, 'node_modules')
  try {
    lstatSync(link)
    rmSync(link, { recursive: true, force: true })
  } catch {
    // 还没有链接。
  }
  symlinkSync(join('dsh-host', 'node_modules'), link)
}
