import { moduleIdFromPackageName, parseDshBundle } from './dsh-manifest.ts'
import type { Capability, ModuleKind, ModuleManifest } from './module.ts'

export interface PackageManifest extends ModuleManifest {
  main: string
}

export interface ModulePackageJson {
  name?: string
  version?: string
  main?: string
  ownworkbuddy?: Partial<PackageManifest>
  dsh?: {
    bundle?: { patch?: string }
    profile?: { bundles?: string[] }
  }
}

/**
 * 从第三方模块的 package.json 读出契约。
 * 优先 `ownworkbuddy`；没有 id 但声明了 `dsh.bundle` 的包仍算模块（后台形态，无 Panel）。
 */
export function parseModulePackage(pkg: ModulePackageJson | null | undefined): PackageManifest | null {
  const declared = pkg?.ownworkbuddy
  const bundle = parseDshBundle(pkg)
  if (declared && typeof declared.id === 'string' && declared.id) {
    const kind: ModuleKind = declared.kind === 'window' || declared.kind === 'background' ? declared.kind : 'view'
    return {
      id: declared.id,
      title: declared.title ?? declared.id,
      mark: (declared.mark ?? declared.id.slice(0, 1)).slice(0, 1),
      description: declared.description ?? '',
      kind,
      version: declared.version ?? pkg?.version ?? '0.0.0',
      group: declared.group ?? '第三方',
      order: typeof declared.order === 'number' ? declared.order : 500,
      ...(declared.accelerator ? { accelerator: declared.accelerator } : {}),
      inject: Array.isArray(declared.inject) ? declared.inject : ['bridge', 'workbench'],
      ...(Array.isArray(declared.optional) ? { optional: declared.optional } : {}),
      capabilities: Array.isArray(declared.capabilities) ? (declared.capabilities as Capability[]) : [],
      namespaces: Array.isArray(declared.namespaces) ? declared.namespaces : [declared.id],
      removable: true,
      main: declared.main ?? pkg?.main ?? 'index.js',
      ...(typeof declared.ui === 'string' && declared.ui.trim() ? { ui: declared.ui.trim() } : {}),
      ...(bundle ? { dshBundle: bundle } : {}),
    }
  }
  if (!bundle) {
    return null
  }
  const id = moduleIdFromPackageName(pkg?.name)
  if (!id) {
    return null
  }
  return {
    id,
    title: pkg?.name ?? id,
    mark: id.slice(0, 1),
    description: '',
    kind: 'background',
    version: pkg?.version ?? '0.0.0',
    group: '第三方',
    order: 500,
    inject: ['bridge', 'workbench'],
    capabilities: [],
    namespaces: [id],
    removable: true,
    main: pkg?.main ?? 'index.js',
    dshBundle: bundle,
  }
}
