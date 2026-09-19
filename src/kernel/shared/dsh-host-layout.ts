/**
 * 进程内 dsh host 的布局门闩。
 * 官方 loader 要按插件名动态 import；asar 里这条路不通。
 * Electron 独占 `$DSH_HOME/profiles/desktop`，不走 `dsh --profile desktop`。
 * 安装包把 host 放 extraResources/dsh-host，不把 asar 当动态 import 根。
 */

import { createRequire } from 'node:module'
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

export const DSH_DESKTOP_PROFILE = 'desktop'
export const DSH_HOST_RESOURCE = 'dsh-host'
export const DSH_HOST_PACKAGE = 'opc-fellows-dsh-host'
export const OPC_KERNEL_RESOURCE = 'opc-kernel'
export const PACKAGED_NODE_MODULES_LINK = 'node_modules'
const DSH_APP_PACKAGE = '@deepseek-ai/dsh'
const DSH_CORDIS_PACKAGE = '@deepseek-ai/cordis'
const OPC_KERNEL_PLUGIN = 'dsh-plugin.js'

export interface DshHostLookup {
  resourcesPath?: string
  appPath?: string
  cwd?: string
}

function isAsarPath(path: string): boolean {
  const normalized = path.trim().replace(/\\/g, '/')
  if (!normalized || normalized.includes('.asar.unpacked')) {
    return false
  }
  return normalized.includes('.asar/') || normalized.endsWith('.asar')
}

function asarUnpackedDir(appPath: string): string | undefined {
  const asarFile = asarArchivePath(appPath)
  return asarFile ? `${asarFile}.unpacked` : undefined
}

/** asar 文件本身的路径；`app.asar/out/main` 也收成 `app.asar`。 */
function asarArchivePath(appPath: string): string | undefined {
  const trimmed = appPath.trim()
  if (!trimmed || !isAsarPath(trimmed)) {
    return undefined
  }
  const normalized = trimmed.replace(/\\/g, '/')
  const marker = '.asar'
  const index = normalized.indexOf(marker)
  if (index === -1) {
    return undefined
  }
  return trimmed.slice(0, index + marker.length)
}

/** 安装包里 extraResources 和 asar 同级，不靠 process.cwd()。 */
export function resourcesDirOfAsar(appPath: string): string | undefined {
  const asarFile = asarArchivePath(appPath)
  return asarFile ? dirname(asarFile) : undefined
}

export function canBootDshInProcess(appPath: string): boolean {
  return Boolean(appPath.trim()) && !isAsarPath(appPath)
}

export function inProcessHostBlockReason(appPath: string): string | undefined {
  if (!appPath.trim()) {
    return '没有应用路径'
  }
  if (isAsarPath(appPath)) {
    return 'asar 不能动态解析 dsh 插件'
  }
  return undefined
}

export function dshDesktopProfileDir(dshHome: string): string {
  return join(dshHome, 'profiles', DSH_DESKTOP_PROFILE)
}

export function isDshHostRoot(dir: string): boolean {
  return canBootDshInProcess(dir) && existsSync(join(dir, 'package.json'))
}

export function dshHostRootCandidates(input: DshHostLookup): string[] {
  const dirs: string[] = []
  const appPath = input.appPath?.trim()
  const resourcesPath = input.resourcesPath?.trim() || (appPath ? resourcesDirOfAsar(appPath) : undefined)
  if (resourcesPath) {
    dirs.push(join(resourcesPath, DSH_HOST_RESOURCE))
  }
  if (appPath) {
    const unpacked = asarUnpackedDir(appPath)
    if (unpacked) {
      dirs.push(unpacked)
    } else if (canBootDshInProcess(appPath)) {
      dirs.push(appPath)
    }
  }
  const cwd = input.cwd?.trim()
  // 安装包 asar 的 cwd 可能是仓库或 `/`，不能拿来冒充 dsh host。
  if (cwd && canBootDshInProcess(cwd) && !(appPath && isAsarPath(appPath))) {
    dirs.push(cwd)
  }
  return [...new Set(dirs)]
}

export function resolveDshHostRoot(input: DshHostLookup): string | undefined {
  return dshHostRootCandidates(input).find((dir) => isDshHostRoot(dir))
}

/**
 * desktop `boot()` 的 host 根：已是 host 就用；asar 则看旁边 extraResources / unpacked。
 * 缺 host 时返回 undefined，调用方自建 Context，对话再 spawn opc。
 */
export function resolveDesktopHostRoot(input: DshHostLookup & { hostRoot?: string }): string | undefined {
  const given = input.hostRoot?.trim()
  if (given && isDshHostRoot(given)) {
    return given
  }
  return resolveDshHostRoot({
    resourcesPath: input.resourcesPath,
    appPath: input.appPath?.trim() || given,
    cwd: input.cwd,
  })
}

function isOpcKernelDir(dir: string): boolean {
  return existsSync(join(dir, 'package.json')) && existsSync(join(dir, OPC_KERNEL_PLUGIN))
}

/** opc-kernel 在源码树 `packages/`，安装包在 extraResources/opc-kernel，不跟 dsh-host 闭包绑死。 */
export function resolveOpcKernelDir(input: DshHostLookup & { hostRoot?: string }): string | undefined {
  const hostRoot = input.hostRoot?.trim()
  const appPath = input.appPath?.trim()
  const resourcesPath =
    input.resourcesPath?.trim() ||
    (appPath ? resourcesDirOfAsar(appPath) : undefined) ||
    (hostRoot ? resourcesDirOfAsar(hostRoot) : undefined)
  const cwd = input.cwd?.trim()
  const asarLookup = Boolean((appPath && isAsarPath(appPath)) || (hostRoot && isAsarPath(hostRoot)))
  const dirs = [
    hostRoot ? join(hostRoot, 'packages', OPC_KERNEL_RESOURCE) : undefined,
    resourcesPath ? join(resourcesPath, OPC_KERNEL_RESOURCE) : undefined,
    appPath && canBootDshInProcess(appPath) ? join(appPath, 'packages', OPC_KERNEL_RESOURCE) : undefined,
    cwd && canBootDshInProcess(cwd) && !asarLookup ? join(cwd, 'packages', OPC_KERNEL_RESOURCE) : undefined,
  ]
  return dirs.find((dir): dir is string => Boolean(dir) && isOpcKernelDir(dir))
}

export function dshHostInstallAnchor(root: string): string {
  return join(root, 'package.json')
}

export function dshAppInstallAnchor(hostRoot: string): string {
  const require = createRequire(join(hostRoot, 'package.json'))
  return require.resolve('@deepseek-ai/dsh/package.json')
}

/** 官方 `boot()` 第五参：bare 插件名从 desktop profile 解析，不从 Electron `out/main`。 */
export function dshBareModuleBaseUrl(installAnchor: string): string {
  return pathToFileURL(installAnchor).href
}

/** electron-builder afterPack 里 asar 旁的 Resources 目录。 */
export function packagedResourcesDir(input: {
  appOutDir: string
  platform: string
  productFilename: string
}): string {
  if (input.platform === 'darwin') {
    return join(input.appOutDir, `${input.productFilename}.app`, 'Contents', 'Resources')
  }
  return join(input.appOutDir, 'resources')
}

/**
 * 主进程外置了 cordis / dsh-app-boot，asar 里没有 node_modules。
 * 在 Resources 挂相对链接，Node 从 app.asar/out/main 往上走就能解析同一份闭包。
 */
export function linkPackagedNodeModules(resourcesDir: string): string {
  const hostModules = join(resourcesDir, DSH_HOST_RESOURCE, 'node_modules')
  const cordisPkg = join(hostModules, ...DSH_CORDIS_PACKAGE.split('/'), 'package.json')
  if (!existsSync(cordisPkg)) {
    throw new Error('dsh-host 闭包里没有 @deepseek-ai/cordis，主进程无法解析外置依赖')
  }
  const link = join(resourcesDir, PACKAGED_NODE_MODULES_LINK)
  try {
    lstatSync(link)
    rmSync(link, { recursive: true, force: true })
  } catch {
    // 还没有链接。
  }
  symlinkSync(join(DSH_HOST_RESOURCE, 'node_modules'), link)
  return link
}

export function stageDshHost(input: { dest: string; sourceRoot: string }): void {
  const sourcePkgPath = join(input.sourceRoot, 'package.json')
  const version = packageDepVersion(readJson(sourcePkgPath), DSH_APP_PACKAGE)
  if (!version) {
    throw new Error(`sourceRoot 的 package.json 没有 ${DSH_APP_PACKAGE}`)
  }
  mkdirSync(input.dest, { recursive: true })
  rmSync(join(input.dest, 'node_modules'), { recursive: true, force: true })
  writeFileSync(
    join(input.dest, 'package.json'),
    `${JSON.stringify(
      {
        name: DSH_HOST_PACKAGE,
        private: true,
        type: 'module',
        dependencies: { [DSH_APP_PACKAGE]: version },
      },
      null,
      2,
    )}\n`,
  )
  const require = createRequire(sourcePkgPath)
  const copied = new Set<string>()
  const queue: { name: string; from: string; optional: boolean }[] = [
    { name: DSH_APP_PACKAGE, from: sourcePkgPath, optional: false },
  ]
  while (queue.length > 0) {
    const item = queue.shift()
    if (!item || copied.has(item.name)) {
      continue
    }
    copied.add(item.name)
    let pkgPath: string
    try {
      pkgPath = resolvePackageJson(item.from, item.name)
    } catch (error) {
      if (item.optional) {
        continue
      }
      throw error
    }
    const packageDir = dirname(pkgPath)
    const target = join(input.dest, 'node_modules', ...item.name.split('/'))
    mkdirSync(dirname(target), { recursive: true })
    rmSync(target, { recursive: true, force: true })
    cpSync(packageDir, target, {
      recursive: true,
      dereference: true,
      filter: (src) => !relative(packageDir, src).split(/[\\/]/).includes('node_modules'),
    })
    for (const dep of dependencyNames(readJson(pkgPath))) {
      queue.push({ name: dep.name, from: pkgPath, optional: dep.optional })
    }
  }
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

function packageDepVersion(pkg: Record<string, unknown>, name: string): string | undefined {
  for (const field of ['dependencies', 'devDependencies'] as const) {
    const bag = pkg[field]
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) {
      continue
    }
    const version = (bag as Record<string, unknown>)[name]
    if (typeof version === 'string' && version.trim()) {
      return version.trim()
    }
  }
  return undefined
}

function dependencyNames(pkg: Record<string, unknown>): { name: string; optional: boolean }[] {
  const names: { name: string; optional: boolean }[] = []
  const seen = new Set<string>()
  const push = (bag: unknown, optional: boolean) => {
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) {
      return
    }
    for (const name of Object.keys(bag as Record<string, unknown>)) {
      if (seen.has(name)) {
        continue
      }
      seen.add(name)
      names.push({ name, optional })
    }
  }
  // dsh 插件把核心包写在 peerDependencies；不跟 peer 走，安装包会缺 @deepseek-ai/dsh-sandbox 这类包。
  // 没装上的 peer（例如 ws 的 bufferutil）按 optional 跳过，避免打包直接失败。
  push(pkg.dependencies, false)
  push(pkg.peerDependencies, true)
  push(pkg.optionalDependencies, true)
  return names
}

function resolvePackageJson(from: string, name: string): string {
  const require = createRequire(from)
  try {
    return require.resolve(`${name}/package.json`)
  } catch {
    try {
      const entry = require.resolve(name)
      let dir = dirname(entry)
      while (true) {
        const candidate = join(dir, 'package.json')
        if (existsSync(candidate)) {
          return candidate
        }
        const parent = dirname(dir)
        if (parent === dir) {
          break
        }
        dir = parent
      }
    } catch {
      // exports 可能挡住 resolve，改走物理 node_modules。
    }
  }
  const physical = findNodeModulePackageJson(dirname(from), name)
  if (physical) {
    return physical
  }
  throw new Error(`无法解析 dsh host 依赖 ${name}`)
}

function findNodeModulePackageJson(startDir: string, name: string): string | undefined {
  const parts = name.split('/')
  let dir = startDir
  while (true) {
    const candidate = join(dir, 'node_modules', ...parts, 'package.json')
    if (existsSync(candidate)) {
      return candidate
    }
    const parent = dirname(dir)
    if (parent === dir) {
      return undefined
    }
    dir = parent
  }
}
