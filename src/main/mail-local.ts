import { execFile } from 'node:child_process'
import type { MailLocalCoverage, MailMessage } from '../shared/mail'

const FETCH_LIMIT = 40
const ACCOUNT_TIMEOUT_MS = 12_000
const INBOX_TIMEOUT_MS = 45_000

export async function probeLocalMail(): Promise<MailLocalCoverage> {
  if (process.platform !== 'darwin') {
    return { available: false, accounts: [], error: '本机邮箱目前只支持 macOS「邮件」。' }
  }
  try {
    const stdout = await runOsascript(ACCOUNT_SCRIPT, ACCOUNT_TIMEOUT_MS)
    const accounts = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    return { available: accounts.length > 0, accounts }
  } catch (error) {
    return { available: false, accounts: [], error: describeOsascriptError(error) }
  }
}

export async function fetchLocalInbox(accountId: string): Promise<MailMessage[]> {
  if (process.platform !== 'darwin') {
    return []
  }
  const stdout = await runOsascript(INBOX_SCRIPT, INBOX_TIMEOUT_MS)
  return parseLocalInboxTsv(stdout, accountId)
}

export function parseLocalInboxTsv(text: string, accountId: string): MailMessage[] {
  const rows: MailMessage[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      continue
    }
    const [messageId, from, subject, date, read] = line.split('\t')
    if (!from && !subject) {
      continue
    }
    const id = `${accountId}:${messageId || `${from}:${subject}:${date}`}`
    rows.push({
      id,
      accountId,
      provider: 'local',
      uid: messageId || id,
      messageId: messageId || id,
      from: from ?? '',
      to: '',
      subject: subject ?? '(无主题)',
      date: normalizeLocalDate(date ?? ''),
      snippet: '',
      unread: read !== 'true' && read !== 'yes',
      triage: 'open',
    })
    if (rows.length >= FETCH_LIMIT) {
      break
    }
  }
  return rows
}

export function describeOsascriptError(error: unknown): string {
  const text = osascriptErrorText(error)
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined
  if (text.includes('-1743') || /not allowed to send Apple events|不允许/.test(text)) {
    return '系统还没允许控制「邮件」。请到系统设置 → 隐私与安全性 → 自动化，勾选本应用。'
  }
  if (code === 'ETIMEDOUT' || text.includes('ETIMEDOUT') || /timed? ?out/i.test(text)) {
    return '读本机收件箱超时。先打开「邮件」等它闲下来再刷新。'
  }
  if (text.includes('-1728')) {
    return '邮件.app 里找不到收件箱。请先在「邮件」里登录账号。'
  }
  if (text.includes('-600') || text.includes('-10810')) {
    return '打不开「邮件」。请先手动打开邮件.app 再刷新。'
  }
  if (text.includes('-2741')) {
    return '读本机邮件的脚本写坏了，请更新应用后再试。'
  }
  return `读不了本机邮件：${text.slice(0, 120)}`
}

function osascriptErrorText(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return String(error)
  }
  const row = error as { stderr?: unknown; message?: unknown }
  const stderr = typeof row.stderr === 'string' ? row.stderr.replace(/\s+/g, ' ').trim() : ''
  if (stderr) {
    return stderr
  }
  const message = typeof row.message === 'string' ? row.message.replace(/\s+/g, ' ').trim() : ''
  return message.replace(/^Command failed: osascript(?: -e)?\s*/i, '').slice(0, 160) || '未知错误'
}

function runOsascript(script: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile('osascript', [], { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stderr: stderr?.trim() || (error as { stderr?: string }).stderr }))
        return
      }
      resolve(stdout)
    })
    child.stdin?.end(script)
  })
}

export function normalizeLocalDate(raw: string): string {
  const parsed = Date.parse(raw)
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString()
  }
  const match = raw.match(/(\d{4})年(\d{1,2})月(\d{1,2})日[^\d]*(\d{1,2}):(\d{2}):(\d{2})/)
  if (!match) {
    return new Date().toISOString()
  }
  const [, year, month, day, hour, minute, second] = match
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:${second}`
  const again = Date.parse(iso)
  return Number.isNaN(again) ? new Date().toISOString() : new Date(again).toISOString()
}

const ACCOUNT_SCRIPT = `
tell application "Mail"
  set names to name of every account
  set out to ""
  repeat with n in names
    set out to out & n & linefeed
  end repeat
  return out
end tell
`.trim()

/**
 * 只取 inbox 下标 1..40（最新在前）。
 * 不能 `repeat with m in messages of inbox`：一万封时会扫完全箱。
 * 不能写 `set rd to read status`：`read` 是保留字，会炸 -2741。
 * 不能对列表取 `message id`：和 Mail 的 `message id N` 选择器撞车。
 */
const INBOX_SCRIPT = `
tell application "Mail"
  set out to ""
  repeat with i from 1 to ${String(FETCH_LIMIT)}
    try
      set m to message i of inbox
      set theId to id of m as string
      set snd to my tidyText(sender of m as string)
      set subj to my tidyText(subject of m as string)
      set dat to my isoStamp(date received of m)
      set isRead to (read status of m) as string
      set out to out & theId & tab & snd & tab & subj & tab & dat & tab & isRead & linefeed
    on error
      exit repeat
    end try
  end repeat
  return out
end tell

on isoStamp(d)
  set y to year of d as string
  set mo to text -2 thru -1 of ("0" & ((month of d) as integer as string))
  set da to text -2 thru -1 of ("0" & (day of d as string))
  set h to text -2 thru -1 of ("0" & (hours of d as string))
  set mi to text -2 thru -1 of ("0" & (minutes of d as string))
  set se to text -2 thru -1 of ("0" & ((seconds of d as integer) as string))
  return y & "-" & mo & "-" & da & "T" & h & ":" & mi & ":" & se
end isoStamp

on tidyText(s)
  set t to s as string
  set AppleScript's text item delimiters to tab
  set bits to text items of t
  set AppleScript's text item delimiters to " "
  set t to bits as string
  set AppleScript's text item delimiters to return
  set bits to text items of t
  set AppleScript's text item delimiters to " "
  set t to bits as string
  set AppleScript's text item delimiters to linefeed
  set bits to text items of t
  set AppleScript's text item delimiters to " "
  return bits as string
end tidyText
`.trim()
