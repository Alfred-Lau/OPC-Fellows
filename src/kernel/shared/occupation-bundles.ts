import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DshBundleManifest } from './dsh-manifest.ts'
import { OPC_PROFILE_NAME } from './opc-profile.ts'

/**
 * 开源职业包。dsh 树上用 defineTool 注册本职工具，执行仍回 Electron Local API。
 */
export const OCCUPATION_TOOL_BUNDLES: readonly { id: string; packageName: string; dirName: string }[] = [
  {
    id: 'social-ammo',
    packageName: 'ownworkbuddy-occupation-social-ammo',
    dirName: 'occupation-social-ammo',
  },
  {
    id: 'kernel-work',
    packageName: 'ownworkbuddy-occupation-kernel-work',
    dirName: 'occupation-kernel-work',
  },
]

export type OccupationToolId = string

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

export function occupationPluginId(id: string): string {
  return `opc-${id}`
}

export function occupationNativeToolNames(): readonly string[] {
  return [
    'social_load',
    'social_publish',
    'social_metrics',
    'social_recap',
    'todos_list',
    'todos_ingest',
    'todos_done',
    'github_status',
  ] as const
}

export function occupationInsertPatchYaml(
  refs: readonly { id: string; pluginPath: string }[],
): string {
  if (refs.length === 0) {
    return ''
  }
  const lines = ['- insert:']
  for (const ref of refs) {
    lines.push(`    - id: ${occupationPluginId(ref.id)}`)
    lines.push(`      name: ${JSON.stringify(ref.pluginPath)}`)
  }
  return `${lines.join('\n')}\n`
}

export function occupationPluginPath(dir: string): string {
  return join(dir, 'dsh-plugin.js')
}
