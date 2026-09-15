import './calendar.css'
import {
  calendarRange,
  formatCalendarTitle,
  monthGrid,
  placeTodos,
  shiftAnchor,
  startOfDay,
  startOfWeek,
  timeLabel,
  weekdayLabel,
  type CalendarMode,
  type PlacedTodo,
} from '../../shared/calendar'
import { addDays, dayKey } from '../../shared/datetime'

const MODE_KEY = 'ownworkbuddy.calendarMode'
const HOURS = Array.from({ length: 24 }, (_, index) => index)

const titleEl = required('#cal-title', HTMLHeadingElement)
const stage = required('#cal-stage', HTMLElement)

let mode: CalendarMode = readMode()
let anchor = new Date()
let items: PlacedTodo[] = []

function required<T extends typeof HTMLElement>(selector: string, ctor: T): InstanceType<T> {
  const node = document.querySelector(selector)
  if (!(node instanceof ctor)) {
    throw new Error(`missing ${selector}`)
  }
  return node as InstanceType<T>
}

function readMode(): CalendarMode {
  const stored = localStorage.getItem(MODE_KEY)
  return stored === 'day' || stored === 'week' || stored === 'month' ? stored : 'week'
}

function setMode(next: CalendarMode): void {
  mode = next
  localStorage.setItem(MODE_KEY, next)
  paintChrome()
  void refreshCalendar()
}

function paintChrome(): void {
  titleEl.textContent = formatCalendarTitle(anchor, mode)
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-cal-mode]')) {
    button.classList.toggle('is-current', button.dataset.calMode === mode)
  }
}

function itemsOn(day: string): PlacedTodo[] {
  return items.filter((item) => item.day === day)
}

function eventButton(item: PlacedTodo): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = item.done ? 'cal-event is-done' : 'cal-event'
  button.title = item.title
  const time = document.createElement('span')
  time.className = 'cal-event-time'
  time.textContent = timeLabel(item)
  const name = document.createElement('span')
  name.className = 'cal-event-title'
  name.textContent = item.title
  button.append(time, name)
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    void window.ownworkbuddy.todos.update(item.id, { done: !item.done })
  })
  return button
}

function moreLabel(hidden: number): HTMLSpanElement {
  const more = document.createElement('span')
  more.className = 'cal-more'
  more.textContent = `还有 ${String(hidden)} 件`
  return more
}

function renderDay(): void {
  const key = dayKey(anchor)
  const dayItems = itemsOn(key)
  const allDay = dayItems.filter((item) => item.untimed || item.hour === null)
  const timed = dayItems.filter((item) => item.hour !== null && !item.untimed)

  const wrap = document.createElement('div')
  wrap.className = 'cal-day'

  const strip = document.createElement('section')
  strip.className = 'cal-allday'
  const stripHead = document.createElement('p')
  stripHead.className = 'caption'
  stripHead.textContent = '当天未定时'
  const stripList = document.createElement('div')
  stripList.className = 'cal-allday-list'
  if (allDay.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'cal-empty'
    empty.textContent = '没有未定时的待办'
    stripList.append(empty)
  } else {
    for (const item of allDay) {
      stripList.append(eventButton(item))
    }
  }
  strip.append(stripHead, stripList)

  const grid = document.createElement('div')
  grid.className = 'cal-hours'
  for (const hour of HOURS) {
    const row = document.createElement('div')
    row.className = 'cal-hour'
    if (hour === new Date().getHours() && key === dayKey(new Date())) {
      row.classList.add('is-now')
    }
    const label = document.createElement('span')
    label.className = 'cal-hour-label'
    label.textContent = `${String(hour).padStart(2, '0')}:00`
    const slot = document.createElement('div')
    slot.className = 'cal-hour-slot'
    for (const item of timed.filter((entry) => entry.hour === hour)) {
      slot.append(eventButton(item))
    }
    row.append(label, slot)
    grid.append(row)
  }

  wrap.append(strip, grid)
  stage.replaceChildren(wrap)
  const nowRow = wrap.querySelector('.cal-hour.is-now')
  const morning = wrap.querySelectorAll('.cal-hour')[8]
  ;(nowRow ?? morning)?.scrollIntoView({ block: 'center' })
}

function renderWeek(): void {
  const start = startOfWeek(anchor)
  const todayKey = dayKey(new Date())
  const wrap = document.createElement('div')
  wrap.className = 'cal-week'
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(start, offset)
    const key = dayKey(date)
    const col = document.createElement('section')
    col.className = key === todayKey ? 'cal-week-col is-today' : 'cal-week-col'
    const head = document.createElement('button')
    head.type = 'button'
    head.className = 'cal-week-head'
    const weekName = document.createElement('span')
    weekName.textContent = weekdayLabel(date)
    const weekNum = document.createElement('b')
    weekNum.textContent = String(date.getDate())
    head.append(weekName, weekNum)
    head.addEventListener('click', () => {
      anchor = date
      setMode('day')
    })
    const list = document.createElement('div')
    list.className = 'cal-week-list'
    const dayItems = itemsOn(key)
    if (dayItems.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'cal-empty'
      empty.textContent = '空'
      list.append(empty)
    } else {
      for (const item of dayItems) {
        list.append(eventButton(item))
      }
    }
    col.append(head, list)
    wrap.append(col)
  }
  stage.replaceChildren(wrap)
}

function renderMonth(): void {
  const cells = monthGrid(anchor)
  const month = anchor.getMonth()
  const todayKey = dayKey(new Date())
  const wrap = document.createElement('div')
  wrap.className = 'cal-month'
  const head = document.createElement('div')
  head.className = 'cal-month-weekdays'
  for (const label of ['一', '二', '三', '四', '五', '六', '日']) {
    const cell = document.createElement('span')
    cell.textContent = label
    head.append(cell)
  }
  const grid = document.createElement('div')
  grid.className = 'cal-month-grid'
  for (const date of cells) {
    const key = dayKey(date)
    const dayItems = itemsOn(key)
    const cell = document.createElement('div')
    cell.className = 'cal-month-cell'
    if (date.getMonth() !== month) {
      cell.classList.add('is-outside')
    }
    if (key === todayKey) {
      cell.classList.add('is-today')
    }
    const num = document.createElement('button')
    num.type = 'button'
    num.className = 'cal-month-num'
    num.textContent = String(date.getDate())
    num.addEventListener('click', () => {
      anchor = startOfDay(date)
      setMode('day')
    })
    const list = document.createElement('div')
    list.className = 'cal-month-events'
    const visible = dayItems.slice(0, 3)
    for (const item of visible) {
      list.append(eventButton(item))
    }
    if (dayItems.length > 3) {
      list.append(moreLabel(dayItems.length - 3))
    }
    cell.append(num, list)
    grid.append(cell)
  }
  wrap.append(head, grid)
  stage.replaceChildren(wrap)
}

function renderStage(): void {
  switch (mode) {
    case 'day':
      renderDay()
      return
    case 'week':
      renderWeek()
      return
    case 'month':
      renderMonth()
      return
    default: {
      const exhaustive: never = mode
      return exhaustive
    }
  }
}

export async function refreshCalendar(): Promise<void> {
  const todos = await window.ownworkbuddy.todos.list()
  items = placeTodos(todos, calendarRange(anchor, mode), new Date())
  paintChrome()
  renderStage()
}

export function activateCalendar(): void {
  paintChrome()
  void refreshCalendar()
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-cal-mode]')) {
  button.addEventListener('click', () => {
    const next = button.dataset.calMode
    if (next === 'day' || next === 'week' || next === 'month') {
      setMode(next)
    }
  })
}

required('#cal-prev', HTMLButtonElement).addEventListener('click', () => {
  anchor = shiftAnchor(anchor, mode, -1)
  void refreshCalendar()
})

required('#cal-next', HTMLButtonElement).addEventListener('click', () => {
  anchor = shiftAnchor(anchor, mode, 1)
  void refreshCalendar()
})

required('#cal-today', HTMLButtonElement).addEventListener('click', () => {
  anchor = new Date()
  void refreshCalendar()
})

window.ownworkbuddy.todos.onChanged(() => {
  if (document.body.dataset.tool === 'calendar') {
    void refreshCalendar()
  }
})
