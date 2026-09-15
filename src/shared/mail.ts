import { startOfWeek } from './calendar.ts'
import { addDays, dayKey } from './datetime.ts'

// 邮件整理：账号、收件箱和分流。只读整理，不代发。

export type MailProvider = 'local' | 'icloud' | 'gmail' | 'qq'
export type MailTriage = 'open' | 'follow' | 'archive' | 'ignore'

export interface MailProviderInfo {
  id: MailProvider
  name: string
  host: string
  port: number
  hint: string
}

export const MAIL_PROVIDERS: readonly MailProviderInfo[] = [
  { id: 'local', name: '本机邮箱', host: '', port: 0, hint: '读 macOS「邮件」收件箱，不发信。第一次会向系统申请控制邮件.app。' },
  { id: 'icloud', name: 'iCloud', host: 'imap.mail.me.com', port: 993, hint: '用 Apple 专用密码，不是 iCloud 登录密码。' },
  { id: 'gmail', name: 'Gmail', host: 'imap.gmail.com', port: 993, hint: '在 Google 账号里开应用专用密码。' },
  { id: 'qq', name: 'QQ 邮箱', host: 'imap.qq.com', port: 993, hint: '在 QQ 邮箱设置里开 IMAP，用授权码而不是 QQ 密码。' },
]

export const MAIL_TRIAGE_LABELS: Record<MailTriage, string> = {
  open: '待整理',
  follow: '跟进',
  archive: '归档',
  ignore: '忽略',
}

export interface MailAccount {
  id: string
  provider: MailProvider
  label: string
  email: string
  enabled: boolean
  lastError?: string
  lastSyncAt?: string
}

export interface MailAccountView extends MailAccount {
  hasPassword: boolean
}

export interface MailAccountInput {
  id?: string
  provider: MailProvider
  label?: string
  email?: string
  password?: string
  enabled?: boolean
}

export interface MailMessage {
  id: string
  accountId: string
  provider: MailProvider
  uid: string
  messageId: string
  from: string
  to: string
  subject: string
  date: string
  snippet: string
  unread: boolean
  triage: MailTriage
}

export interface MailDraft {
  id: string
  messageId: string
  text: string
  updatedAt: string
}

export interface MailLocalCoverage {
  available: boolean
  accounts: string[]
  error?: string
}

export interface MailState {
  accounts: MailAccountView[]
  messages: MailMessage[]
  drafts: MailDraft[]
  watchedSenders: string[]
  local: MailLocalCoverage
  lastSyncAt: string
  lastError?: string
}

export interface MailWeekGroup {
  key: string
  label: string
  messages: MailMessage[]
}

export function mailProviderOf(id: string): MailProviderInfo | undefined {
  return MAIL_PROVIDERS.find((item) => item.id === id)
}

export function emptyMailState(): MailState {
  return {
    accounts: [],
    messages: [],
    drafts: [],
    watchedSenders: [],
    local: { available: false, accounts: [] },
    lastSyncAt: '',
  }
}

export function defaultMailLabel(provider: MailProvider, email = ''): string {
  const name = mailProviderOf(provider)?.name ?? provider
  return email.trim() ? `${name} · ${email.trim()}` : name
}

export function openMailMessages(messages: readonly MailMessage[]): MailMessage[] {
  return messages.filter((item) => item.triage === 'open' || item.triage === 'follow')
}

export function unreadMailMessages(messages: readonly MailMessage[]): MailMessage[] {
  return messages.filter((item) => item.unread && item.triage !== 'ignore' && item.triage !== 'archive')
}

export function searchMailMessages(messages: readonly MailMessage[], query: string): MailMessage[] {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return []
  }
  return messages.filter((item) => {
    const haystack = `${item.from} ${item.to} ${item.subject} ${item.snippet}`.toLowerCase()
    return haystack.includes(needle)
  })
}

export function parseMailTriage(text: string): MailTriage | undefined {
  if (/归档|archive/.test(text)) {
    return 'archive'
  }
  if (/忽略|ignore/.test(text)) {
    return 'ignore'
  }
  if (/跟进|follow|待回/.test(text)) {
    return 'follow'
  }
  if (/待整理|重开|open/.test(text)) {
    return 'open'
  }
  return undefined
}

export function lookupMailQuery(text: string): string {
  return text
    .replace(/查信|查邮件|找邮件|搜邮件|查找邮件|邮件里找/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function mergeMailMessages(
  previous: readonly MailMessage[],
  incoming: readonly MailMessage[],
): MailMessage[] {
  const byKey = new Map<string, MailMessage>()
  for (const item of previous) {
    byKey.set(messageKey(item), item)
  }
  for (const item of incoming) {
    const key = messageKey(item)
    const old = byKey.get(key)
    byKey.set(key, old ? { ...item, triage: old.triage, snippet: item.snippet || old.snippet } : item)
  }
  return [...byKey.values()].sort((left, right) => right.date.localeCompare(left.date))
}

export function messageKey(item: Pick<MailMessage, 'accountId' | 'uid' | 'messageId'>): string {
  return item.messageId ? `${item.accountId}:${item.messageId}` : `${item.accountId}:${item.uid}`
}

export function mailSenderEmail(from: string): string {
  const angled = /<([^>]+)>/.exec(from)
  const raw = (angled?.[1] ?? from).trim()
  return raw.includes('@') ? raw.toLowerCase() : ''
}

export function normalizeWatchedSender(raw: string): string {
  return mailSenderEmail(raw) || raw.trim().toLowerCase()
}

export function isWatchedSender(from: string, watched: readonly string[]): boolean {
  const key = normalizeWatchedSender(from)
  return Boolean(key) && watched.includes(key)
}

export function pinWatchedMail(
  messages: readonly MailMessage[],
  watched: readonly string[],
): { watched: MailMessage[]; rest: MailMessage[] } {
  const watchedRows: MailMessage[] = []
  const rest: MailMessage[] = []
  for (const item of messages) {
    if (isWatchedSender(item.from, watched)) {
      watchedRows.push(item)
    } else {
      rest.push(item)
    }
  }
  return { watched: watchedRows, rest }
}

export function formatMailWeekLabel(mondayKey: string, now = new Date()): string {
  const start = new Date(`${mondayKey}T00:00:00`)
  if (Number.isNaN(start.getTime())) {
    return mondayKey
  }
  const end = addDays(start, 6)
  const range = `${String(start.getMonth() + 1)}/${String(start.getDate())}–${String(end.getMonth() + 1)}/${String(end.getDate())}`
  const thisWeek = dayKey(startOfWeek(now))
  const lastWeek = dayKey(addDays(startOfWeek(now), -7))
  if (mondayKey === thisWeek) {
    return `本周 · ${range}`
  }
  if (mondayKey === lastWeek) {
    return `上周 · ${range}`
  }
  return `${String(start.getFullYear())}年${range}`
}

export function groupMailByWeek(messages: readonly MailMessage[], now = new Date()): MailWeekGroup[] {
  const buckets = new Map<string, MailMessage[]>()
  for (const item of messages) {
    const date = new Date(item.date)
    const start = Number.isNaN(date.getTime()) ? startOfWeek(now) : startOfWeek(date)
    const key = dayKey(start)
    const list = buckets.get(key) ?? []
    list.push(item)
    buckets.set(key, list)
  }
  return [...buckets.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([key, rows]) => ({
      key,
      label: formatMailWeekLabel(key, now),
      messages: rows,
    }))
}

export function decodeRfc2047(raw: string): string {
  return raw.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_full, charset: string, enc: string, payload: string) => {
    try {
      const bytes =
        enc.toUpperCase() === 'B' ? Buffer.from(payload, 'base64') : decodeQuotedPrintable(payload)
      return new TextDecoder(normalizeCharset(charset)).decode(bytes)
    } catch {
      return raw
    }
  })
}

export function parseMailHeaders(block: string): Record<string, string> {
  const folded = block.replace(/\r\n[ \t]+/g, ' ').replace(/\n[ \t]+/g, ' ')
  const headers: Record<string, string> = {}
  for (const line of folded.split(/\r?\n/)) {
    const split = line.indexOf(':')
    if (split < 1) {
      continue
    }
    const name = line.slice(0, split).trim().toLowerCase()
    const value = decodeRfc2047(line.slice(split + 1).trim())
    headers[name] = headers[name] ? `${headers[name]} ${value}` : value
  }
  return headers
}

export function quoteImapString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function parseImapSearchIds(text: string): number[] {
  const line = text.split(/\r?\n/).find((item) => item.startsWith('* SEARCH'))
  if (!line) {
    return []
  }
  return line
    .slice('* SEARCH'.length)
    .trim()
    .split(/\s+/)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0)
}

export function parseImapFetchBlocks(text: string): Array<{ uid: string; flags: string[]; headers: Record<string, string> }> {
  const items: Array<{ uid: string; flags: string[]; headers: Record<string, string> }> = []
  const blocks = text.split(/\r?\n\* /).filter((block) => /FETCH/i.test(block))
  for (const block of blocks) {
    const flags = /FLAGS\s+\(([^)]*)\)/i.exec(block)?.[1].split(/\s+/).filter(Boolean) ?? []
    const uid = /UID\s+(\d+)/i.exec(block)?.[1] ?? /\n?\*?\s*(\d+)\s+FETCH/i.exec(`* ${block}`)?.[1] ?? ''
    const headerMatch = /BODY\[HEADER(?:\.FIELDS)?[^\]]*\]\s*\{(\d+)\}\r?\n([\s\S]*)/i.exec(block)
    const raw = headerMatch ? headerMatch[2].slice(0, Number(headerMatch[1])) : extractBareHeaders(block)
    items.push({
      uid,
      flags,
      headers: parseMailHeaders(raw),
    })
  }
  return items.filter((item) => item.uid || item.headers.subject || item.headers.from)
}

function extractBareHeaders(block: string): string {
  const start = block.indexOf('\n')
  return start >= 0 ? block.slice(start + 1) : block
}

function decodeQuotedPrintable(payload: string): Buffer {
  const text = payload.replace(/_/g, ' ')
  const bytes: number[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '=' && i + 2 < text.length) {
      bytes.push(Number.parseInt(text.slice(i + 1, i + 3), 16))
      i += 2
      continue
    }
    bytes.push(text.charCodeAt(i))
  }
  return Buffer.from(bytes)
}

function normalizeCharset(charset: string): string {
  const name = charset.trim().toLowerCase()
  if (name === 'utf-8' || name === 'utf8') {
    return 'utf-8'
  }
  if (name === 'gbk' || name === 'gb2312' || name === 'gb18030') {
    return 'gb18030'
  }
  return 'utf-8'
}
