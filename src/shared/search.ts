import type { AccountPlatformId, SocialAccount } from './accounts.ts'
import type { WorkbenchFeature, WorkbenchView } from './features.ts'
import type { NoteItem } from './note.ts'
import type { TodoItem } from './todo.ts'

export type SearchKind = 'view' | 'todo' | 'note' | 'account'
export type SearchTarget = WorkbenchView | 'harness'

export interface SearchDoc {
  id: string
  kind: SearchKind
  title: string
  preview: string
  haystack: string
  target: SearchTarget
}

export interface SearchHit extends Omit<SearchDoc, 'haystack'> {
  score: number
}

export function firstLine(text: string): string {
  return text.split(/\r?\n/, 1)[0]?.trim() || text
}

const PLATFORM_NAME: Record<AccountPlatformId, string> = {
  xiaohongshu: '小红书',
  channels: '视频号',
  douyin: '抖音',
}

export function buildSearchIndex(input: {
  features: WorkbenchFeature[]
  todos: TodoItem[]
  notes: NoteItem[]
  accounts?: SocialAccount[]
}): SearchDoc[] {
  const docs: SearchDoc[] = []
  for (const feature of input.features) {
    const extra =
      feature.id === 'accounts'
        ? '自媒体 账号管理 视频号 抖音 小红书'
        : feature.id === 'payments'
          ? '收款 财务 Creem 订阅 交易 客户 结算 提现 支出 分账 知识星球 扫码 Patreon Ko-fi YouTube 视频号 抖音 小红书 payments revenue MRR'
            : feature.id === 'micro'
            ? '选品 Micro SaaS 痛点 pain Reddit HN idea Chrome 插件 Notion 独立站 自媒体'
            : feature.id === 'growth'
              ? '增长 黑客 实验 漏斗 AARRR 获客 激活 留存 推荐 渠道 增长环 GEO SEO'
            : feature.id === 'wxhub'
              ? '微信 情报 聊天 待回复 商机 复联 WeChat Intelligence Hub 本机'
              : feature.id === 'mail'
                ? '邮件 邮箱 收件箱 iCloud Gmail QQ 本机邮件 整理 回信'
                : feature.id === 'social-ammo'
                ? '社媒 弹药 文案 X YouTube LinkedIn 小红书 视频号 抖音 互动'
                : feature.id === 'prefs'
                  ? '设置 用户中心 外观 主题 工作情况 显示名'
                  : feature.id === 'extensions'
                    ? '技能 扩展 模块 仓库 能力包'
                    : ''
    docs.push({
      id: `view:${feature.id}`,
      kind: 'view',
      title: feature.title,
      preview:
        feature.kind === 'harness' ? '外窗' : feature.id === 'prefs' ? '工作台' : feature.id === 'extensions' ? '技能' : '模块',
      haystack: `${feature.title} ${feature.id} ${feature.mark} ${extra}`,
      target: feature.kind === 'harness' ? 'harness' : (feature.view ?? 'home'),
    })
  }
  for (const todo of input.todos) {
    docs.push({
      id: todo.id,
      kind: 'todo',
      title: todo.title,
      preview: todo.done ? '已完成' : todo.tags.join(' · ') || '待办',
      haystack: `${todo.title} ${todo.tags.join(' ')} ${todo.note ?? ''}`,
      target: 'todos',
    })
  }
  for (const note of input.notes) {
    docs.push({
      id: note.id,
      kind: 'note',
      title: firstLine(note.text),
      preview: '随手记',
      haystack: note.text,
      target: 'notes',
    })
  }
  for (const account of input.accounts ?? []) {
    const platform = PLATFORM_NAME[account.platform]
    docs.push({
      id: account.id,
      kind: 'account',
      title: account.name,
      preview: platform,
      haystack: `${account.name} ${account.handle} ${account.note} ${platform} ${account.platform}`,
      target: 'accounts',
    })
  }
  return docs
}

export function searchDocs(docs: SearchDoc[], query: string, limit = 24): SearchHit[] {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) {
    return []
  }
  return docs
    .map((doc) => ({
      id: doc.id,
      kind: doc.kind,
      title: doc.title,
      preview: doc.preview,
      target: doc.target,
      score: scoreDoc(doc, tokens),
    }))
    .filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, 'zh'))
    .slice(0, limit)
}

function scoreDoc(doc: SearchDoc, tokens: string[]): number {
  const title = doc.title.toLowerCase()
  const hay = `${title} ${doc.haystack}`.toLowerCase()
  if (!tokens.every((token) => hay.includes(token))) {
    return 0
  }
  let score = 1
  if (tokens.every((token) => title.includes(token))) {
    score += 20
  }
  if (title.startsWith(tokens[0] ?? '')) {
    score += 12
  }
  if (doc.kind === 'view') {
    score += 4
  }
  return score
}
