import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import {
  clampChannelScore,
  emptyGrowth,
  isAarrrStage,
  isChannelStatus,
  isExperimentStatus,
  isLoopKind,
  type GrowthChannel,
  type GrowthChannelInput,
  type GrowthExperiment,
  type GrowthExperimentInput,
  type GrowthLoop,
  type GrowthLoopInput,
  type GrowthState,
} from '../shared/growth'

const store: GrowthState = emptyGrowth()

export function growthStorePath(): string {
  return join(app.getPath('userData'), 'growth.json')
}

export function loadGrowth(): void {
  const path = growthStorePath()
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
    const record = parsed as { experiments?: unknown; loops?: unknown; channels?: unknown }
    store.experiments = Array.isArray(record.experiments) ? record.experiments.filter(isExperiment) : []
    store.loops = Array.isArray(record.loops) ? record.loops.filter(isLoop) : []
    store.channels = Array.isArray(record.channels) ? record.channels.filter(isChannel) : []
  } catch {
    reset()
  }
}

export function growthState(): GrowthState {
  return {
    experiments: [...store.experiments],
    loops: [...store.loops],
    channels: [...store.channels],
  }
}

export function saveExperiment(input: GrowthExperimentInput, now = new Date()): GrowthExperiment | null {
  const title = input.title.trim()
  if (!title) {
    return null
  }
  const existing = input.id ? store.experiments.find((item) => item.id === input.id) : undefined
  if (input.id && !existing) {
    return null
  }
  const experiment: GrowthExperiment = {
    id: existing?.id ?? crypto.randomUUID(),
    title,
    hypothesis: (input.hypothesis ?? existing?.hypothesis ?? '').trim(),
    metric: (input.metric ?? existing?.metric ?? '').trim(),
    stage: isAarrrStage(input.stage) ? input.stage : (existing?.stage ?? 'acquisition'),
    status: isExperimentStatus(input.status) ? input.status : (existing?.status ?? 'draft'),
    ideaId: (input.ideaId ?? existing?.ideaId ?? '').trim(),
    loopId: (input.loopId ?? existing?.loopId ?? '').trim(),
    channelId: (input.channelId ?? existing?.channelId ?? '').trim(),
    ammoNote: (input.ammoNote ?? existing?.ammoNote ?? '').trim(),
    note: (input.note ?? existing?.note ?? '').trim(),
    createdAt: existing?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
  }
  store.experiments = existing
    ? store.experiments.map((item) => (item.id === experiment.id ? experiment : item))
    : [experiment, ...store.experiments]
  persist()
  return experiment
}

export function removeExperiment(id: string): boolean {
  const before = store.experiments.length
  store.experiments = store.experiments.filter((item) => item.id !== id)
  if (store.experiments.length === before) {
    return false
  }
  persist()
  return true
}

export function saveLoop(input: GrowthLoopInput, now = new Date()): GrowthLoop | null {
  const title = input.title.trim()
  if (!title) {
    return null
  }
  const existing = input.id ? store.loops.find((item) => item.id === input.id) : undefined
  if (input.id && !existing) {
    return null
  }
  const loop: GrowthLoop = {
    id: existing?.id ?? crypto.randomUUID(),
    title,
    kind: isLoopKind(input.kind) ? input.kind : (existing?.kind ?? 'content'),
    steps: (input.steps ?? existing?.steps ?? '').trim(),
    productId: (input.productId ?? existing?.productId ?? '').trim(),
    note: (input.note ?? existing?.note ?? '').trim(),
    createdAt: existing?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
  }
  store.loops = existing
    ? store.loops.map((item) => (item.id === loop.id ? loop : item))
    : [loop, ...store.loops]
  persist()
  return loop
}

export function removeLoop(id: string): boolean {
  const before = store.loops.length
  store.loops = store.loops.filter((item) => item.id !== id)
  if (store.loops.length === before) {
    return false
  }
  persist()
  return true
}

export function saveChannel(input: GrowthChannelInput, now = new Date()): GrowthChannel | null {
  const name = input.name.trim()
  if (!name) {
    return null
  }
  const existing = input.id ? store.channels.find((item) => item.id === input.id) : undefined
  if (input.id && !existing) {
    return null
  }
  const channel: GrowthChannel = {
    id: existing?.id ?? crypto.randomUUID(),
    name,
    status: isChannelStatus(input.status) ? input.status : (existing?.status ?? 'testing'),
    stage: isAarrrStage(input.stage) ? input.stage : (existing?.stage ?? 'acquisition'),
    score: clampChannelScore(input.score ?? existing?.score ?? 3),
    productId: (input.productId ?? existing?.productId ?? '').trim(),
    note: (input.note ?? existing?.note ?? '').trim(),
    createdAt: existing?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
  }
  store.channels = existing
    ? store.channels.map((item) => (item.id === channel.id ? channel : item))
    : [channel, ...store.channels]
  persist()
  return channel
}

export function removeChannel(id: string): boolean {
  const before = store.channels.length
  store.channels = store.channels.filter((item) => item.id !== id)
  if (store.channels.length === before) {
    return false
  }
  persist()
  return true
}

function persist(): void {
  const path = growthStorePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(
    path,
    JSON.stringify({ experiments: store.experiments, loops: store.loops, channels: store.channels }, null, 2),
  )
}

function reset(): void {
  store.experiments = []
  store.loops = []
  store.channels = []
}

function isExperiment(value: unknown): value is GrowthExperiment {
  if (!value || typeof value !== 'object') {
    return false
  }
  const item = value as GrowthExperiment
  return typeof item.id === 'string' && typeof item.title === 'string' && isAarrrStage(item.stage) && isExperimentStatus(item.status)
}

function isLoop(value: unknown): value is GrowthLoop {
  if (!value || typeof value !== 'object') {
    return false
  }
  const item = value as GrowthLoop
  return typeof item.id === 'string' && typeof item.title === 'string' && isLoopKind(item.kind)
}

function isChannel(value: unknown): value is GrowthChannel {
  if (!value || typeof value !== 'object') {
    return false
  }
  const item = value as GrowthChannel
  return typeof item.id === 'string' && typeof item.name === 'string' && isChannelStatus(item.status)
}
