export interface ProjectUserStats {
  registered: number | null
  paid: number | null
  orders: number | null
  /** 累计营收，单位由站点决定（约定为元）。 */
  revenue: number | null
  available: boolean
}

export function emptyUserStats(): ProjectUserStats {
  return { registered: null, paid: null, orders: null, revenue: null, available: false }
}

export function originOf(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') {
    return null
  }
  const trimmed = url.trim()
  if (!trimmed) {
    return null
  }
  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.origin
  } catch {
    return null
  }
}

export function statsUrlFor(origin: string | null): string | null {
  if (!origin) {
    return null
  }
  return `${origin}/api/stats`
}

function asCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.round(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n) && n >= 0) {
      return Math.round(n)
    }
  }
  return null
}

/** 营收保留两位小数，不像计数那样取整。 */
function asAmount(value: unknown): number | null {
  const raw = typeof value === 'string' && value.trim() ? Number(value) : value
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    return null
  }
  return Math.round(raw * 100) / 100
}

function pickCount(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const found = asCount(record[key])
    if (found !== null) {
      return found
    }
  }
  return null
}

function pickAmount(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const found = asAmount(record[key])
    if (found !== null) {
      return found
    }
  }
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

export function parseUserStats(raw: unknown): ProjectUserStats {
  const root = asRecord(raw)
  if (!root) {
    return emptyUserStats()
  }
  const data = asRecord(root.data) ?? root
  const users = asRecord(data.users)
  const subscriptions = asRecord(data.subscriptions)
  const orderBag = asRecord(data.orders)

  const registered =
    pickCount(data, ['users', 'registered', 'registeredUsers', 'totalUsers', 'userCount']) ??
    pickCount(users ?? {}, ['total', 'count', 'registered'])

  const paid =
    pickCount(data, ['paid', 'paidUsers', 'paying', 'subscribers', 'subscriberCount']) ??
    pickCount(subscriptions ?? {}, ['active', 'paid', 'count'])

  const orders =
    pickCount(data, ['orders', 'orderCount', 'totalOrders', 'purchases']) ??
    pickCount(orderBag ?? {}, ['total', 'count', 'paid'])

  const revenue =
    pickAmount(data, ['revenue', 'totalRevenue', 'mrr', 'gmv', 'amount']) ??
    pickAmount(orderBag ?? {}, ['revenue', 'amount', 'total'])

  if (registered === null && paid === null && orders === null && revenue === null) {
    return emptyUserStats()
  }
  return { registered, paid, orders, revenue, available: true }
}

export interface UserStatsSummary {
  registered: number
  paid: number
  orders: number
  revenue: number
  known: number
  missing: number
}

export function summarizeUsers(rows: Array<{ users?: ProjectUserStats | null }>): UserStatsSummary {
  const total: UserStatsSummary = { registered: 0, paid: 0, orders: 0, revenue: 0, known: 0, missing: 0 }
  for (const row of rows) {
    const stats = row.users
    if (!stats?.available) {
      total.missing += 1
      continue
    }
    total.known += 1
    total.registered += stats.registered ?? 0
    total.paid += stats.paid ?? 0
    total.orders += stats.orders ?? 0
    total.revenue += stats.revenue ?? 0
  }
  total.revenue = Math.round(total.revenue * 100) / 100
  return total
}
