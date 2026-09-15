import type { ModuleEntry, WorkbenchConfig } from './module'

export const CONFIG_VERSION = 1

/** 把任意输入收成合法的 workbench.yml 结构。坏掉的条目直接丢掉，不让整个配置失效。 */
export function normalizeWorkbenchConfig(value: unknown): WorkbenchConfig {
  if (!value || typeof value !== 'object') {
    return { version: CONFIG_VERSION, entries: [] }
  }
  const raw = value as { entries?: unknown }
  const entries = Array.isArray(raw.entries) ? raw.entries.flatMap(normalizeEntry) : []
  return { version: CONFIG_VERSION, entries }
}

function normalizeEntry(value: unknown): ModuleEntry[] {
  if (!value || typeof value !== 'object') {
    return []
  }
  const entry = value as Partial<ModuleEntry>
  if (typeof entry.id !== 'string' || !entry.id) {
    return []
  }
  return [
    {
      id: entry.id,
      name: typeof entry.name === 'string' && entry.name ? entry.name : `builtin:${entry.id}`,
      disabled: entry.disabled === true,
      config: isRecord(entry.config) ? entry.config : {},
      ...(typeof entry.order === 'number' ? { order: entry.order } : {}),
    },
  ]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
