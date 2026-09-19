/**
 * 成员可勾选的通用工具包。职业 moduleId 仍走模块；
 * 这里是内核挂上的 fs / 待办 / MCP，不进花名册。
 */

export const TOOL_PACKS = ['kernel', 'workspace', 'mcp-github', 'mcp-browser'] as const

export type ToolPackId = (typeof TOOL_PACKS)[number]

export const KERNEL_TOOL_PACK: ToolPackId = 'kernel'
export const WORKSPACE_TOOL_PACK: ToolPackId = 'workspace'

export function isToolPackId(value: unknown): value is ToolPackId {
  return typeof value === 'string' && (TOOL_PACKS as readonly string[]).includes(value)
}

export function normalizeToolPacks(value: unknown): ToolPackId[] {
  if (!Array.isArray(value)) {
    return []
  }
  const seen = new Set<ToolPackId>()
  const next: ToolPackId[] = []
  for (const item of value) {
    if (!isToolPackId(item) || seen.has(item)) {
      continue
    }
    seen.add(item)
    next.push(item)
  }
  return next
}

export function defaultToolPacks(templateId: string, kind: string): ToolPackId[] {
  switch (templateId) {
    case 'host':
    case 'engineer':
      return ['kernel', 'workspace', 'mcp-github']
    case 'blank':
      return ['kernel', 'workspace']
    default:
      return kind === 'conversational' || kind === 'dashboard' ? ['kernel'] : []
  }
}

export function toolPackTitle(id: ToolPackId): string {
  switch (id) {
    case 'kernel':
      return '待办'
    case 'workspace':
      return '工作区文件与终端'
    case 'mcp-github':
      return 'GitHub'
    case 'mcp-browser':
      return '浏览器抓取'
    default: {
      const exhaustive: never = id
      return exhaustive
    }
  }
}
