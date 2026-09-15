/**
 * 官方 dsh package.json 字段。对齐 `@deepseek-ai/dsh-app-boot` 的
 * `DshBundleManifest` / `DshProfileManifest`：bundle 导出 patch，profile 声明有序 bundles。
 */

export interface DshBundleManifest {
  patch: string
}

export interface DshProfileManifest {
  bundles: string[]
}

export interface DshManifestSection {
  bundle?: DshBundleManifest
  profile?: DshProfileManifest
}

export type ModulePackageShape = 'ownworkbuddy' | 'dsh-bundle' | 'both' | 'none'

/**
 * 包是否声明了官方 bundle。`dsh plugin --profile opc add` 靠这一项把依赖收进层栈。
 */
export function parseDshBundle(pkg: unknown): DshBundleManifest | null {
  const patch = dshSection(pkg)?.bundle?.patch
  if (typeof patch !== 'string' || !patch.trim()) {
    return null
  }
  return { patch: patch.trim() }
}

export function parseDshProfile(pkg: unknown): DshProfileManifest | null {
  const bundles = dshSection(pkg)?.profile?.bundles
  if (!Array.isArray(bundles)) {
    return null
  }
  const names = bundles.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
  return { bundles: names }
}

export function hasOwnworkbuddyId(pkg: unknown): boolean {
  if (!pkg || typeof pkg !== 'object') {
    return false
  }
  const declared = (pkg as { ownworkbuddy?: { id?: unknown } }).ownworkbuddy
  return typeof declared?.id === 'string' && Boolean(declared.id)
}

export function modulePackageShape(pkg: unknown): ModulePackageShape {
  const opc = hasOwnworkbuddyId(pkg)
  const bundle = Boolean(parseDshBundle(pkg))
  if (opc && bundle) {
    return 'both'
  }
  if (opc) {
    return 'ownworkbuddy'
  }
  if (bundle) {
    return 'dsh-bundle'
  }
  return 'none'
}

/** 没有 ownworkbuddy.id 时，用包名收成模块 id：`@scope/ownworkbuddy-hello` → `hello`。 */
export function moduleIdFromPackageName(name: string | undefined): string | null {
  const trimmed = name?.trim()
  if (!trimmed) {
    return null
  }
  const bare = trimmed.includes('/') ? trimmed.slice(trimmed.lastIndexOf('/') + 1) : trimmed
  const stripped = bare.replace(/^ownworkbuddy-/, '').replace(/^opc-/, '')
  return stripped || bare
}

/**
 * 按已装依赖重算 `dsh.profile.bundles`。语义对齐 CLI：
 * 声明了 `dsh.bundle` 的依赖进入层栈；卸掉或不再是 bundle 的依赖离开；模板自带的 in-box 层不动。
 */
export function reconcileProfileBundles(input: {
  bundles: readonly string[]
  dependencies: readonly string[]
  beforeDeps: readonly string[]
  isBundle: (packageName: string) => boolean
}): { bundles: string[]; changed: boolean } {
  const plugins = [...input.bundles]
  const beforeDeps = new Set(input.beforeDeps)
  const dependencySet = new Set(input.dependencies)
  let changed = false
  for (const packageName of input.dependencies) {
    if (input.isBundle(packageName) && !plugins.includes(packageName)) {
      plugins.push(packageName)
      changed = true
    }
  }
  for (const packageName of [...plugins]) {
    const wasDependency = beforeDeps.has(packageName) || dependencySet.has(packageName)
    const stillBundle = dependencySet.has(packageName) && input.isBundle(packageName)
    if (wasDependency && !stillBundle) {
      plugins.splice(plugins.indexOf(packageName), 1)
      changed = true
    }
  }
  return { bundles: plugins, changed }
}

function dshSection(pkg: unknown): DshManifestSection | null {
  if (!pkg || typeof pkg !== 'object') {
    return null
  }
  const dsh = (pkg as { dsh?: unknown }).dsh
  if (!dsh || typeof dsh !== 'object') {
    return null
  }
  return dsh as DshManifestSection
}
