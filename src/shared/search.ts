import type { WorkbenchFeature, WorkbenchView } from './features.ts'
import type { TodoItem } from './todo.ts'

export type SearchKind = 'view' | 'todo'
export type SearchTarget = WorkbenchView

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

export function buildSearchIndex(input: {
  features: WorkbenchFeature[]
  todos: TodoItem[]
}): SearchDoc[] {
  const docs: SearchDoc[] = []
  for (const feature of input.features) {
    const extra =
      feature.id === 'social-ammo'
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
      preview: feature.id === 'prefs' ? '工作台' : feature.id === 'extensions' ? '技能' : '模块',
      haystack: `${feature.title} ${feature.id} ${feature.mark} ${extra}`,
      target: feature.view ?? 'home',
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
