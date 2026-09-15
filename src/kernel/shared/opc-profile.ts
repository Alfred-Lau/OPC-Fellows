import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { dump, load } from 'js-yaml'
import { parseDshProfile, type DshProfileManifest } from './dsh-manifest.ts'

/** 工作台自己的 dsh profile 名。对话 session 与职业 / 第三方 bundle 都走 opc。 */
export const OPC_PROFILE_NAME = 'opc'

/** 传给 opc 子进程的工作台 userData，occupation 插件按这个路径读写业务文件。 */
export const OPC_USER_DATA_ENV = 'OPC_USER_DATA'

export const OPC_BASE_BUNDLE = '@deepseek-ai/dsh-base'
export const OPC_SDK_BUNDLE = '@deepseek-ai/dsh-sdk-app'

/**
 * opc 的 in-box 层。对齐官方 `sdk` 模板：base + JSON-RPC 面，后面才是 occupation / 第三方。
 * fs / bash / compaction / jobs 不进全局 bundles：危险工具按成员 toolPacks
 * 挂在 Electron `KernelWorkService`，cwd 是项目文件夹或成员工作区，避免所有会话共享 bash。
 */
export const OPC_PROFILE_BUNDLES = [OPC_BASE_BUNDLE, OPC_SDK_BUNDLE] as const

export const OPC_PROFILE_PACKAGE_NAME = 'dsh-profile-opc'

export const PROFILE_PATCH_FILENAME = 'cordis.patch.yml'

/**
 * 官方 initProfile 写进用户层的空 patch。必须是 YAML 数组；只写注释会炸。
 */
export const OPC_PROFILE_PATCH = `# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; \`!!js\` expressions allowed).
[]
`

export const OPC_PROFILE_PNPM_WORKSPACE = `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
`

export interface OpcProfileManifest {
  name: string
  private: true
  dependencies: Record<string, string>
  dsh: { profile: DshProfileManifest }
}

export function opcProfileManifest(): OpcProfileManifest {
  return {
    name: OPC_PROFILE_PACKAGE_NAME,
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: [...OPC_PROFILE_BUNDLES] } },
  }
}

export function dshHome(): string {
  return process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
}

export function opcProfileDir(home: string = dshHome()): string {
  return join(home, 'profiles', OPC_PROFILE_NAME)
}

/**
 * 官方 sdk 模板是 `[dsh-base, dsh-sdk-app]`。已有 opc 用户层只动这两项的位置，后面的 occupation / 第三方不动。
 */
export function ensureOpcInboxBundles(bundles: readonly string[]): string[] {
  const inbox = new Set<string>(OPC_PROFILE_BUNDLES)
  const rest = bundles.filter((name) => !inbox.has(name))
  return [...OPC_PROFILE_BUNDLES, ...rest]
}

export function healOpcProfileManifest(pkg: unknown): { pkg: Record<string, unknown>; changed: boolean } {
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    return { pkg: opcProfileManifest() as unknown as Record<string, unknown>, changed: true }
  }
  const record = { ...(pkg as Record<string, unknown>) }
  const profile = parseDshProfile(record)
  if (!profile) {
    return { pkg: record, changed: false }
  }
  const bundles = ensureOpcInboxBundles(profile.bundles)
  if (JSON.stringify(bundles) === JSON.stringify(profile.bundles)) {
    return { pkg: record, changed: false }
  }
  const dsh = record.dsh && typeof record.dsh === 'object' && !Array.isArray(record.dsh)
    ? { ...(record.dsh as Record<string, unknown>) }
    : {}
  const inner = dsh.profile && typeof dsh.profile === 'object' && !Array.isArray(dsh.profile)
    ? { ...(dsh.profile as Record<string, unknown>) }
    : {}
  return {
    pkg: {
      ...record,
      dsh: { ...dsh, profile: { ...inner, bundles } },
    },
    changed: true,
  }
}

/**
 * 在 `$DSH_HOME/profiles/opc` 落下官方形状。已有 package.json 只愈合 in-box 层，不覆盖用户依赖。
 * 内核服务仍在 Electron 里 applyOpcKernel；这棵树收 occupation-* 与第三方 `dsh.bundle`。
 */
export function ensureOpcProfile(home: string): string {
  const dir = opcProfileDir(home)
  mkdirSync(dir, { recursive: true })
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) {
    writeFileSync(manifestPath, `${JSON.stringify(opcProfileManifest(), undefined, 2)}\n`)
  } else {
    try {
      const current = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown
      const healed = healOpcProfileManifest(current)
      if (healed.changed) {
        writeFileSync(manifestPath, `${JSON.stringify(healed.pkg, undefined, 2)}\n`)
      }
    } catch {
      // 坏掉的用户层不动，对话启动时再报。
    }
  }
  const patchPath = join(dir, PROFILE_PATCH_FILENAME)
  if (!existsSync(patchPath)) {
    writeFileSync(patchPath, OPC_PROFILE_PATCH)
  }
  const workspacePath = join(dir, 'pnpm-workspace.yaml')
  if (!existsSync(workspacePath)) {
    writeFileSync(workspacePath, OPC_PROFILE_PNPM_WORKSPACE)
  }
  return dir
}

export function isOpcProfileManifest(pkg: unknown): boolean {
  const profile = parseDshProfile(pkg)
  if (!profile) {
    return false
  }
  return OPC_PROFILE_BUNDLES.every((bundle) => profile.bundles.includes(bundle))
}

export function dshPluginId(moduleId: string): string {
  return `opc-${moduleId}`
}

export interface OpcPatchModule {
  id: string
  disabled: boolean
  dshBundle?: { patch: string }
}

/** 只动 `{ id, disabled: true }` 这种光杆停用层，不碰 insert 和带 config 的覆盖。 */
export function syncOpcUserPatch(current: unknown, modules: readonly OpcPatchModule[]): unknown[] {
  const patches = Array.isArray(current) ? [...current] : []
  const bundled = modules.filter((module) => module.dshBundle)
  const managed = new Set(bundled.map((module) => dshPluginId(module.id)))
  const kept = patches.filter((entry) => {
    const id = bareDisableId(entry)
    return !id || !managed.has(id)
  })
  for (const module of bundled) {
    if (module.disabled) {
      kept.push({ id: dshPluginId(module.id), disabled: true })
    }
  }
  return kept
}

export function formatOpcUserPatch(patches: unknown[]): string {
  if (patches.length === 0) {
    return OPC_PROFILE_PATCH
  }
  const header = OPC_PROFILE_PATCH.slice(0, OPC_PROFILE_PATCH.lastIndexOf('[]'))
  return `${header}${dump(patches, { lineWidth: 120, noRefs: true, sortKeys: false })}`
}

export function readCordisPatchList(text: string): unknown[] {
  const parsed = load(text) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('cordis.patch.yml 必须是 YAML 数组')
  }
  return parsed
}

/** 把 workbench 里第三方 dsh.bundle 的停用写进 opc 用户层。失败不抛，免得挡桌面配置。 */
export function writeOpcWorkbenchPatch(home: string, modules: readonly OpcPatchModule[]): void {
  const dir = ensureOpcProfile(home)
  const path = join(dir, PROFILE_PATCH_FILENAME)
  let current: unknown[] = []
  if (existsSync(path)) {
    current = readCordisPatchList(readFileSync(path, 'utf8'))
  }
  const next = syncOpcUserPatch(current, modules)
  if (JSON.stringify(current) === JSON.stringify(next)) {
    return
  }
  writeFileSync(path, formatOpcUserPatch(next))
}

function bareDisableId(entry: unknown): string | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null
  }
  const keys = Object.keys(entry)
  if (keys.length !== 2 || !keys.includes('id') || !keys.includes('disabled')) {
    return null
  }
  const row = entry as { id?: unknown; disabled?: unknown }
  if (typeof row.id !== 'string' || !row.id || row.disabled !== true) {
    return null
  }
  return row.id
}
