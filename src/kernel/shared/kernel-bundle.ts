/**
 * Electron 主进程这棵 Cordis 树的组合顺序。
 * 权威文件是 `src/kernel/cordis.patch.yml`；运行时用这份表静态 plugin，避开 asar 动态 import。
 */
export const KERNEL_PLUGINS = [
  { id: 'opc-bridge', name: 'ownworkbuddy-kernel/bridge' },
  { id: 'opc-storage', name: 'ownworkbuddy-kernel/storage' },
  { id: 'opc-workbench', name: 'ownworkbuddy-kernel/workbench' },
  { id: 'opc-modules', name: 'ownworkbuddy-kernel/modules' },
  { id: 'opc-todos', name: 'ownworkbuddy-kernel/todos' },
  { id: 'opc-catalog', name: 'ownworkbuddy-kernel/catalog' },
  { id: 'opc-profile', name: 'ownworkbuddy-kernel/profile' },
  { id: 'opc-repository', name: 'ownworkbuddy-kernel/repository' },
  { id: 'opc-llm', name: 'ownworkbuddy-kernel/llm' },
  { id: 'opc-tools', name: 'ownworkbuddy-kernel/tools' },
  { id: 'opc-dsh-runtime', name: 'ownworkbuddy-kernel/dsh-runtime' },
  { id: 'opc-kernel-work', name: 'ownworkbuddy-kernel/kernel-work' },
  { id: 'opc-agents', name: 'ownworkbuddy-kernel/agents' },
] as const

export type KernelPluginId = (typeof KERNEL_PLUGINS)[number]['id']

export const KERNEL_PLUGIN_IDS: readonly KernelPluginId[] = KERNEL_PLUGINS.map((row) => row.id)

export interface KernelPluginRow {
  id: string
  name: string
}

export function parseKernelInserts(value: unknown): KernelPluginRow[] {
  if (!Array.isArray(value)) {
    throw new Error('内核 cordis.patch.yml 必须是 YAML 数组')
  }
  const rows: KernelPluginRow[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue
    }
    const insert = (entry as { insert?: unknown }).insert
    if (!Array.isArray(insert)) {
      continue
    }
    for (const row of insert) {
      if (!row || typeof row !== 'object') {
        continue
      }
      const id = (row as { id?: unknown }).id
      const name = (row as { name?: unknown }).name
      if (typeof id === 'string' && id && typeof name === 'string' && name) {
        rows.push({ id, name })
      }
    }
  }
  return rows
}

export function assertKernelInserts(rows: readonly KernelPluginRow[]): void {
  if (rows.length !== KERNEL_PLUGINS.length) {
    throw new Error(`内核 patch 应有 ${String(KERNEL_PLUGINS.length)} 个插件，实际 ${String(rows.length)}`)
  }
  rows.forEach((row, index) => {
    const expected = KERNEL_PLUGINS[index]
    if (!expected || row.id !== expected.id || row.name !== expected.name) {
      throw new Error(`内核 patch 第 ${String(index)} 项应为 ${expected?.id ?? '?'}/${expected?.name ?? '?'}，实际 ${row.id}/${row.name}`)
    }
  })
}
