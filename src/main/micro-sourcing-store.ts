import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import {
  DEFAULT_MICRO_SETTINGS,
  isIdeaStatus,
  isPainDomain,
  isProductForm,
  hydrateIdea,
  hydrateSignal,
  normalizeProxyUrl,
  parsePainSources,
  type IdeaStatus,
  type MicroSourcingSettings,
  type MicroSourcingState,
  type PainSignal,
  type ProductIdea,
  type ScanRun,
  type SignalSourceKind,
} from '../shared/micro-sourcing'

interface StoredFile {
  settings: MicroSourcingSettings
  signals: PainSignal[]
  ideas: ProductIdea[]
  lastRun: ScanRun | null
}

const store: StoredFile = {
  settings: cloneSettings(DEFAULT_MICRO_SETTINGS),
  signals: [],
  ideas: [],
  lastRun: null,
}

let scanning = false
let lastError: string | null = null
let loaded = false

export function microSourcingPath(): string {
  return join(app.getPath('userData'), 'micro-sourcing.json')
}

export function loadMicroSourcing(): MicroSourcingState {
  if (loaded) {
    return microState()
  }
  loaded = true
  const path = microSourcingPath()
  if (!existsSync(path)) {
    return microState()
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    const file = asRecord(parsed)
    if (!file) {
      return microState()
    }
    store.settings = parseSettings(file.settings)
    store.signals = Array.isArray(file.signals) ? file.signals.filter(isSignal).map((row) => hydrateSignal(row)) : []
    store.ideas = Array.isArray(file.ideas) ? file.ideas.filter(isIdea).map((row) => hydrateIdea(row)) : []
    store.lastRun = isScanRun(file.lastRun) ? file.lastRun : null
  } catch {
    lastError = '本地选品存档读失败，已从空状态开始。'
  }
  return microState()
}

export function microState(): MicroSourcingState {
  return {
    settings: cloneSettings(store.settings),
    signals: store.signals,
    ideas: store.ideas,
    lastRun: store.lastRun,
    scanning,
    lastError,
  }
}

export function microSettings(): MicroSourcingSettings {
  return cloneSettings(store.settings)
}

export function setMicroScanning(value: boolean): void {
  scanning = value
}

export function setMicroLastError(value: string | null): void {
  lastError = value
}

export function saveMicroSettings(input: Partial<MicroSourcingSettings>): MicroSourcingState {
  store.settings = {
    heartbeatHours: clampHours(input.heartbeatHours ?? store.settings.heartbeatHours),
    notify: input.notify ?? store.settings.notify,
    todoFollowUp: input.todoFollowUp ?? store.settings.todoFollowUp,
    proxyUrl: input.proxyUrl !== undefined ? normalizeProxyUrl(input.proxyUrl) : store.settings.proxyUrl,
    customSources: input.customSources ?? store.settings.customSources,
    domains: {
      creator: input.domains?.creator ?? store.settings.domains.creator,
      ecommerce: input.domains?.ecommerce ?? store.settings.domains.ecommerce,
      productivity: input.domains?.productivity ?? store.settings.domains.productivity,
      indie: input.domains?.indie ?? store.settings.domains.indie,
    },
  }
  persist()
  return microState()
}

export function saveMicroScan(input: {
  signals: PainSignal[]
  ideas: ProductIdea[]
  lastRun: ScanRun
  error: string | null
}): MicroSourcingState {
  store.signals = input.signals
  store.ideas = input.ideas
  store.lastRun = input.lastRun
  lastError = input.error
  persist()
  return microState()
}

export function patchStoredIdea(id: string, patch: { status?: IdeaStatus; note?: string }): MicroSourcingState {
  store.ideas = store.ideas.map((idea) => {
    if (idea.id !== id) {
      return idea
    }
    return {
      ...idea,
      status: patch.status ?? idea.status,
      note: patch.note ?? idea.note,
    }
  })
  persist()
  return microState()
}

function persist(): void {
  const path = microSourcingPath()
  mkdirSync(dirname(path), { recursive: true })
  const payload: StoredFile = {
    settings: store.settings,
    signals: store.signals,
    ideas: store.ideas,
    lastRun: store.lastRun,
  }
  writeFileSync(path, JSON.stringify(payload))
}

function cloneSettings(settings: MicroSourcingSettings): MicroSourcingSettings {
  return {
    heartbeatHours: settings.heartbeatHours,
    notify: settings.notify,
    todoFollowUp: settings.todoFollowUp,
    proxyUrl: settings.proxyUrl,
    customSources: settings.customSources.map((source) => ({ ...source })),
    domains: { ...settings.domains },
  }
}

function clampHours(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }
  const allowed = [6, 12, 24, 48]
  return allowed.includes(value) ? value : 24
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function parseSettings(value: unknown): MicroSourcingSettings {
  const row = asRecord(value)
  const domains = asRecord(row?.domains)
  return {
    heartbeatHours: clampHours(typeof row?.heartbeatHours === 'number' ? row.heartbeatHours : DEFAULT_MICRO_SETTINGS.heartbeatHours),
    notify: row?.notify !== false,
    todoFollowUp: row?.todoFollowUp !== false,
    proxyUrl: typeof row?.proxyUrl === 'string' ? normalizeProxyUrl(row.proxyUrl) : '',
    customSources: parsePainSources(row?.customSources),
    domains: {
      creator: domains?.creator !== false,
      ecommerce: domains?.ecommerce !== false,
      productivity: domains?.productivity !== false,
      indie: domains?.indie !== false,
    },
  }
}

function isSourceKind(value: unknown): value is SignalSourceKind {
  return value === 'reddit' || value === 'hn' || value === 'appstore' || value === 'x'
}

function isSignal(value: unknown): value is PainSignal {
  const row = asRecord(value)
  if (!row) {
    return false
  }
  return (
    typeof row.id === 'string' &&
    isSourceKind(row.source) &&
    typeof row.title === 'string' &&
    typeof row.url === 'string' &&
    isPainDomain(row.domain) &&
    isProductForm(row.form) &&
    typeof row.composite === 'number'
  )
}

function isIdea(value: unknown): value is ProductIdea {
  const row = asRecord(value)
  if (!row) {
    return false
  }
  return (
    typeof row.id === 'string' &&
    typeof row.title === 'string' &&
    isPainDomain(row.domain) &&
    isProductForm(row.form) &&
    isIdeaStatus(row.status) &&
    Array.isArray(row.signalIds)
  )
}

function isScanRun(value: unknown): value is ScanRun {
  const row = asRecord(value)
  return Boolean(row && typeof row.at === 'string' && typeof row.signalCount === 'number')
}
