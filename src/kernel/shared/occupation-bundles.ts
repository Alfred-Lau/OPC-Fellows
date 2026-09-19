import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DshBundleManifest } from './dsh-manifest.ts'
import { OPC_PROFILE_NAME } from './opc-profile.ts'

/**
 * 开源版不再随包附带 occupation-* 职业包。dsh 树上只挂 opc-kernel。
 */
export const OCCUPATION_TOOL_BUNDLES: readonly { id: string; packageName: string; dirName: string }[] = []

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
