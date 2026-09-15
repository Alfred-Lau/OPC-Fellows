const WEEKDAYS: Record<string, number> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
}

export function parseNotifyAt(text: string, now = new Date()): Date | null {
  const source = text.trim()
  if (!source) {
    return null
  }

  const iso = source.match(
    /(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/,
  )
  if (iso) {
    const date = new Date(
      Number(iso[1].slice(0, 4)),
      Number(iso[1].slice(5, 7)) - 1,
      Number(iso[1].slice(8, 10)),
      Number(iso[2]),
      Number(iso[3]),
      iso[4] ? Number(iso[4]) : 0,
    )
    return Number.isNaN(date.getTime()) ? null : date
  }

  const relativeMinutes = source.match(/(\d+)\s*分钟后/)
  if (relativeMinutes) {
    return new Date(now.getTime() + Number(relativeMinutes[1]) * 60_000)
  }
  const relativeHours = source.match(/(\d+)\s*小时后/)
  if (relativeHours) {
    return new Date(now.getTime() + Number(relativeHours[1]) * 3_600_000)
  }

  const date = new Date(now)
  let shifted = false

  if (/后天/.test(source)) {
    date.setDate(date.getDate() + 2)
    shifted = true
  } else if (/明天|明日/.test(source)) {
    date.setDate(date.getDate() + 1)
    shifted = true
  } else if (/今天|今晚|今夜/.test(source)) {
    shifted = true
  } else {
    const weekday = source.match(/周([一二三四五六日天])|星期([一二三四五六日天])/)
    const token = weekday?.[1] ?? weekday?.[2]
    if (token && WEEKDAYS[token] !== undefined) {
      const target = WEEKDAYS[token]
      const delta = (target - date.getDay() + 7) % 7
      date.setDate(date.getDate() + (delta === 0 ? 7 : delta))
      shifted = true
    }
  }

  const clock = source.match(/(上午|下午|中午|晚上|傍晚|凌晨)?\s*(\d{1,2})(?:[:：点](\d{1,2})?)?/)
  if (clock) {
    let hour = Number(clock[2])
    const minute = clock[3] ? Number(clock[3]) : 0
    const period = clock[1] ?? (/今晚|今夜|晚上/.test(source) ? '晚上' : /下午/.test(source) ? '下午' : undefined)
    hour = applyPeriod(hour, period)
    date.setHours(hour, minute, 0, 0)
    if (!shifted && date.getTime() <= now.getTime()) {
      date.setDate(date.getDate() + 1)
    }
    return date
  }

  if (!shifted) {
    return null
  }

  if (/今晚|今夜|晚上/.test(source)) {
    date.setHours(20, 0, 0, 0)
  } else if (/上午/.test(source)) {
    date.setHours(9, 0, 0, 0)
  } else if (/下午|傍晚/.test(source)) {
    date.setHours(15, 0, 0, 0)
  } else {
    date.setHours(9, 0, 0, 0)
  }
  return date
}

function applyPeriod(hour: number, period?: string): number {
  if (period === '下午' || period === '晚上' || period === '傍晚') {
    return hour < 12 ? hour + 12 : hour
  }
  if (period === '中午' && hour <= 2) {
    return 12 + hour
  }
  if (period === '凌晨' && hour === 12) {
    return 0
  }
  if (hour === 12 && period === '上午') {
    return 0
  }
  return hour
}

export { toIsoLocal } from '../shared/datetime'

export function formatNotifyLabel(iso: string | null): string {
  if (!iso) {
    return '不提醒'
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return '时间无效'
  }
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
