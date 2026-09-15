import type { AgentTodoDraft } from './agent-inbox.ts'
import { dayKey, toIsoLocal, tomorrowMorning } from './datetime.ts'
import { MICRO_TAG, todayIdeas, type ProductIdea } from './micro-sourcing.ts'

const MAX_PROPOSALS = 3

export function proposeMicroTodos(ideas: ProductIdea[], now = new Date()): AgentTodoDraft[] {
  const notifyAt = toIsoLocal(tomorrowMorning(now))
  const stamp = dayKey(now)
  return todayIdeas(ideas, now)
    .filter((idea) => idea.status === 'new' && idea.rank <= MAX_PROPOSALS)
    .slice(0, MAX_PROPOSALS)
    .map((idea) => ({
      title: `验证选品：${idea.title}`,
      note: [
        idea.pain,
        `发帖日 ${idea.postedDay} · 领域 ${idea.domain} · 形态 ${idea.form} · 痛感 ${idea.painScore} · 热度 ${idea.heat}`,
        idea.paySignals > 0 ? `有 ${idea.paySignals} 条付费信号` : '尚未看到明确付费意愿',
        idea.analysis.sharpness,
        idea.analysis.verdict !== 'unknown' ? `判决 ${idea.analysis.verdict}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      notifyAt,
      tags: [MICRO_TAG],
      dedupeKey: `micro:${idea.id}:${stamp}`,
    }))
}
