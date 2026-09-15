import { addDays, dayKey, pad2 } from './datetime.ts'
import type { TodoItem } from './todo.ts'

export type CalendarMode = 'day' | 'week' | 'month'

export interface CalendarRange {
  start: Date
  end: Date
}

export interface PlacedTodo {
  id: string
  title: string
  day: string
  hour: number | null
  minute: number
  untimed: boolean
  done: boolean
  tags: string[]
  notifyAt: string | null
}

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'] as const

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function startOfWeek(date: Date): Date {
  const day = startOfDay(date)
  const weekday = day.getDay()
  const offset = weekday === 0 ? -6 : 1 - weekday
  return addDays(day, offset)
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function monthGrid(anchor: Date): Date[] {
  const first = startOfWeek(startOfMonth(anchor))
  return Array.from({ length: 42 }, (_, index) => addDays(first, index))
}

export function calendarRange(anchor: Date, mode: CalendarMode): CalendarRange {
  switch (mode) {
    case 'day': {
      const start = startOfDay(anchor)
      return { start, end: addDays(start, 1) }
    }
    case 'week': {
      const start = startOfWeek(anchor)
      return { start, end: addDays(start, 7) }
    }
    case 'month': {
      const cells = monthGrid(anchor)
      const start = cells[0] ?? startOfMonth(anchor)
      const last = cells[cells.length - 1] ?? start
      return { start, end: addDays(startOfDay(last), 1) }
    }
    default: {
      const exhaustive: never = mode
      return exhaustive
    }
  }
}

export function shiftAnchor(anchor: Date, mode: CalendarMode, delta: number): Date {
  switch (mode) {
    case 'day':
      return addDays(startOfDay(anchor), delta)
    case 'week':
      return addDays(startOfDay(anchor), delta * 7)
    case 'month':
      return new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1)
    default: {
      const exhaustive: never = mode
      return exhaustive
    }
  }
}

export function formatCalendarTitle(anchor: Date, mode: CalendarMode): string {
  switch (mode) {
    case 'day':
      return `${anchor.getMonth() + 1}月${anchor.getDate()}日 周${WEEKDAY[anchor.getDay()]}`
    case 'week': {
      const start = startOfWeek(anchor)
      const end = addDays(start, 6)
      if (start.getMonth() === end.getMonth()) {
        return `${start.getMonth() + 1}月${start.getDate()}日 – ${end.getDate()}日`
      }
      return `${start.getMonth() + 1}月${start.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日`
    }
    case 'month':
      return `${anchor.getFullYear()}年${anchor.getMonth() + 1}月`
    default: {
      const exhaustive: never = mode
      return exhaustive
    }
  }
}

export function weekdayLabel(date: Date): string {
  return WEEKDAY[date.getDay()] ?? ''
}

export function parseNotifyAt(iso: string | null): Date | null {
  if (!iso) {
    return null
  }
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

export function placeTodos(todos: TodoItem[], range: CalendarRange, today: Date): PlacedTodo[] {
  const startMs = range.start.getTime()
  const endMs = range.end.getTime()
  const todayKey = dayKey(today)
  const todayInRange = startOfDay(today).getTime() >= startMs && startOfDay(today).getTime() < endMs
  const placed: PlacedTodo[] = []

  for (const todo of todos) {
    const when = parseNotifyAt(todo.notifyAt)
    if (when) {
      const ms = when.getTime()
      if (ms < startMs || ms >= endMs) {
        continue
      }
      placed.push({
        id: todo.id,
        title: todo.title,
        day: dayKey(when),
        hour: when.getHours(),
        minute: when.getMinutes(),
        untimed: false,
        done: todo.done,
        tags: todo.tags,
        notifyAt: todo.notifyAt,
      })
      continue
    }
    if (todo.done || !todayInRange) {
      continue
    }
    placed.push({
      id: todo.id,
      title: todo.title,
      day: todayKey,
      hour: null,
      minute: 0,
      untimed: true,
      done: false,
      tags: todo.tags,
      notifyAt: null,
    })
  }

  return placed.sort((left, right) => {
    if (left.day !== right.day) {
      return left.day.localeCompare(right.day)
    }
    if (left.untimed !== right.untimed) {
      return left.untimed ? -1 : 1
    }
    const leftMin = (left.hour ?? 0) * 60 + left.minute
    const rightMin = (right.hour ?? 0) * 60 + right.minute
    return leftMin - rightMin
  })
}

export function timeLabel(item: PlacedTodo): string {
  if (item.untimed || item.hour === null) {
    return '未定时'
  }
  return `${pad2(item.hour)}:${pad2(item.minute)}`
}
