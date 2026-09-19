import { Notification } from 'electron'
import { PRODUCT_NAME } from '../shared/brand'
import type { TodoItem } from '../shared/todo'
import { listTodos, updateTodo } from './todo-store'

const timers = new Map<string, NodeJS.Timeout>()
const MAX_TIMEOUT = 2_147_000_000

export type NotifyClick = (todo: TodoItem) => void

let onClick: NotifyClick = () => undefined

export function setNotifyClickHandler(handler: NotifyClick): void {
  onClick = handler
}

export function restoreTodoSchedules(): void {
  for (const todo of listTodos()) {
    scheduleTodo(todo)
  }
}

export function scheduleTodo(todo: TodoItem): void {
  cancelTodoSchedule(todo.id)
  if (todo.done || !todo.notifyAt || todo.notifiedAt) {
    return
  }

  const fireAt = Date.parse(todo.notifyAt)
  if (Number.isNaN(fireAt)) {
    return
  }

  const delay = fireAt - Date.now()
  if (delay <= 0) {
    if (delay > -60_000) {
      showTodoNotification(todo)
    }
    return
  }

  const wait = Math.min(delay, MAX_TIMEOUT)
  timers.set(
    todo.id,
    setTimeout(() => {
      const current = listTodos().find((item) => item.id === todo.id)
      if (!current) {
        return
      }
      if (Date.parse(current.notifyAt ?? '') - Date.now() > 1_000) {
        scheduleTodo(current)
        return
      }
      showTodoNotification(current)
    }, wait),
  )
}

export function cancelTodoSchedule(id: string): void {
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
}

export function showTodoNotification(todo: TodoItem): void {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: `${PRODUCT_NAME} 待办提醒`,
      body: todo.note ? `${todo.title}\n${todo.note}` : todo.title,
      silent: false,
    })
    notification.on('click', () => {
      onClick(todo)
    })
    notification.show()
  }
  updateTodo(todo.id, { notifiedAt: new Date().toISOString() })
  cancelTodoSchedule(todo.id)
}
