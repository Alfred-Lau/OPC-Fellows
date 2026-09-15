export function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function toIsoLocal(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:00`
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function atHour(date: Date, hour: number, minute = 0): Date {
  const next = new Date(date)
  next.setHours(hour, minute, 0, 0)
  return next
}

export function tomorrowMorning(now = new Date(), hour = 9): Date {
  return atHour(addDays(now, 1), hour)
}

export function isSameDay(iso: string | null, now: Date): boolean {
  if (!iso) {
    return false
  }
  const date = new Date(iso)
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

export function isTomorrow(iso: string | null, now: Date): boolean {
  return isSameDay(iso, addDays(now, 1))
}
