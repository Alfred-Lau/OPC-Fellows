export type ToolEventStatus = 'running' | 'ok' | 'error'

export interface ToolEvent {
  threadId?: string
  agentId?: string
  name: string
  status: ToolEventStatus
  detail?: string
}

export function formatToolEventLine(event: ToolEvent): string {
  switch (event.status) {
    case 'running':
      return event.detail?.trim() || `${toolRunningLabel(event.name)}…`
    case 'ok':
      return `已完成 ${toolCardTitle(event.name)}`
    case 'error':
      return `${toolCardTitle(event.name)} 失败${event.detail ? `：${event.detail}` : ''}`
    default: {
      const exhaustive: never = event.status
      return exhaustive
    }
  }
}

export function toolCardTitle(name: string): string {
  switch (name) {
    case 'write':
    case 'fs_write':
    case 'edit':
    case 'apply_patch':
      return '写文件'
    case 'read':
    case 'fs_read':
      return '读文件'
    case 'bash':
    case 'shell':
      return '跑命令'
    case 'todo_write':
    case 'todos_write':
    case 'kernel_todo':
      return '待办'
    case 'grep':
      return '搜索'
    case 'glob':
      return '找文件'
    case 'notes_add':
      return '记下'
    case 'agent_delegate':
      return '子任务'
    default:
      return name.replace(/_/g, ' ')
  }
}

export function toolRunningLabel(name: string): string {
  switch (name) {
    case 'write':
    case 'fs_write':
    case 'edit':
    case 'apply_patch':
      return '正在写文件'
    case 'read':
    case 'fs_read':
      return '正在读文件'
    case 'bash':
    case 'shell':
      return '正在跑命令'
    case 'todo_write':
    case 'todos_write':
    case 'kernel_todo':
      return '正在更新待办'
    case 'grep':
      return '正在搜索'
    case 'glob':
      return '正在找文件'
    default:
      return `正在调用 ${toolCardTitle(name)}`
  }
}

export function summarizeToolCall(name: string, args: Record<string, unknown> | undefined): string {
  const path = stringArg(args, ['path', 'file_path', 'filePath', 'file', 'target_file'])
  const command = stringArg(args, ['command', 'cmd'])
  const pattern = stringArg(args, ['pattern', 'glob', 'query', 'glob_pattern'])
  const text = stringArg(args, ['text', 'content'])
  switch (name) {
    case 'write':
    case 'fs_write':
    case 'edit':
    case 'apply_patch':
      return path ? `正在写 ${shortToolPath(path)}` : ''
    case 'read':
    case 'fs_read':
      return path ? `正在读 ${shortToolPath(path)}` : ''
    case 'bash':
    case 'shell':
      return command ? `正在跑 ${clipToolText(command, 72)}` : ''
    case 'grep':
      return pattern ? `正在搜 ${clipToolText(pattern, 48)}` : ''
    case 'glob':
      return pattern || path ? `正在找 ${clipToolText(pattern || path, 48)}` : ''
    case 'notes_add':
      return text ? `正在记下 ${clipToolText(text, 48)}` : ''
    default:
      if (path) {
        return `${toolCardTitle(name)} ${shortToolPath(path)}`
      }
      if (command) {
        return clipToolText(command, 72)
      }
      if (pattern) {
        return clipToolText(pattern, 48)
      }
      return ''
  }
}

function stringArg(args: Record<string, unknown> | undefined, keys: readonly string[]): string {
  if (!args) {
    return ''
  }
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function shortToolPath(path: string): string {
  const parts = path.trim().replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean)
  if (parts.length >= 2) {
    return parts.slice(-2).join('/')
  }
  return parts[0] || path
}

function clipToolText(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= max) {
    return trimmed
  }
  return `${trimmed.slice(0, max)}…`
}
