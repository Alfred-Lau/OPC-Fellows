import type { AgentInboxInput } from '../shared/agent-inbox'
import type { DecomposeInput, DraftTodo, TodoItem } from '../shared/todo'
import type { IpcRegistrar } from '../kernel/main/ipc'
import { ingestAgentTodos } from './agent-inbox'
import { decomposeTodos } from './decompose'
import { broadcastTodosChanged } from './todo-broadcast'
import { cancelTodoSchedule, scheduleTodo } from './todo-notify'
import { addTodos, listTodos, removeTodo, updateTodo, updateTodos } from './todo-store'

export function registerTodoIpc(handle: IpcRegistrar): void {
  handle('todos:list', () => listTodos())
  handle('todos:decompose', async (_event, input: DecomposeInput) => decomposeTodos(input))
  handle('todos:save', (_event, payload: { drafts: DraftTodo[]; source: string }) => {
    const created = addTodos(payload.drafts, payload.source)
    for (const todo of created) {
      scheduleTodo(todo)
    }
    if (created.length > 0) {
      broadcastTodosChanged()
    }
    return created
  })
  handle('todos:ingest-agent', (_event, input: AgentInboxInput) => ingestAgentTodos(input))
  handle('todos:update', (_event, payload: { id: string; done?: boolean; notifyAt?: string | null }) => {
    const next = updateTodo(payload.id, {
      done: payload.done,
      notifyAt: payload.notifyAt,
      notifiedAt: payload.notifyAt !== undefined ? null : undefined,
    })
    if (next) {
      syncTodoSchedule(next)
      broadcastTodosChanged()
    }
    return next
  })
  handle('todos:update-many', (_event, payload: { ids: string[]; done?: boolean; notifyAt?: string | null }) => {
    const ids = Array.isArray(payload?.ids) ? payload.ids.filter((id) => typeof id === 'string') : []
    const updated = updateTodos(ids, {
      done: payload?.done,
      notifyAt: payload?.notifyAt,
      notifiedAt: payload?.notifyAt !== undefined ? null : undefined,
    })
    for (const todo of updated) {
      syncTodoSchedule(todo)
    }
    if (updated.length > 0) {
      broadcastTodosChanged()
    }
    return updated
  })
  handle('todos:remove', (_event, id: string) => {
    cancelTodoSchedule(id)
    const removed = removeTodo(id)
    if (removed) {
      broadcastTodosChanged()
    }
    return removed
  })
}

function syncTodoSchedule(todo: TodoItem): void {
  if (todo.done) {
    cancelTodoSchedule(todo.id)
    return
  }
  scheduleTodo(todo)
}
