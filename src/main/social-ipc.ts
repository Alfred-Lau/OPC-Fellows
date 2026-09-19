import type { IpcRegistrar } from '../kernel/main/ipc'
import { collectFeatures, generateSocialCopy } from '../shared/social-copy'
import { isSocialPlatformId, type SocialMetricsInput } from '../shared/social'
import { polishSocialCopy } from './social-copy-llm'
import {
  discardSocialDraft,
  ingestSocialDrafts,
  publishSocialDraft,
  recordSocialMetrics,
  socialState,
} from './social-store'

export async function generateSocialAmmo() {
  const templates = generateSocialCopy(collectFeatures())
  const fresh = templates.filter((item) => !socialState().drafts.some((draft) => draft.fingerprint === item.fingerprint))
  const polished = await polishSocialCopy(fresh)
  const created = ingestSocialDrafts(polished.items)
  return socialState(created.length, polished.usedModel)
}

export function registerSocialIpc(handle: IpcRegistrar): void {
  handle('social:state', () => socialState())
  handle('social:generate', () => generateSocialAmmo())
  handle('social:publish', (_event, id: unknown, url: unknown) => {
    if (typeof id !== 'string') {
      return socialState()
    }
    publishSocialDraft(id, typeof url === 'string' ? url : '')
    return socialState()
  })
  handle('social:discard', (_event, id: unknown) => {
    if (typeof id === 'string') {
      discardSocialDraft(id)
    }
    return socialState()
  })
  handle('social:record', (_event, raw: unknown) => {
    const input = parseMetricsInput(raw)
    if (input) {
      recordSocialMetrics(input)
    }
    return socialState()
  })
}

function parseMetricsInput(raw: unknown): SocialMetricsInput | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const record = raw as SocialMetricsInput
  if (!isSocialPlatformId(record.platform) && !record.draftId) {
    return null
  }
  return {
    draftId: typeof record.draftId === 'string' ? record.draftId : null,
    platform: isSocialPlatformId(record.platform) ? record.platform : 'x',
    views: Number(record.views) || 0,
    likes: Number(record.likes) || 0,
    comments: Number(record.comments) || 0,
    shares: Number(record.shares) || 0,
    saves: Number(record.saves) || 0,
  }
}
