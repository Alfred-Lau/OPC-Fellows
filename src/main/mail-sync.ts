import { getWorkbenchWindow } from './workbench-window'
import { fetchImapInbox, type ImapHeader } from './mail-imap'
import { describeOsascriptError, fetchLocalInbox, probeLocalMail } from './mail-local'
import {
  accountPassword,
  listMailAccounts,
  loadMail,
  mailState,
  replaceMailMessages,
  setAccountSyncMeta,
  setMailError,
  setMailLocal,
} from './mail-store'
import {
  mailProviderOf,
  mergeMailMessages,
  type MailMessage,
  type MailProvider,
  type MailState,
} from '../shared/mail'

export function broadcastMail(): void {
  getWorkbenchWindow()?.webContents.send('mail:changed', mailState())
}

export async function refreshMailCoverage(): Promise<MailState> {
  loadMail()
  setMailLocal(await probeLocalMail())
  broadcastMail()
  return mailState()
}

export async function syncMailInboxes(): Promise<MailState> {
  loadMail()
  const local = await probeLocalMail()
  setMailLocal(local)
  const incoming: MailMessage[] = []
  const errors: string[] = []
  for (const account of listMailAccounts().filter((item) => item.enabled)) {
    try {
      const batch =
        account.provider === 'local'
          ? await fetchLocalInbox(account.id)
          : await fetchOnlineInbox(account.id, account.provider, account.email, accountPassword(account))
      incoming.push(...batch)
      setAccountSyncMeta(account.id)
    } catch (error) {
      const message =
        account.provider === 'local' ? describeOsascriptError(error) : (error as Error).message.slice(0, 180)
      setAccountSyncMeta(account.id, message)
      errors.push(`${account.label || account.email || account.provider}：${message}`)
    }
  }
  replaceMailMessages(mergeMailMessages(mailState().messages, incoming))
  const state = setMailError(errors.length > 0 ? errors.join('；') : undefined)
  broadcastMail()
  return state
}

async function fetchOnlineInbox(
  accountId: string,
  provider: MailProvider,
  email: string,
  password: string,
): Promise<MailMessage[]> {
  const info = mailProviderOf(provider)
  if (!info?.host) {
    throw new Error('未知邮箱类型')
  }
  if (!email.trim() || !password) {
    throw new Error('还没填邮箱或专用密码')
  }
  const rows = await fetchImapInbox({
    host: info.host,
    port: info.port,
    user: email.trim(),
    password,
  })
  return rows.map((row, index) => toMessage(accountId, provider, row, index))
}

function toMessage(accountId: string, provider: MailProvider, row: ImapHeader, index: number): MailMessage {
  const messageId = row.headers['message-id'] || `${accountId}:${row.uid || String(index)}`
  const unread = !row.flags.some((flag) => flag.toLowerCase() === '\\seen')
  return {
    id: `${accountId}:${messageId}`,
    accountId,
    provider,
    uid: row.uid || String(index),
    messageId,
    from: row.headers.from ?? '',
    to: row.headers.to ?? '',
    subject: row.headers.subject || '(无主题)',
    date: normalizeDate(row.headers.date),
    snippet: '',
    unread,
    triage: 'open',
  }
}

function normalizeDate(raw?: string): string {
  if (!raw) {
    return new Date().toISOString()
  }
  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString()
}
