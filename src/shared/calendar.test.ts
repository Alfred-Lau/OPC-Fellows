import assert from 'node:assert/strict'
import test from 'node:test'
import type { TodoItem } from './todo.ts'
import {
  calendarRange,
  formatCalendarTitle,
  monthGrid,
  placeTodos,
  shiftAnchor,
  startOfWeek,
} from './calendar.ts'

function at(iso: string): Date {
  return new Date(iso)
}

function todo(partial: Partial<TodoItem> & Pick<TodoItem, 'id' | 'title'>): TodoItem {
  return {
    notifyAt: null,
    notifiedAt: null,
    done: false,
    createdAt: '2026-09-01T00:00:00',
    source: 'test',
    tags: [],
    origin: 'user',
    ...partial,
  }
}

test('一周从周一起，周六回落到当周周一', () => {
  const saturday = at('2026-09-12T15:00:00')
  const monday = startOfWeek(saturday)
  assert.equal(monday.getFullYear(), 2026)
  assert.equal(monday.getMonth(), 8)
  assert.equal(monday.getDate(), 7)
  assert.equal(monday.getDay(), 1)
})

test('月网格从当月第一天所在周一起，共 42 格', () => {
  const cells = monthGrid(at('2026-09-12T10:00:00'))
  assert.equal(cells.length, 42)
  assert.equal(cells[0]?.getDate(), 31)
  assert.equal(cells[0]?.getMonth(), 7)
  assert.equal(cells[1]?.getDate(), 1)
  assert.equal(cells[1]?.getMonth(), 8)
})

test('日周月标题按锚点格式化', () => {
  const saturday = at('2026-09-12T09:00:00')
  assert.equal(formatCalendarTitle(saturday, 'day'), '9月12日 周六')
  assert.equal(formatCalendarTitle(saturday, 'week'), '9月7日 – 13日')
  assert.equal(formatCalendarTitle(saturday, 'month'), '2026年9月')
})

test('翻页按视图步进：日 ±1、周 ±7、月换月', () => {
  const saturday = at('2026-09-12T09:00:00')
  assert.equal(shiftAnchor(saturday, 'day', 1).getDate(), 13)
  assert.equal(shiftAnchor(saturday, 'week', -1).getDate(), 5)
  const october = shiftAnchor(saturday, 'month', 1)
  assert.equal(october.getMonth(), 9)
  assert.equal(october.getDate(), 1)
})

test('定时待办落到 notifyAt 那天，未定时未完成的落到今天', () => {
  const today = at('2026-09-12T08:00:00')
  const range = calendarRange(today, 'week')
  const placed = placeTodos(
    [
      todo({ id: 'timed', title: '剪视频', notifyAt: '2026-09-12T09:00:00' }),
      todo({ id: 'later', title: '周日晚上', notifyAt: '2026-09-13T18:00:00' }),
      todo({ id: 'untimed', title: '随手记升格' }),
      todo({ id: 'done-open', title: '已完成无时', done: true }),
      todo({ id: 'past', title: '上个月', notifyAt: '2026-08-01T09:00:00' }),
    ],
    range,
    today,
  )
  assert.deepEqual(
    placed.map((item) => ({ id: item.id, day: item.day, hour: item.hour, untimed: item.untimed })),
    [
      { id: 'untimed', day: '2026-09-12', hour: null, untimed: true },
      { id: 'timed', day: '2026-09-12', hour: 9, untimed: false },
      { id: 'later', day: '2026-09-13', hour: 18, untimed: false },
    ],
  )
})

test('已完成但有提醒时间的待办仍挂在当天，便于回看', () => {
  const today = at('2026-09-12T08:00:00')
  const placed = placeTodos(
    [todo({ id: 'done', title: '已交周报', notifyAt: '2026-09-12T09:00:00', done: true })],
    calendarRange(today, 'day'),
    today,
  )
  assert.equal(placed.length, 1)
  assert.equal(placed[0]?.done, true)
})
