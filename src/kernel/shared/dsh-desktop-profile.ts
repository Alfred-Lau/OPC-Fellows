/**
 * Electron 独占的 desktop profile。
 * CLI 拒绝 `--profile desktop`；组合走官方 `initProfile` + `loadProfileDirectory`。
 * 能 in-process 时官方 `boot()` 挂上 dsh-base 层栈和 opc-kernel 用户补丁；宿主插件仍走 prepare。
 * 花名册是 ctx.roster，不占 ctx.agents。缺 host 才自建 Context。
 * Electron 无 loader internals 时，bare 包名会从 cordis-plugin-loader 解析失败；
 * desktop 用户层把 opc-kernel 的 name 写成 dsh-plugin.js 绝对路径。
 */

import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { load } from 'js-yaml'
import {
  boot,
  DEFAULT_PROFILE_BUNDLES,
  healProfilesModuleFallback,
  initProfile,
  loadOptionalPatches,
  loadProfileDirectory,
  type Profile,
} from '@deepseek-ai/dsh-app-boot'
import {
  dshAppInstallAnchor,
  dshBareModuleBaseUrl,
  dshDesktopProfileDir,
  resolveDesktopHostRoot,
  resolveOpcKernelDir,
} from './dsh-host-layout.ts'

export const DESKTOP_PROFILE_BUNDLES = DEFAULT_PROFILE_BUNDLES
export const DESKTOP_BOOT_BIN = 'dsh'
export const DESKTOP_PROFILE_ROOT = 'cordis.yml'

const DESKTOP_ROOT_CONFIG = `# dsh profile root — an empty entry list. The tree is composed as patches:
# each bundle in package.json's dsh.profile.bundles, then cordis.patch.yml, then any
# --patch overlays. Edit cordis.patch.yml, not this file.
[]
`

export interface ComposedDesktopProfile {
  profile: Profile
  configPath: string
}

const OPC_KERNEL_PACKAGE = 'ownworkbuddy-kernel'
const OPC_KERNEL_PATCH = 'cordis.patch.yml'
const OPC_KERNEL_PLUGIN = 'dsh-plugin.js'

export function rewriteOpcKernelPluginName(yaml: string, pluginPath: string): string {
  return yaml.replace(/^(\s*name:\s*)ownworkbuddy-kernel\s*$/m, `$1${JSON.stringify(pluginPath)}`)
}

function ensureDesktopOpcKernel(dir: string, kernelDir: string): void {
  if (!existsSync(join(kernelDir, 'package.json'))) {
    return
  }
  const pluginPath = join(kernelDir, OPC_KERNEL_PLUGIN)
  const patchPath = join(dir, OPC_KERNEL_PATCH)
  const next = rewriteOpcKernelPluginName(readFileSync(join(kernelDir, OPC_KERNEL_PATCH), 'utf8'), pluginPath)
  if (!existsSync(patchPath) || readFileSync(patchPath, 'utf8') !== next) {
    writeFileSync(patchPath, next)
  }
  const dest = join(dir, 'node_modules', OPC_KERNEL_PACKAGE)
  if (existsSync(dest)) {
    return
  }
  mkdirSync(join(dir, 'node_modules'), { recursive: true })
  symlinkSync(kernelDir, dest)
}

export function composeDesktopProfile(input: {
  home: string
  installAnchor: string
  kernelDir?: string
}): ComposedDesktopProfile {
  const dir = dshDesktopProfileDir(input.home)
  initProfile(dir, [...DESKTOP_PROFILE_BUNDLES], 'startup')
  const kernelDir = input.kernelDir?.trim()
  if (kernelDir) {
    ensureDesktopOpcKernel(dir, kernelDir)
  }
  const profile = loadProfileDirectory(DESKTOP_BOOT_BIN, dir, input.installAnchor)
  const configPath = join(dir, DESKTOP_PROFILE_ROOT)
  writeFileSync(configPath, DESKTOP_ROOT_CONFIG)
  return { profile, configPath }
}

export function parseDesktopOverlayYaml(yaml: string | undefined): Profile['patches'] {
  if (!yaml?.trim()) {
    return []
  }
  const parsed = load(yaml)
  if (!Array.isArray(parsed)) {
    throw new Error('desktop overlay 必须是 YAML 数组')
  }
  return parsed as Profile['patches']
}

export function desktopBootPatches(profile: Profile, home: string, overlays: Profile['patches'] = []) {
  const homePatches = loadOptionalPatches(DESKTOP_BOOT_BIN, join(home, 'cordis.patch.yml')) ?? []
  return [...profile.layers.flatMap((layer) => layer.patches), ...profile.patches, ...homePatches, ...overlays]
}

export async function bootKernelTree(input: {
  hostRoot?: string
  resourcesPath?: string
  appPath?: string
  cwd?: string
  dshHome: string
  applyHost: (ctx: Context) => Promise<void> | void
  overlayYaml?: string
}): Promise<Context> {
  const hostRoot = resolveDesktopHostRoot(input)
  if (!hostRoot) {
    const ctx = new Context()
    await input.applyHost(ctx)
    return ctx
  }
  const installAnchor = dshAppInstallAnchor(hostRoot)
  const kernelDir = resolveOpcKernelDir({ ...input, hostRoot })
  const composed = composeDesktopProfile({
    home: input.dshHome,
    installAnchor,
    ...(kernelDir ? { kernelDir } : {}),
  })
  process.env.DSH_HOME = input.dshHome
  await healProfilesModuleFallback({
    installAnchor,
    profile: composed.profile,
    home: input.dshHome,
  })
  return boot(
    DESKTOP_BOOT_BIN,
    composed.configPath,
    structuredClone(desktopBootPatches(composed.profile, input.dshHome, parseDesktopOverlayYaml(input.overlayYaml))),
    input.applyHost,
    dshBareModuleBaseUrl(composed.configPath),
  )
}
