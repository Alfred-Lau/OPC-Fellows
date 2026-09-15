import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import {
  isSocialPlatformId,
  summarizeSocial,
  type SocialDraft,
  type SocialDraftInput,
  type SocialMetrics,
  type SocialMetricsInput,
  type SocialState,
} from '../shared/social'

const store = {
  drafts: [] as SocialDraft[],
  metrics: [] as SocialMetrics[],
}

export function socialStorePath(): string {
  return join(app.getPath('userData'), 'social.json')
}

export function loadSocial(): void {
  const path = socialStorePath()
  if (!existsSync(path)) {
    store.drafts = []
    store.metrics = []
    return
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object') {
      store.drafts = []
      store.metrics = []
      return
    }
    const record = parsed as { drafts?: unknown; metrics?: unknown }
    store.drafts = Array.isArray(record.drafts) ? record.drafts.filter(isDraft) : []
    store.metrics = Array.isArray(record.metrics) ? record.metrics.filter(isMetrics) : []
  } catch {
    store.drafts = []
    store.metrics = []
  }
}

export function socialState(generated = 0, usedModel = false, now = new Date()): SocialState {
  return {
    drafts: [...store.drafts],
    metrics: [...store.metrics],
    stats: summarizeSocial(store.drafts, store.metrics, now),
    generated,
    usedModel,
  }
}

export function ingestSocialDrafts(inputs: SocialDraftInput[], now = new Date()): SocialDraft[] {
  const created: SocialDraft[] = []
  for (const input of inputs) {
    if (store.drafts.some((item) => item.fingerprint === input.fingerprint)) {
      continue
    }
    const draft: SocialDraft = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: now.toISOString(),
      publishedAt: null,
      publishedUrl: null,
    }
    store.drafts = [draft, ...store.drafts]
    created.push(draft)
  }
  if (created.length > 0) {
    persist()
  }
  return created
}

export function getSocialDraft(id: string): SocialDraft | null {
  return store.drafts.find((item) => item.id === id) ?? null
}

export function publishSocialDraft(id: string, url: string, now = new Date()): SocialDraft | null {
  const draft = store.drafts.find((item) => item.id === id)
  if (!draft) {
    return null
  }
  draft.publishedAt = now.toISOString()
  draft.publishedUrl = url.trim() || null
  persist()
  return draft
}

export function discardSocialDraft(id: string): boolean {
  const draft = store.drafts.find((item) => item.id === id)
  if (!draft || draft.publishedAt) {
    return false
  }
  store.drafts = store.drafts.filter((item) => item.id !== id)
  persist()
  return true
}

export function recordSocialMetrics(input: SocialMetricsInput, now = new Date()): SocialMetrics | null {
  const draftId = input.draftId ?? null
  const platform = draftId ? store.drafts.find((item) => item.id === draftId)?.platform : input.platform
  if (!platform || !isSocialPlatformId(platform)) {
    return null
  }
  const row: SocialMetrics = {
    id: crypto.randomUUID(),
    draftId,
    platform,
    recordedAt: now.toISOString(),
    views: nonNeg(input.views),
    likes: nonNeg(input.likes),
    comments: nonNeg(input.comments),
    shares: nonNeg(input.shares),
    saves: nonNeg(input.saves),
  }
  store.metrics = [row, ...store.metrics]
  persist()
  return row
}

function persist(): void {
  const path = socialStorePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ drafts: store.drafts, metrics: store.metrics }, null, 2))
}

function nonNeg(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) {
    return 0
  }
  return Math.round(n)
}

function isDraft(value: unknown): value is SocialDraft {
  if (!value || typeof value !== 'object') {
    return false
  }
  const item = value as SocialDraft
  return (
    typeof item.id === 'string' &&
    typeof item.fingerprint === 'string' &&
    isSocialPlatformId(item.platform) &&
    typeof item.productId === 'string' &&
    typeof item.body === 'string' &&
    (item.ideaId === undefined || typeof item.ideaId === 'string')
  )
}

function isMetrics(value: unknown): value is SocialMetrics {
  if (!value || typeof value !== 'object') {
    return false
  }
  const item = value as SocialMetrics
  return typeof item.id === 'string' && isSocialPlatformId(item.platform) && typeof item.recordedAt === 'string'
}
