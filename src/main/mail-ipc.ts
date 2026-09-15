import { clipboard } from 'electron'
import type { IpcRegistrar } from '../kernel/main/ipc'
import { broadcastMail, refreshMailCoverage, syncMailInboxes } from './mail-sync'
import {
  loadMail,
  mailState,
  patchMailMessage,
  removeMailAccount,
  toggleWatchedSender,
  upsertMailAccount,
  upsertMailDraft,
} from './mail-store'
import { parseMailTriage, type MailAccountInput, type MailProvider, type MailTriage } from '../shared/mail'

const PROVIDERS = new Set<MailProvider>(['local', 'icloud', 'gmail', 'qq'])

export function registerMailIpc(handle: IpcRegistrar): void {
  loadMail()

  handle('mail:state', () => mailState())
  handle('mail:probe', () => refreshMailCoverage())
  handle('mail:sync', () => syncMailInboxes())
  handle('mail:save-account', (_event, raw: unknown) => {
    const input = parseAccountInput(raw)
    const next = upsertMailAccount(input)
    broadcastMail()
    return next
  })
  handle('mail:remove-account', (_event, id: unknown) => {
    const next = removeMailAccount(typeof id === 'string' ? id : '')
    broadcastMail()
    return next
  })
  handle('mail:triage', (_event, id: unknown, decision: unknown) => {
    const triage = asTriage(decision)
    if (typeof id !== 'string' || !triage) {
      return mailState()
    }
    const next = patchMailMessage(id, { triage })
    broadcastMail()
    return next
  })
  handle('mail:save-draft', (_event, messageId: unknown, text: unknown) => {
    if (typeof messageId !== 'string' || typeof text !== 'string') {
      return mailState()
    }
    const next = upsertMailDraft(messageId, text)
    broadcastMail()
    return next
  })
  handle('mail:watch-sender', (_event, raw: unknown, watched: unknown) => {
    const next = toggleWatchedSender(
      typeof raw === 'string' ? raw : '',
      typeof watched === 'boolean' ? watched : undefined,
    )
    broadcastMail()
    return next
  })
  handle('mail:copy', (_event, text: unknown) => {
    if (typeof text === 'string' && text) {
      clipboard.writeText(text)
      return true
    }
    return false
  })
}

function parseAccountInput(raw: unknown): MailAccountInput {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const provider = typeof data.provider === 'string' && PROVIDERS.has(data.provider as MailProvider)
    ? (data.provider as MailProvider)
    : 'gmail'
  return {
    id: typeof data.id === 'string' ? data.id : undefined,
    provider,
    label: typeof data.label === 'string' ? data.label : undefined,
    email: typeof data.email === 'string' ? data.email : undefined,
    password: typeof data.password === 'string' ? data.password : undefined,
    enabled: typeof data.enabled === 'boolean' ? data.enabled : undefined,
  }
}

function asTriage(value: unknown): MailTriage | undefined {
  if (typeof value === 'string') {
    if (value === 'open' || value === 'follow' || value === 'archive' || value === 'ignore') {
      return value
    }
    return parseMailTriage(value)
  }
  return undefined
}
