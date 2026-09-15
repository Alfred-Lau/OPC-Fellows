import { kernelLlm, type LlmService } from '../kernel/main/services/llm'
import {
  hydrateAnalysis,
  isPainDomain,
  isProductForm,
  type IdeaAnalysis,
  type PainSignal,
  type ProductIdea,
} from '../shared/micro-sourcing'

export async function polishMicroIdeas(
  ideas: ProductIdea[],
  signals: PainSignal[],
): Promise<{ ideas: ProductIdea[]; usedModel: boolean }> {
  if (ideas.length === 0) {
    return { ideas, usedModel: false }
  }
  const llm = kernelLlm()
  if (!llm?.hasKey()) {
    return { ideas, usedModel: false }
  }
  try {
    const polished = await investigateWithModel(llm, ideas, signals)
    return { ideas: applyInvestigated(ideas, polished), usedModel: polished.length > 0 }
  } catch {
    return { ideas, usedModel: false }
  }
}

interface InvestigatedRow {
  id: string
  title: string
  pain: string
  who: string
  workaround: string
  form: ProductIdea['form']
  domain: ProductIdea['domain']
  analysis: IdeaAnalysis
}

async function investigateWithModel(
  llm: LlmService,
  ideas: ProductIdea[],
  signals: PainSignal[],
): Promise<InvestigatedRow[]> {
  const compact = ideas.map((idea) => ({
    id: idea.id,
    postedDay: idea.postedDay,
    domain: idea.domain,
    form: idea.form,
    title: idea.title,
    draftSharpness: idea.analysis.sharpness,
    posts: idea.signalIds
      .map((id) => signals.find((signal) => signal.id === id))
      .filter((signal): signal is PainSignal => Boolean(signal))
      .slice(0, 6)
      .map((signal) => ({
        date: signal.postedDay,
        community: signal.community,
        score: signal.score,
        comments: signal.comments,
        paySignal: signal.paySignal,
        title: signal.title,
        body: signal.body.slice(0, 1_400),
        excerpts: signal.excerpts.slice(0, 6),
        url: signal.url,
      })),
  }))
  const content = await llm.complete({
    system: [
      '你是苛刻的一人公司选品调查员，不是教练，不是粉丝。只输出 JSON 数组，不要 Markdown。',
      '数组与输入等长、同序，保留每项 id。',
      '禁止迎合、禁止夸用户、禁止「很适合你」「很有潜力」「蓝海」。默认偏杀。',
      '禁止编造 TAM、增长率、融资额、用户数。市场判断只能用输入帖里能核对的事实：发帖日、社区、赞、评、原话、是否写出付费意愿。',
      'title: 中文产品一句话，不要口号。pain / who / workaround: 用帖里的人怎么说，不要替他们发明。',
      'form 只能是 chrome | ai-micro | notion | saas | unknown。domain 只能是 creator | ecommerce | productivity | indie。',
      'analysis.verdict 只能是 build | watch | kill。单帖或无付费原话优先 kill；build 必须同时有付费原话、可核对的 workaround、两人公司两周内能做出的形态。',
      'analysis.sharpness: 锐评，指出伪需求、红海、分发死、证据不足。',
      'analysis.market: 基于这些帖的市场观察，写清样本日期和社区，明确「不能外推」。',
      'analysis.evidence: 3-6 条，每条必须带社区+日期+赞/评或原句。',
      'analysis.competitors / whyHard / opcFit: 点名帖里出现的现成工具；说清一人公司做不起什么。',
    ].join('\n'),
    messages: [{ role: 'user', content: JSON.stringify(compact) }],
    temperature: 0.2,
    timeoutMs: 55_000,
  })
  const json = content.replace(/```json|```/g, '').trim()
  const start = json.indexOf('[')
  const end = json.lastIndexOf(']')
  if (start < 0 || end < 0) {
    return []
  }
  const raw = JSON.parse(json.slice(start, end + 1)) as unknown
  if (!Array.isArray(raw)) {
    return []
  }
  return raw.flatMap((row) => {
    const parsed = parseRow(row)
    return parsed ? [parsed] : []
  })
}

function parseRow(value: unknown): InvestigatedRow | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.pain !== 'string') {
    return null
  }
  const analysis = hydrateAnalysis(row.analysis ?? row)
  return {
    id: row.id,
    title: row.title.trim(),
    pain: row.pain.trim(),
    who: typeof row.who === 'string' ? row.who.trim() : '',
    workaround: typeof row.workaround === 'string' ? row.workaround.trim() : '',
    form: isProductForm(row.form) ? row.form : 'unknown',
    domain: isPainDomain(row.domain) ? row.domain : 'indie',
    analysis: {
      ...analysis,
      verdict: analysis.verdict === 'unknown' ? 'kill' : analysis.verdict,
    },
  }
}

function applyInvestigated(ideas: ProductIdea[], polished: InvestigatedRow[]): ProductIdea[] {
  if (polished.length === 0) {
    return ideas
  }
  const byId = new Map(polished.map((row) => [row.id, row]))
  return ideas.map((idea) => {
    const row = byId.get(idea.id)
    if (!row || !row.title) {
      return idea
    }
    return {
      ...idea,
      title: row.title,
      pain: row.pain || idea.pain,
      who: row.who || idea.who,
      workaround: row.workaround || idea.workaround,
      form: row.form === 'unknown' ? idea.form : row.form,
      domain: row.domain,
      usedModel: true,
      analysis: row.analysis.sharpness ? row.analysis : idea.analysis,
    }
  })
}
