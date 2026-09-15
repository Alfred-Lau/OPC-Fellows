import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'resources', 'dsh')
const bin = join(dest, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const stampPath = join(dest, '.opc-vendor-stamp')
const VENDOR_STAMP = '2'
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = rootPkg.devDependencies?.['@deepseek-ai/dsh']
if (typeof version !== 'string' || !version) {
  throw new Error('package.json 缺少 @deepseek-ai/dsh 版本，无法 vendor。')
}

if (
  vendoredVersion() === stripRange(version) &&
  existsSync(bin) &&
  existsSync(join(dest, 'node_modules', '@deepseek-ai', 'cordis-plugin-group', 'package.json')) &&
  readStamp() === VENDOR_STAMP
) {
  console.log(`dsh vendor 已是 ${version}，跳过安装`)
  process.exit(0)
}

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
writeFileSync(
  join(dest, 'package.json'),
  `${JSON.stringify(
    {
      name: 'opc-dsh-runtime',
      private: true,
      dependencies: { '@deepseek-ai/dsh': version, ...peerDependencies(rootPkg, version) },
      pnpm: {
        onlyBuiltDependencies: (rootPkg.pnpm?.onlyBuiltDependencies ?? []).filter(
          (name) => name !== 'electron',
        ),
        overrides: rootPkg.pnpm?.overrides ?? {},
      },
    },
    undefined,
    2,
  )}\n`,
)
writeFileSync(
  join(dest, '.npmrc'),
  ['node-linker=hoisted', 'auto-install-peers=true', 'ignore-workspace-root-check=true'].join('\n'),
)

execFileSync('pnpm', ['install', '--prod', '--ignore-workspace'], {
  cwd: dest,
  stdio: 'inherit',
})

if (!existsSync(bin)) {
  throw new Error(`vendor 完成但找不到 ${bin}`)
}
execFileSync(process.execPath, [bin, '--help'], { cwd: dest, stdio: 'pipe' })
writeFileSync(stampPath, `${VENDOR_STAMP}\n`)
console.log(`已 vendor @deepseek-ai/dsh@${version} -> resources/dsh`)

function peerDependencies(pkg, dshVersion) {
  const extras = {
    '@deepseek-ai/dsh-hook-protocol': dshVersion,
    '@deepseek-ai/dsh-sdk-protocol': dshVersion,
    '@deepseek-ai/dsh-util-time': dshVersion,
    '@deepseek-ai/dsh-util-workspace-path': dshVersion,
  }
  const fromOverrides = Object.fromEntries(
    Object.entries(pkg.pnpm?.overrides ?? {}).map(([name, spec]) => [
      name,
      spec === '$@deepseek-ai/dsh' ? dshVersion : spec,
    ]),
  )
  return { ...extras, ...fromOverrides }
}

function stripRange(spec) {
  return spec.replace(/^[~^]/, '')
}

function readStamp() {
  try {
    return readFileSync(stampPath, 'utf8').trim()
  } catch {
    return ''
  }
}

function vendoredVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(dest, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8'))
    return typeof pkg.version === 'string' ? pkg.version : null
  } catch {
    return null
  }
}
