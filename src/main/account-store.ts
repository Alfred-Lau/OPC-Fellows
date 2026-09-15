import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import {
  emptyMetrics,
  isAccountPlatformId,
  isPostFormat,
  normalizeMetrics,
  type AccountDayLog,
  type AccountMaterial,
  type AccountMaterialInput,
  type AccountPost,
  type AccountPostInput,
  type AccountsState,
  type DayMetrics,
  type SocialAccount,
  type SocialAccountInput,
} from '../shared/accounts'

const store: AccountsState = {
  accounts: [],
  materials: [],
  logs: [],
}

export function accountStorePath(): string {
  return join(app.getPath('userData'), 'accounts.json')
}

export function loadAccounts(): void {
  const path = accountStorePath()
  if (!existsSync(path)) {
    reset()
    return
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object') {
      reset()
      return
    }
    const record = parsed as { accounts?: unknown; materials?: unknown; logs?: unknown }
    store.accounts = Array.isArray(record.accounts) ? record.accounts.filter(isAccount) : []
    store.materials = Array.isArray(record.materials) ? record.materials.filter(isMaterial) : []
    store.logs = Array.isArray(record.logs) ? record.logs.filter(isLog) : []
  } catch {
    reset()
  }
}

export function accountsState(): AccountsState {
  return {
    accounts: [...store.accounts],
    materials: [...store.materials],
    logs: [...store.logs],
  }
}

export function saveAccount(input: SocialAccountInput, now = new Date()): SocialAccount | null {
  const name = input.name.trim()
  if (!name || !isAccountPlatformId(input.platform)) {
    return null
  }
  const existing = input.id ? store.accounts.find((item) => item.id === input.id) : undefined
  if (input.id && !existing) {
    return null
  }
  const account: SocialAccount = {
    id: existing?.id ?? crypto.randomUUID(),
    platform: input.platform,
    name,
    handle: (input.handle ?? '').trim(),
    note: (input.note ?? '').trim(),
    createdAt: existing?.createdAt ?? now.toISOString(),
  }
  store.accounts = existing
    ? store.accounts.map((item) => (item.id === account.id ? account : item))
    : [account, ...store.accounts]
  persist()
  return account
}

export function removeAccount(id: string): boolean {
  const before = store.accounts.length
  store.accounts = store.accounts.filter((item) => item.id !== id)
  if (store.accounts.length === before) {
    return false
  }
  store.logs = store.logs.filter((item) => item.accountId !== id)
  persist()
  return true
}

export function saveMaterial(input: AccountMaterialInput, now = new Date()): AccountMaterial | null {
  const title = input.title.trim()
  if (!title) {
    return null
  }
  const existing = input.id ? store.materials.find((item) => item.id === input.id) : undefined
  if (input.id && !existing) {
    return null
  }
  const material: AccountMaterial = {
    id: existing?.id ?? crypto.randomUUID(),
    title,
    summary: (input.summary ?? '').trim(),
    productId: (input.productId ?? '').trim(),
    createdAt: existing?.createdAt ?? now.toISOString(),
  }
  store.materials = existing
    ? store.materials.map((item) => (item.id === material.id ? material : item))
    : [material, ...store.materials]
  persist()
  return material
}

export function removeMaterial(id: string): boolean {
  const before = store.materials.length
  store.materials = store.materials.filter((item) => item.id !== id)
  if (store.materials.length === before) {
    return false
  }
  for (const log of store.logs) {
    log.materialIds = log.materialIds.filter((item) => item !== id)
  }
  persist()
  return true
}

export function addPost(accountId: string, date: string, input: AccountPostInput, now = new Date()): AccountPost | null {
  if (!store.accounts.some((item) => item.id === accountId) || !isDate(date)) {
    return null
  }
  const title = input.title.trim()
  if (!title) {
    return null
  }
  const post: AccountPost = {
    id: crypto.randomUUID(),
    title,
    body: (input.body ?? '').trim(),
    url: (input.url ?? '').trim(),
    format: isPostFormat(input.format) ? input.format : '短视频',
  }
  const log = getOrCreateLog(accountId, date, now)
  log.posts = [post, ...log.posts]
  log.updatedAt = now.toISOString()
  persist()
  return post
}

export function removePost(accountId: string, date: string, postId: string, now = new Date()): boolean {
  const log = store.logs.find((item) => item.accountId === accountId && item.date === date)
  if (!log) {
    return false
  }
  const before = log.posts.length
  log.posts = log.posts.filter((item) => item.id !== postId)
  if (log.posts.length === before) {
    return false
  }
  log.updatedAt = now.toISOString()
  persist()
  return true
}

export function saveMetrics(accountId: string, date: string, metrics: Partial<DayMetrics>, now = new Date()): AccountDayLog | null {
  if (!store.accounts.some((item) => item.id === accountId) || !isDate(date)) {
    return null
  }
  const log = getOrCreateLog(accountId, date, now)
  log.metrics = normalizeMetrics(metrics)
  log.updatedAt = now.toISOString()
  persist()
  return { ...log, posts: [...log.posts], materialIds: [...log.materialIds] }
}

export function setDayMaterials(accountId: string, date: string, materialIds: string[], now = new Date()): AccountDayLog | null {
  if (!store.accounts.some((item) => item.id === accountId) || !isDate(date)) {
    return null
  }
  const known = new Set(store.materials.map((item) => item.id))
  const log = getOrCreateLog(accountId, date, now)
  log.materialIds = [...new Set(materialIds.filter((id) => known.has(id)))]
  log.updatedAt = now.toISOString()
  persist()
  return { ...log, posts: [...log.posts], materialIds: [...log.materialIds] }
}

function getOrCreateLog(accountId: string, date: string, now: Date): AccountDayLog {
  const existing = store.logs.find((item) => item.accountId === accountId && item.date === date)
  if (existing) {
    return existing
  }
  const created: AccountDayLog = {
    id: crypto.randomUUID(),
    accountId,
    date,
    posts: [],
    metrics: emptyMetrics(),
    materialIds: [],
    updatedAt: now.toISOString(),
  }
  store.logs = [created, ...store.logs]
  return created
}

function persist(): void {
  const path = accountStorePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(
    path,
    JSON.stringify({ accounts: store.accounts, materials: store.materials, logs: store.logs }, null, 2),
  )
}

function reset(): void {
  store.accounts = []
  store.materials = []
  store.logs = []
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isAccount(value: unknown): value is SocialAccount {
  if (!value || typeof value !== 'object') {
    return false
  }
  const item = value as SocialAccount
  return typeof item.id === 'string' && isAccountPlatformId(item.platform) && typeof item.name === 'string'
}

function isMaterial(value: unknown): value is AccountMaterial {
  if (!value || typeof value !== 'object') {
    return false
  }
  const item = value as AccountMaterial
  return typeof item.id === 'string' && typeof item.title === 'string'
}

function isLog(value: unknown): value is AccountDayLog {
  if (!value || typeof value !== 'object') {
    return false
  }
  const item = value as AccountDayLog
  if (typeof item.id !== 'string' || typeof item.accountId !== 'string' || !isDate(item.date)) {
    return false
  }
  item.posts = Array.isArray(item.posts) ? item.posts.filter(isPost) : []
  item.metrics = normalizeMetrics(item.metrics)
  item.materialIds = Array.isArray(item.materialIds) ? item.materialIds.filter((id) => typeof id === 'string') : []
  return true
}

function isPost(value: unknown): value is AccountPost {
  if (!value || typeof value !== 'object') {
    return false
  }
  const item = value as AccountPost
  return typeof item.id === 'string' && typeof item.title === 'string'
}
