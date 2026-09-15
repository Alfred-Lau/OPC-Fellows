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
      return `正在调用 ${event.name}…`
    case 'ok':
      return `已完成 ${event.name}`
    case 'error':
      return `${event.name} 失败${event.detail ? `：${event.detail}` : ''}`
    default: {
      const exhaustive: never = event.status
      return exhaustive
    }
  }
}
