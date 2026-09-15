import { clipboard, shell } from 'electron'
import type { IpcRegistrar } from '../kernel/main/ipc'
import { pickHubHome } from './wechat-hub-cli'
import {
  loadWechatHub,
  wechatHubState,
} from './wechat-hub-store'
import {
  broadcastWechatHub,
  lookupWechat,
  refreshWechatCoverage,
  refreshWechatHub,
  saveHubSettings,
  scheduleWechatHeartbeat,
  triageWechat,
} from './wechat-hub-sync'
import { HUB_INSTALL_URL, type WechatHubSettings } from '../shared/wechat-hub'

export function registerWechatHubIpc(handle: IpcRegistrar): void {
  loadWechatHub()

  handle('wxhub:state', () => wechatHubState())
  handle('wxhub:probe', () => refreshWechatCoverage())
  handle('wxhub:refresh', () => refreshWechatHub())
  handle('wxhub:lookup', (_event, kind: unknown, query: unknown) => lookupWechat(kind, query))
  handle('wxhub:triage', (_event, id: unknown, decision: unknown, followUp?: unknown, note?: unknown) =>
    triageWechat(id, decision, followUp, note),
  )
  handle('wxhub:save-settings', (_event, input: unknown) => {
    const next = saveHubSettings(parseSettingsInput(input))
    scheduleWechatHeartbeat()
    broadcastWechatHub()
    return next
  })
  handle('wxhub:pick-home', async () => {
    const folder = await pickHubHome()
    if (!folder) {
      return wechatHubState()
    }
    const next = saveHubSettings({ hubHome: folder })
    scheduleWechatHeartbeat()
    broadcastWechatHub()
    return next
  })
  handle('wxhub:copy', (_event, text: unknown) => {
    if (typeof text === 'string' && text) {
      clipboard.writeText(text)
      return true
    }
    return false
  })
  handle('wxhub:open-install', async () => {
    await shell.openExternal(HUB_INSTALL_URL)
    return true
  })
}

function parseSettingsInput(value: unknown): Partial<WechatHubSettings> {
  if (!value || typeof value !== 'object') {
    return {}
  }
  const row = value as Partial<WechatHubSettings>
  return {
    hubHome: typeof row.hubHome === 'string' ? row.hubHome : undefined,
    heartbeatHours: typeof row.heartbeatHours === 'number' ? row.heartbeatHours : undefined,
    notify: typeof row.notify === 'boolean' ? row.notify : undefined,
    todoFollowUp: typeof row.todoFollowUp === 'boolean' ? row.todoFollowUp : undefined,
  }
}
