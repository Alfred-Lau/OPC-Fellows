import type { IpcRegistrar } from '../kernel/main/ipc'
import { isIdeaStatus, parsePainSources, type IdeaStatus, type MicroSourcingSettings } from '../shared/micro-sourcing'
import {
  loadMicroSourcing,
  microState,
  patchStoredIdea,
  saveMicroSettings,
} from './micro-sourcing-store'
import { broadcastMicro, scanMicroSourcing, scheduleMicroHeartbeat } from './micro-sourcing-sync'

export function registerMicroSourcingIpc(handle: IpcRegistrar): void {
  loadMicroSourcing()

  handle('micro:state', () => microState())
  handle('micro:scan', () => scanMicroSourcing())
  handle('micro:save-settings', (_event, input: unknown) => {
    const next = saveMicroSettings(parseSettingsInput(input))
    scheduleMicroHeartbeat()
    broadcastMicro()
    return next
  })
  handle('micro:patch-idea', (_event, id: unknown, patch: unknown) => {
    if (typeof id !== 'string' || !id) {
      return microState()
    }
    const next = patchStoredIdea(id, parseIdeaPatch(patch))
    broadcastMicro()
    return next
  })
}

function parseSettingsInput(value: unknown): Partial<MicroSourcingSettings> {
  if (!value || typeof value !== 'object') {
    return {}
  }
  const row = value as Partial<MicroSourcingSettings>
  return {
    heartbeatHours: typeof row.heartbeatHours === 'number' ? row.heartbeatHours : undefined,
    notify: typeof row.notify === 'boolean' ? row.notify : undefined,
    todoFollowUp: typeof row.todoFollowUp === 'boolean' ? row.todoFollowUp : undefined,
    proxyUrl: typeof row.proxyUrl === 'string' ? row.proxyUrl : undefined,
    customSources: Array.isArray(row.customSources) ? parsePainSources(row.customSources) : undefined,
    domains: row.domains,
  }
}

function parseIdeaPatch(value: unknown): { status?: IdeaStatus; note?: string } {
  if (!value || typeof value !== 'object') {
    return {}
  }
  const row = value as { status?: unknown; note?: unknown }
  return {
    status: isIdeaStatus(row.status) ? row.status : undefined,
    note: typeof row.note === 'string' ? row.note : undefined,
  }
}
