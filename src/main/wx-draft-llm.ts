import { kernelLlm, type LlmService } from '../kernel/main/services/llm'
import {
  applyWxDraftBodyEdits,
  formatBodyRevisionMessage,
  parseWxDraftBodyEdits,
  stripOrphanMarkdown,
  type WxDraftBodyEdit,
  type WxDraftBodyRevision,
} from '../shared/wx-draft-body'
import {
  fallbackDraftMeta,
  parseWxDraftAiMeta,
  type WxDraftAiMeta,
} from '../shared/wx-draft'

const BODY_MAX = 8000
const REVISE_MAX = 16_000

export async function summarizeWxDraft(
  markdown: string,
  signal?: AbortSignal,
): Promise<{ meta: WxDraftAiMeta; usedModel: boolean }> {
  const fallback = fallbackDraftMeta(markdown)
  const llm = kernelLlm()
  if (!llm?.hasKey()) {
    return { meta: fallback, usedModel: false }
  }
  try {
    const meta = await summarizeWithModel(llm, markdown, signal)
    return { meta: meta ?? fallback, usedModel: Boolean(meta) }
  } catch {
    return { meta: fallback, usedModel: false }
  }
}

/** 正文只做红线词 / 错别字短替换和未格式化标记清理；模型不可用时仍去标记。 */
export async function reviseWxDraftBody(
  markdown: string,
  signal?: AbortSignal,
): Promise<{ revision: WxDraftBodyRevision; usedModel: boolean; message: string }> {
  const stripped = stripOrphanMarkdown(markdown)
  const local: WxDraftBodyRevision = {
    markdown: stripped.markdown,
    orphanMarks: stripped.orphanMarks,
    applied: [],
  }
  const llm = kernelLlm()
  if (!llm?.hasKey()) {
    return { revision: local, usedModel: false, message: formatBodyRevisionMessage(local) }
  }
  try {
    const edits = await collectBodyEdits(llm, stripped.markdown, signal)
    const patched = applyWxDraftBodyEdits(stripped.markdown, edits)
    const revision: WxDraftBodyRevision = {
      markdown: patched.markdown,
      orphanMarks: stripped.orphanMarks,
      applied: patched.applied,
    }
    return { revision, usedModel: true, message: formatBodyRevisionMessage(revision) }
  } catch {
    return { revision: local, usedModel: false, message: formatBodyRevisionMessage(local) }
  }
}

async function summarizeWithModel(
  llm: LlmService,
  markdown: string,
  signal?: AbortSignal,
): Promise<WxDraftAiMeta | null> {
  const content = await llm.complete({
    system: [
      '你是公众号编辑。根据正文写即将存入微信草稿箱的元数据。',
      '只输出一个 JSON 对象，不要 Markdown。',
      '字段：title（中文标题，≤64 字，具体、有信息量，不要震惊体）、digest（中文摘要，≤120 字，写清文章在讲什么、读者能带走什么）。',
      '只根据正文事实，不要编造数据或结论。',
    ].join('\n'),
    messages: [{ role: 'user', content: clipBody(markdown) }],
    temperature: 0.4,
    timeoutMs: 20_000,
    signal,
  })
  return parseWxDraftAiMeta(content)
}

async function collectBodyEdits(
  llm: LlmService,
  markdown: string,
  signal?: AbortSignal,
): Promise<WxDraftBodyEdit[]> {
  const content = await llm.complete({
    system: [
      '你是公众号编辑，只校对即将写入微信草稿箱的正文，不改表意。',
      '只输出一个 JSON 对象，不要解释。字段：redlines（数组）、typos（数组）。',
      '每项含 from（原文中必须出现的短片段）、to（替换）；redlines 再给 reason。',
      '只允许两类改动：',
      '1. 红线词：微信公众号可能拦的违禁/擦边词，换成最接近原意的安全说法；换了就会改表意则不要改。',
      '2. 错别字：别字、明显笔误、同音误用。口语用词仅在确为笔误时改。',
      '禁止润色、扩写、缩写、调语序、改语气、改例子、改结论、改结构、补标题、删段落、统一文风。',
      'from ≤16 字，to ≤24 字，都不能含换行或句号。没有问题就输出 {"redlines":[],"typos":[]}。',
    ].join('\n'),
    messages: [{ role: 'user', content: clipBody(markdown, REVISE_MAX) }],
    temperature: 0.1,
    json: true,
    timeoutMs: 45_000,
    signal,
  })
  return parseWxDraftBodyEdits(content)
}

function clipBody(markdown: string, max = BODY_MAX): string {
  const chars = [...markdown]
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : markdown
}
