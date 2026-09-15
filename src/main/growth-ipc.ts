import type { IpcRegistrar } from '../kernel/main/ipc'
import {
  isAarrrStage,
  isChannelStatus,
  isExperimentStatus,
  isLoopKind,
  type GrowthChannelInput,
  type GrowthExperimentInput,
  type GrowthLoopInput,
} from '../shared/growth'
import {
  growthState,
  removeChannel,
  removeExperiment,
  removeLoop,
  saveChannel,
  saveExperiment,
  saveLoop,
} from './growth-store'

export function registerGrowthIpc(handle: IpcRegistrar): void {
  handle('growth:state', () => growthState())
  handle('growth:save-experiment', (_event, raw: unknown) => {
    const input = parseExperiment(raw)
    if (input) {
      saveExperiment(input)
    }
    return growthState()
  })
  handle('growth:remove-experiment', (_event, id: unknown) => {
    if (typeof id === 'string') {
      removeExperiment(id)
    }
    return growthState()
  })
  handle('growth:save-loop', (_event, raw: unknown) => {
    const input = parseLoop(raw)
    if (input) {
      saveLoop(input)
    }
    return growthState()
  })
  handle('growth:remove-loop', (_event, id: unknown) => {
    if (typeof id === 'string') {
      removeLoop(id)
    }
    return growthState()
  })
  handle('growth:save-channel', (_event, raw: unknown) => {
    const input = parseChannel(raw)
    if (input) {
      saveChannel(input)
    }
    return growthState()
  })
  handle('growth:remove-channel', (_event, id: unknown) => {
    if (typeof id === 'string') {
      removeChannel(id)
    }
    return growthState()
  })
}

function parseExperiment(raw: unknown): GrowthExperimentInput | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const record = raw as GrowthExperimentInput
  if (typeof record.title !== 'string') {
    return null
  }
  return {
    id: typeof record.id === 'string' ? record.id : undefined,
    title: record.title,
    hypothesis: typeof record.hypothesis === 'string' ? record.hypothesis : '',
    metric: typeof record.metric === 'string' ? record.metric : '',
    stage: isAarrrStage(record.stage) ? record.stage : undefined,
    status: isExperimentStatus(record.status) ? record.status : undefined,
    ideaId: typeof record.ideaId === 'string' ? record.ideaId : '',
    loopId: typeof record.loopId === 'string' ? record.loopId : '',
    channelId: typeof record.channelId === 'string' ? record.channelId : '',
    ammoNote: typeof record.ammoNote === 'string' ? record.ammoNote : '',
    note: typeof record.note === 'string' ? record.note : '',
  }
}

function parseLoop(raw: unknown): GrowthLoopInput | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const record = raw as GrowthLoopInput
  if (typeof record.title !== 'string') {
    return null
  }
  return {
    id: typeof record.id === 'string' ? record.id : undefined,
    title: record.title,
    kind: isLoopKind(record.kind) ? record.kind : undefined,
    steps: typeof record.steps === 'string' ? record.steps : '',
    productId: typeof record.productId === 'string' ? record.productId : '',
    note: typeof record.note === 'string' ? record.note : '',
  }
}

function parseChannel(raw: unknown): GrowthChannelInput | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const record = raw as GrowthChannelInput
  if (typeof record.name !== 'string') {
    return null
  }
  return {
    id: typeof record.id === 'string' ? record.id : undefined,
    name: record.name,
    status: isChannelStatus(record.status) ? record.status : undefined,
    stage: isAarrrStage(record.stage) ? record.stage : undefined,
    score: typeof record.score === 'number' ? record.score : undefined,
    productId: typeof record.productId === 'string' ? record.productId : '',
    note: typeof record.note === 'string' ? record.note : '',
  }
}
