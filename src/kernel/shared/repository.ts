import type { ModuleManifest } from './module'

export type SourceKind = 'local' | 'git'

export interface ModuleSourceRef {
  id: string
  kind: SourceKind
  location: string
  label: string
}

export interface AvailableModule {
  sourceId: string
  manifest: ModuleManifest
  installed: boolean
  /** 已装版本与源里的版本不同则可升级。 */
  upgradable: boolean
}

export interface InstallResult {
  ok: boolean
  error?: string
  manifest?: ModuleManifest
}
