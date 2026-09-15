import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { MonitorCache, MonitorRefreshResult } from '../shared/monitor'

let cache: MonitorCache | null = null
let loaded = false

export function monitorCachePath(): string {
  return join(app.getPath('userData'), 'monitor-cache.json')
}

/** 读盘只做一次，之后走内存副本。 */
export function loadMonitorCache(): MonitorCache | null {
  if (loaded) {
    return cache
  }
  loaded = true
  const path = monitorCachePath()
  if (!existsSync(path)) {
    cache = null
    return cache
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    cache = isMonitorCache(parsed) ? parsed : null
  } catch {
    cache = null
  }
  return cache
}

export function saveMonitorCache(result: MonitorRefreshResult): MonitorCache {
  const next: MonitorCache = {
    snapshot: result.snapshot,
    social: result.social,
    proposals: result.proposals,
    cachedAt: new Date().toISOString(),
  }
  cache = next
  loaded = true
  try {
    const path = monitorCachePath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(next))
  } catch {
    // 写盘失败不该拖垮刷新，内存副本仍然可用。
  }
  return next
}

function isMonitorCache(value: unknown): value is MonitorCache {
  if (!value || typeof value !== 'object') {
    return false
  }
  const item = value as MonitorCache
  return (
    typeof item.cachedAt === 'string' &&
    Array.isArray(item.proposals) &&
    Boolean(item.snapshot) &&
    typeof item.snapshot === 'object' &&
    Array.isArray(item.snapshot.projects) &&
    Boolean(item.snapshot.vercel) &&
    Array.isArray(item.snapshot.vercel.projects) &&
    Boolean(item.social)
  )
}
