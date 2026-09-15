import type { AgentRecord } from '../../kernel/shared/agent'
import { isRosterAgent } from '../../kernel/shared/agents'
import { flagArg, occupationInvokeSpec, pinnedArg, type OccupationReveal } from '../../kernel/shared/occupation-tools'
import { asSkillReply, type ShortListing, type SkillReply } from '../../shared/listing'
import { activateAccounts } from './accounts'
import { revealGrowthGroup } from './growth'
import { revealPipeline, revealTodayBoard } from './micro-sourcing'
import { revealMonitorGroup } from './monitor'
import { revealNotesFind } from './notes'
import { revealPaymentsGroup } from './payments'
import { activateSocial } from './social'
import { revealMailGroup } from './mail'
import { revealWxhubGroup } from './wechat-hub'
import { activateWxDraft } from './wx-draft'

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
  revealOccupation(spec.reveal, text)
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

function revealOccupation(reveal: OccupationReveal | undefined, text = ''): void {
  if (!reveal) {
    return
  }
  switch (reveal.kind) {
    case 'monitor':
      revealMonitorGroup(reveal.group)
      return
    case 'micro':
      if (reveal.board === 'pipeline') {
        revealPipeline()
      } else {
        revealTodayBoard()
      }
      return
    case 'payments':
      revealPaymentsGroup(reveal.group)
      return
    case 'wxhub':
      revealWxhubGroup(reveal.group)
      return
    case 'mail':
      revealMailGroup(reveal.group)
      return
    case 'social':
      activateSocial()
      return
    case 'wxdraft':
      activateWxDraft()
      return
    case 'accounts':
      activateAccounts()
      return
    case 'notes': {
      const query = text.replace(/找回|找一下|找/g, ' ').replace(/\s+/g, ' ').trim()
      revealNotesFind(query)
      return
    }
    case 'growth':
      revealGrowthGroup(reveal.group)
      return
    default: {
      const exhaustive: never = reveal
      return exhaustive
    }
  }
}
