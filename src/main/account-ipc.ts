import type { IpcRegistrar } from '../kernel/main/ipc'
import {
  isAccountPlatformId,
  type AccountMaterialInput,
  type AccountPostInput,
  type DayMetrics,
  type SocialAccountInput,
} from '../shared/accounts'
import {
  accountsState,
  addPost,
  removeAccount,
  removeMaterial,
  removePost,
  saveAccount,
  saveMaterial,
  saveMetrics,
  setDayMaterials,
} from './account-store'

export function registerAccountIpc(handle: IpcRegistrar): void {
  handle('accounts:state', () => accountsState())
  handle('accounts:save-account', (_event, raw: unknown) => {
    const input = parseAccount(raw)
    if (input) {
      saveAccount(input)
    }
    return accountsState()
  })
  handle('accounts:remove-account', (_event, id: unknown) => {
    if (typeof id === 'string') {
      removeAccount(id)
    }
    return accountsState()
  })
  handle('accounts:save-material', (_event, raw: unknown) => {
    const input = parseMaterial(raw)
    if (input) {
      saveMaterial(input)
    }
    return accountsState()
  })
  handle('accounts:remove-material', (_event, id: unknown) => {
    if (typeof id === 'string') {
      removeMaterial(id)
    }
    return accountsState()
  })
  handle('accounts:add-post', (_event, accountId: unknown, date: unknown, raw: unknown) => {
    if (typeof accountId === 'string' && typeof date === 'string') {
      const input = parsePost(raw)
      if (input) {
        addPost(accountId, date, input)
      }
    }
    return accountsState()
  })
  handle('accounts:remove-post', (_event, accountId: unknown, date: unknown, postId: unknown) => {
    if (typeof accountId === 'string' && typeof date === 'string' && typeof postId === 'string') {
      removePost(accountId, date, postId)
    }
    return accountsState()
  })
  handle('accounts:save-metrics', (_event, accountId: unknown, date: unknown, raw: unknown) => {
    if (typeof accountId === 'string' && typeof date === 'string') {
      saveMetrics(accountId, date, parseMetrics(raw))
    }
    return accountsState()
  })
  handle('accounts:set-materials', (_event, accountId: unknown, date: unknown, ids: unknown) => {
    if (typeof accountId === 'string' && typeof date === 'string' && Array.isArray(ids)) {
      setDayMaterials(
        accountId,
        date,
        ids.filter((id): id is string => typeof id === 'string'),
      )
    }
    return accountsState()
  })
}

function parseAccount(raw: unknown): SocialAccountInput | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const record = raw as SocialAccountInput
  if (!isAccountPlatformId(record.platform) || typeof record.name !== 'string') {
    return null
  }
  return {
    id: typeof record.id === 'string' ? record.id : undefined,
    platform: record.platform,
    name: record.name,
    handle: typeof record.handle === 'string' ? record.handle : '',
    note: typeof record.note === 'string' ? record.note : '',
  }
}

function parseMaterial(raw: unknown): AccountMaterialInput | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const record = raw as AccountMaterialInput
  if (typeof record.title !== 'string') {
    return null
  }
  return {
    id: typeof record.id === 'string' ? record.id : undefined,
    title: record.title,
    summary: typeof record.summary === 'string' ? record.summary : '',
    productId: typeof record.productId === 'string' ? record.productId : '',
  }
}

function parsePost(raw: unknown): AccountPostInput | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const record = raw as AccountPostInput
  if (typeof record.title !== 'string') {
    return null
  }
  return {
    title: record.title,
    body: typeof record.body === 'string' ? record.body : '',
    url: typeof record.url === 'string' ? record.url : '',
    format: typeof record.format === 'string' ? record.format : '短视频',
  }
}

function parseMetrics(raw: unknown): Partial<DayMetrics> {
  if (!raw || typeof raw !== 'object') {
    return {}
  }
  const record = raw as Partial<DayMetrics>
  return {
    views: Number(record.views) || 0,
    likes: Number(record.likes) || 0,
    comments: Number(record.comments) || 0,
    shares: Number(record.shares) || 0,
    saves: Number(record.saves) || 0,
    followers: Number(record.followers) || 0,
  }
}
