import { kernelLlm, type LlmService } from '../kernel/main/services/llm'
import type { SocialDraftInput } from '../shared/social'

export async function polishSocialCopy(inputs: SocialDraftInput[]): Promise<{ items: SocialDraftInput[]; usedModel: boolean }> {
  if (inputs.length === 0) {
    return { items: inputs, usedModel: false }
  }
  const llm = kernelLlm()
  if (!llm?.hasKey()) {
    return { items: inputs, usedModel: false }
  }
  try {
    const polished = await polishWithModel(llm, inputs)
    return { items: polished.length === inputs.length ? polished : inputs, usedModel: polished.length === inputs.length }
  } catch {
    return { items: inputs, usedModel: false }
  }
}

async function polishWithModel(llm: LlmService, inputs: SocialDraftInput[]): Promise<SocialDraftInput[]> {
  const content = await llm.complete({
    system: [
      '你是一人公司（OPC）的社媒编辑。只输出 JSON 数组，不要 Markdown。',
      '数组与输入等长、同序。每项保留 fingerprint/platform/productId/productName/productUrl/featureTitle/format。',
      '可改 title/body/outline/tags/mediaBrief。海外平台（x/youtube/linkedin）用英文；国内用中文。',
      '硬限制：x.body ≤280 字；xiaohongshu.title ≤20 字、body ≤1000 字；youtube.title ≤100 字；linkedin.body ≤3000 字；douyin.title ≤60 字。',
      '口吻像建造者，不写营销腔、不保证效果、不导微信二维码。小红书可在文末提示 AI 声明。',
    ].join('\n'),
    messages: [{ role: 'user', content: JSON.stringify(inputs) }],
    temperature: 0.4,
    timeoutMs: 20_000,
  })
  const json = content.replace(/```json|```/g, '').trim()
  const start = json.indexOf('[')
  const end = json.lastIndexOf(']')
  if (start < 0 || end < 0) {
    return []
  }
  const raw = JSON.parse(json.slice(start, end + 1)) as unknown
  if (!Array.isArray(raw) || raw.length !== inputs.length) {
    return []
  }
  return inputs.map((input, index) => mergePolished(input, raw[index]))
}

function mergePolished(input: SocialDraftInput, row: unknown): SocialDraftInput {
  if (!row || typeof row !== 'object') {
    return input
  }
  const record = row as Partial<SocialDraftInput>
  return {
    ...input,
    title: text(record.title, input.title),
    body: text(record.body, input.body),
    outline: text(record.outline, input.outline),
    mediaBrief: text(record.mediaBrief, input.mediaBrief),
    tags: Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0).slice(0, 10)
      : input.tags,
  }
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}
