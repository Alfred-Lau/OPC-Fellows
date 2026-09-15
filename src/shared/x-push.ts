import type { SocialDraft } from './social.ts'

export interface XPushStatus {
  available: boolean
  authed: boolean
  username: string | null
  xurlPath: string | null
  message: string
}

export type XPushSendResult =
  | { ok: true; queued: true; text: string; queueLength: number; postId?: string; url?: string }
  | { ok: false; error: string; code: string }

/** X 免费层 280 字符限制(普通账号) */
export const X_POST_LIMIT = 280

/**
 * 把 X 平台社媒弹药草稿转成推文文本:
 * 标题 + 正文 + 标签 + 产品链接,超 280 字符从正文截断。
 */
export function buildXPostText(draft: Pick<SocialDraft, 'title' | 'body' | 'tags' | 'productUrl'>): string {
  const tags = draft.tags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(' ')
  const parts: string[] = []
  if (draft.title) parts.push(draft.title)
  if (draft.body) parts.push(draft.body)
  if (tags) parts.push(tags)
  if (draft.productUrl) parts.push(draft.productUrl)
  let text = parts.join('\n\n').trim()

  if (text.length > X_POST_LIMIT) {
    // 优先保留标题 + 链接,从正文中间截断
    const title = draft.title ? `${draft.title}\n\n` : ''
    const tail = [tags, draft.productUrl].filter(Boolean).join('\n')
    // 分隔符:title 与 body 之间、body 与 tail 之间各 2 字符
    const bodyBudget = X_POST_LIMIT - title.length - tail.length - (title ? 2 : 0) - (tail ? 2 : 0)
    if (bodyBudget > 40) {
      const body = draft.body.length > bodyBudget
        ? `${draft.body.slice(0, bodyBudget - 1)}…`
        : draft.body
      text = [title, body, tail].filter(Boolean).join('\n\n')
    } else {
      text = `${text.slice(0, X_POST_LIMIT - 1)}…`
    }
  }
  return text
}
