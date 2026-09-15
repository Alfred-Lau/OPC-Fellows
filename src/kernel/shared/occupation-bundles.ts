import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DshBundleManifest } from './dsh-manifest.ts'
import { OPC_PROFILE_NAME } from './opc-profile.ts'

/**
 * 已经在 Electron `ctx.tools` 上挂了工具的内置职业。
 * 桌面 Panel 仍走 `src/modules/*.ts`。记下在 dsh 树上挂 `notes_add`；
 * 刷新态势 / 收款 / 选品仍是空入口，不在这一刀重写业务。
 * 停用时回写 `{ id: opc-<id>, disabled: true }`。
 */
export const OCCUPATION_TOOL_BUNDLES = [
  { id: 'notes', packageName: 'ownworkbuddy-occupation-notes', dirName: 'occupation-notes' },
  { id: 'monitor', packageName: 'ownworkbuddy-occupation-monitor', dirName: 'occupation-monitor' },
  { id: 'payments', packageName: 'ownworkbuddy-occupation-payments', dirName: 'occupation-payments' },
  { id: 'micro', packageName: 'ownworkbuddy-occupation-micro', dirName: 'occupation-micro' },
] as const

export type OccupationToolId = (typeof OCCUPATION_TOOL_BUNDLES)[number]['id']

/** 内置职业与 occupation 包共用的 `dsh.bundle` 声明。路径相对包根。 */
export const OCCUPATION_DSH_BUNDLE: DshBundleManifest = { patch: './cordis.patch.yml' }

export interface OccupationPackageRef {
  id: OccupationToolId
  name: string
  dir: string
}

export function occupationPackageDir(repoRoot: string, dirName: string): string {
  return join(repoRoot, 'packages', dirName)
}

export function occupationPackageDirs(repoRoot: string): OccupationPackageRef[] {
  const refs: OccupationPackageRef[] = []
  for (const row of OCCUPATION_TOOL_BUNDLES) {
    const dir = occupationPackageDir(repoRoot, row.dirName)
    const manifestPath = join(dir, 'package.json')
    if (!existsSync(manifestPath)) {
      continue
    }
    const pkg = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: unknown }
    if (typeof pkg.name !== 'string' || pkg.name !== row.packageName) {
      continue
    }
    refs.push({ id: row.id, name: pkg.name, dir })
  }
  return refs
}

/** asar 里没有 packages/，打包后再看 extraResources。 */
export function occupationSearchRoots(appPath: string, resourcesPath?: string): string[] {
  const roots: string[] = []
  for (const root of [appPath, resourcesPath]) {
    if (root && !roots.includes(root)) {
      roots.push(root)
    }
  }
  return roots
}

export function occupationPackageDirsFromRoots(roots: readonly string[]): OccupationPackageRef[] {
  const seen = new Set<OccupationToolId>()
  const refs: OccupationPackageRef[] = []
  for (const root of roots) {
    for (const ref of occupationPackageDirs(root)) {
      if (seen.has(ref.id)) {
        continue
      }
      seen.add(ref.id)
      refs.push(ref)
    }
  }
  return refs
}

export function profileDependencyNames(profilePkg: unknown): string[] {
  if (!profilePkg || typeof profilePkg !== 'object') {
    return []
  }
  const dependencies = (profilePkg as { dependencies?: unknown }).dependencies
  if (!dependencies || typeof dependencies !== 'object') {
    return []
  }
  return Object.keys(dependencies as Record<string, unknown>)
}

/** 已经写进 opc `dependencies` 的职业包不再 `dsh plugin add`。 */
export function occupationDirsToAdd(
  profilePkg: unknown,
  refs: readonly OccupationPackageRef[],
): string[] {
  const installed = new Set(profileDependencyNames(profilePkg))
  return refs.filter((ref) => !installed.has(ref.name)).map((ref) => ref.dir)
}

export function occupationPluginAddArgv(dirs: readonly string[]): string[] {
  return ['plugin', '--profile', OPC_PROFILE_NAME, 'add', ...dirs]
}
