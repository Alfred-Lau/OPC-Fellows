import type { AgentInboxInput, AgentInboxResult } from '../shared/agent-inbox'
import { ingestAgentTodos } from './agent-inbox'

/**
 * 跨模块写待办的薄入口。内核起来之后换成 ctx.todos.ingest，
 * 这样 sink 扩展点才能收到变化；没起来时退回原来的直写。
 */
let ingest = ingestAgentTodos

export function setTodoIngest(next: (input: AgentInboxInput) => AgentInboxResult): void {
  ingest = next
}

export function ingestTodos(input: AgentInboxInput): AgentInboxResult {
  return ingest(input)
}
