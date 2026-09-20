import type { AgentRecord } from '../../kernel/shared/agent'
import { isRosterAgent } from '../../kernel/shared/agents'
import { flagArg, occupationInvokeSpec, pinnedArg, type OccupationReveal } from '../../kernel/shared/occupation-tools'
import { asSkillReply, type ShortListing, type SkillReply } from '../../shared/listing'
import { activateSocial } from './social'

/**
 * 口令快路径：只负责亮 Panel，执行走主进程 ctx.tools。
 */
export async function runSkillInvoke(
  agentId: string,
  invoke: string,
  text: string,
  agents: AgentRecord[],
  listing?: ShortListing,
): Promise<SkillReply> {
  const spec = occupationInvokeSpec(invoke)
  if (!spec) {
    return asSkillReply('对不上这条 Skill。')
  }
  revealOccupation(spec.reveal)
  const agent = agents.find((item) => item.id === agentId)
  const hasAmmo = agents.some(
    (item) => isRosterAgent(item) && item.moduleIds.includes('social-ammo') && item.status !== 'needs-module',
  )
  const result = await window.ownworkbuddy.tools.invoke(spec.tool, {
    text,
    pinned: pinnedArg(listing?.ids),
    has_ammo: flagArg(hasAmmo),
    agent_id: agent?.id ?? agentId,
  })
  return asSkillReply(result.text, result.listing)
}

function revealOccupation(reveal: OccupationReveal | undefined): void {
  if (!reveal) {
    return
  }
  // 公开仓只保留 social；其余职业 reveal 已删，不再做 exhaustive never。
  if (reveal.kind === 'social') {
    activateSocial()
  }
}
