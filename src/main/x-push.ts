import type { IpcRegistrar } from '../kernel/main/ipc'
import { buildXPostText, type XPushSendResult } from '../shared/x-push'
import { getSocialDraft, publishSocialDraft } from './social-store'
import { enqueueXTask, xBridgeStatus } from './x-bridge'

/**
 * X 发推 —— 走本地桥 → mcn 插件 DOM 发布(零 API 成本)。
 * 2026-02 起 X API 取消免费层(发推含链接 $0.2/条),不再使用 xurl。
 */

/** 发推(排队到插件执行)。成功后可选回写 publishedUrl(插件能取到 URL 时)。 */
export async function sendXPost(draftId: string): Promise<XPushSendResult> {
  const draft = getSocialDraft(draftId)
  if (!draft) return { ok: false, error: '草稿不存在', code: 'DRAFT_NOT_FOUND' }
  if (draft.platform !== 'x') return { ok: false, error: '仅支持 X 平台草稿', code: 'WRONG_PLATFORM' }
  if (draft.publishedAt) return { ok: false, error: '该草稿已发布', code: 'ALREADY_PUBLISHED' }

  const text = buildXPostText(draft)
  const result = enqueueXTask({ action: 'post', text })
  if (!result.queued) return { ok: false, error: '本地桥未启动(端口 18753 不可用)', code: 'BRIDGE_OFFLINE' }
  return { ok: true, queued: true, text, queueLength: result.queueLength }
}

export function registerXPushIpc(handle: IpcRegistrar): void {
  handle('xpush:status', () => xBridgeStatus())
  handle('xpush:send', (_event, draftId: string) => sendXPost(String(draftId)))
}

// 保留类型兼容:DOM 发布无法可靠取回推文 URL,由用户手动贴链接标记发布
export { publishSocialDraft }
