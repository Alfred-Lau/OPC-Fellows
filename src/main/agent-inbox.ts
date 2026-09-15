import type { AgentInboxInput, AgentInboxResult } from '../shared/agent-inbox'
import { planAgentInbox } from '../shared/agent-inbox'
import { addTodos, listTodos, updateTodo } from './todo-store'
import { scheduleTodo } from './todo-notify'
import { broadcastTodosChanged } from './todo-broadcast'

export function ingestAgentTodos(input: AgentInboxInput): AgentInboxResult {
  const plan = planAgentInbox(listTodos(), input)
  const created = addTodos(plan.create, input.source.trim() || input.agentId)
  const updated = plan.update.flatMap((patch) => {
    const next = updateTodo(patch.id, {
      title: patch.title,
      note: patch.note,
      notifyAt: patch.notifyAt,
      tags: patch.tags,
    })
    return next ? [next] : []
  })

  for (const todo of [...created, ...updated]) {
    scheduleTodo(todo)
  }
  if (created.length > 0 || updated.length > 0) {
    broadcastTodosChanged()
  }

  return {
    created,
    updated,
    skipped: plan.skipped,
  }
}
