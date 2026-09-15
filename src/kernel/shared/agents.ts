import {
  AGENT_NAME_POOL,
  HOST_AGENT_ID,
  HOST_TEMPLATE_ID,
  INBOX_THREAD_ID,
  type AgentOrigin,
  type AgentRecord,
  type AgentStatus,
  type AgentRecommend,
  type AgentTemplate,
  type CreateAgentInput,
  type CreateAgentResult,
  type ThreadMessage,
  type ThreadRecord,
} from './agent.ts'
import { listedTemplates, templateById, templateForModule } from './templates.ts'
import {
  assignedSkillRoutes,
  assignedWorkbenchSkills,
  isWorkbenchAdviceInvoke,
  matchAssignedWorkbenchSkill,
  normalizeSkillIds,
  workbenchComposerSkills,
  workbenchInvokeId,
} from './workbench-skills.ts'
import { formatOpcToolsPrompt, type OpcToolInfo } from './opc-tools.ts'
import { defaultToolPacks, normalizeToolPacks } from './tool-packs.ts'
import { composeWorkspaceSystemHint } from './project-context-ui.ts'
import { HOST_EXECUTION_SKILL_IDS, codingSystemHint, hasWorkspaceWriteTools } from './coding-skills.ts'
import { PRODUCT_NAME } from '../../shared/brand.ts'
import { DEEPSEEK_MODEL_LABEL } from '../../shared/deepseek.ts'
import {
  classifyOccupationIntent,
  formatSkillContract,
  isIdentityAsk,
  isInboxQuestion,
  isInboxSkillTrigger,
  isSkillFastPath,
  isSkillMissText,
  matchRouteSkill,
  type RouteSkill,
} from '../../shared/intent-route.ts'

export interface ModulePresence {
  id: string
  enabled: boolean
}

export interface AgentClock {
  now: () => string
}

export const defaultClock: AgentClock = {
  now: () => new Date().toISOString(),
}

export function slugify(value: string): string {
  const trimmed = value.trim().toLowerCase()
  const ascii = trimmed
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  return ascii || `agent-${Math.abs(hashCode(value)).toString(36)}`
}

export function pickAgentName(existingTitles: readonly string[], seed: number): string {
  const taken = new Set(existingTitles)
  for (let offset = 0; offset < AGENT_NAME_POOL.length; offset += 1) {
    const name = AGENT_NAME_POOL[(seed + offset) % AGENT_NAME_POOL.length]
    if (name && !taken.has(name)) {
      return name
    }
  }
  return `助手 ${existingTitles.length + 1}`
}

export function hashCode(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return hash
}

export function mentionQueryAt(text: string, cursor: number): { start: number; query: string } | undefined {
  const before = text.slice(0, Math.max(0, cursor))
  const at = before.lastIndexOf('@')
  if (at < 0) {
    return undefined
  }
  if (at > 0 && !/\s/.test(before[at - 1] ?? '')) {
    return undefined
  }
  const query = before.slice(at + 1)
  if (/[\s\n]/.test(query)) {
    return undefined
  }
  return { start: at, query }
}

export function rosterAgentsByIds(
  agentIds: readonly string[],
  agents: readonly AgentRecord[],
): AgentRecord[] {
  const roster = new Map(agents.filter((agent) => isRosterAgent(agent)).map((agent) => [agent.id, agent]))
  const found: AgentRecord[] = []
  const seen = new Set<string>()
  for (const id of agentIds) {
    const agent = roster.get(id)
    if (!agent || seen.has(agent.id)) {
      continue
    }
    seen.add(agent.id)
    found.push(agent)
  }
  return found
}

export type MentionSpan =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; agent: AgentRecord }

export function mentionSpans(text: string, agents: readonly AgentRecord[]): MentionSpan[] {
  const byLength = [...agents]
    .filter((agent) => isRosterAgent(agent))
    .sort((left, right) => right.title.length - left.title.length)
  const spans: MentionSpan[] = []
  let index = 0
  let buffer = ''
  const flush = (): void => {
    if (!buffer) {
      return
    }
    spans.push({ kind: 'text', text: buffer })
    buffer = ''
  }
  while (index < text.length) {
    if (text[index] === '@') {
      const after = text.slice(index + 1)
      const titled = byLength.find((agent) => after.startsWith(agent.title))
      if (titled) {
        flush()
        spans.push({ kind: 'mention', agent: titled })
        index += 1 + titled.title.length
        continue
      }
      const token = after.match(/^[^\s@]+/)?.[0]
      const byId = token ? agents.find((agent) => agent.id === token) : undefined
      if (byId && token) {
        flush()
        spans.push({ kind: 'mention', agent: byId })
        index += 1 + token.length
        continue
      }
    }
    buffer += text[index]
    index += 1
  }
  flush()
  return spans
}

export function filterMentionAgents(
  query: string,
  agents: readonly AgentRecord[],
  preferIds: readonly string[] = [],
): AgentRecord[] {
  const needle = query.trim().toLowerCase()
  const preferred = new Set(preferIds)
  const hits = agents.filter((agent) => {
    if (!isActiveRosterAgent(agent)) {
      return false
    }
    if (!needle) {
      return true
    }
    return (
      agent.title.toLowerCase().includes(needle) ||
      agent.mark.toLowerCase().includes(needle) ||
      agent.id.toLowerCase().includes(needle)
    )
  })
  const preferredHits = rosterAgentsByIds(preferIds, hits)
  const others = hits.filter((agent) => !preferred.has(agent.id))
  return [...preferredHits, ...others].slice(0, Math.max(8, preferredHits.length))
}

export function skillQueryAt(text: string, cursor: number): { start: number; query: string } | undefined {
  const before = text.slice(0, Math.max(0, cursor))
  const slash = before.lastIndexOf('/')
  if (slash < 0) {
    return undefined
  }
  if (slash > 0 && !/\s/.test(before[slash - 1] ?? '')) {
    return undefined
  }
  const query = before.slice(slash + 1)
  if (/[\s\n]/.test(query)) {
    return undefined
  }
  return { start: slash, query }
}

export interface ComposerSkill {
  id: string
  title: string
  hint: string
  insert: string
}

type OccupationSkill = RouteSkill

const KERNEL_COMPOSER_SKILL: ComposerSkill = {
  id: 'todo',
  title: '拆成待办',
  hint: '不 @，直接写入日程',
  insert: '',
}

const SKILLS_FOR_MODULE: Record<string, OccupationSkill[]> = {
  monitor: [
    { id: 'refresh', title: '刷新态势', hint: '采集项目、站点、流量与全球性能', phrase: '刷新态势', effect: 'write', match: /刷新态势|刷新监控|刷新项目|刷新|refresh/ },
    {
      id: 'traffic',
      title: '解读流量',
      hint: '看掉量和近 24 小时变化',
      phrase: '解读流量',
      effect: 'read',
      match: /流量|掉量|访问量|浏览量|哪些站掉了|项目数据|数据如何|态势如何/,
    },
    { id: 'health', title: '项目健康', hint: '未提交、超前、部署失败', phrase: '项目健康', effect: 'read', match: /项目健康|未提交|部署失败|还健康|仓库健康|仓库还/ },
    { id: 'pages', title: '页面归因', hint: 'Top Pages 从哪来的浏览', phrase: '页面归因', effect: 'read', match: /页面归因|top pages|哪些页面/ },
    {
      id: 'speed',
      title: '解读性能',
      hint: '全球 LCP / TTFB 与各地区 Web Vitals',
      phrase: '解读性能',
      effect: 'read',
      match: /解读性能|全球性能|部署性能|speed insights|web vitals|core web vitals|\blcp\b|\binp\b|\bcls\b|\bttfb\b|各地延迟|边缘性能/,
    },
  ],
  micro: [
    { id: 'scan', title: '扫描痛点', hint: '从 Reddit / Ask HN 捞今日帖', phrase: '扫描痛点', effect: 'write', match: /扫描痛点|扫描|扫一遍|scan/ },
    { id: 'pipeline', title: '管线改判', hint: '盯着 / 动手做 / 搁置 / 丢掉', phrase: '管线改判', effect: 'write', match: /管线改判|管线|盯着|动手做|搁置|丢掉/ },
    { id: 'handoff', title: '立项交接', hint: '把 idea 指针交给弹药手', phrase: '立项交接', effect: 'write', match: /立项交接|立项/ },
    {
      id: 'review',
      title: '评估 idea',
      hint: '看痛感、热度和判决',
      phrase: '评估 idea',
      effect: 'read',
      match:
        /评估\s*idea|评估idea|评估|今天的产品\s*idea|今天有什么\s*idea|今天有哪些\s*idea|今天的\s*idea|今日热榜|今日的?\s*idea|产品\s*idea\s*是什么|热榜|选题|值得做|好做的|痛点|今天有什么|第\s*(十一|十二|十|[一二三四五六七八九]|\d+)\s*条/,
    },
  ],
  growth: [
    {
      id: 'experiment',
      title: '开实验',
      hint: '写下假设、指标和 AARRR 层',
      phrase: '开实验',
      effect: 'write',
      match: /开实验|开一个实验|新实验/,
    },
    {
      id: 'verdict',
      title: '判实验',
      hint: '赢了 / 输了 / 无结论',
      phrase: '判实验',
      effect: 'write',
      match: /判实验|实验赢了|实验输了|实验无结论|判定实验/,
    },
    {
      id: 'ship',
      title: '交接弹药',
      hint: '把赢了的实验指针交给弹药手',
      phrase: '交接弹药',
      effect: 'write',
      match: /交接弹药|把实验交给弹药|实验交给弹药手/,
    },
    {
      id: 'loop',
      title: '画增长环',
      hint: '内容 / 裂变 / 付费 / 销售 / 产品',
      phrase: '画增长环',
      effect: 'write',
      match: /画增长环|增长环/,
    },
    {
      id: 'rank',
      title: '排渠道',
      hint: '试水 / 扩量 / 暂停 / 杀掉',
      phrase: '排渠道',
      effect: 'write',
      match: /排渠道|渠道排序|渠道优先级/,
    },
    {
      id: 'diagnose',
      title: '诊断漏斗',
      hint: '看各层覆盖和在跑实验',
      phrase: '诊断漏斗',
      effect: 'read',
      match: /诊断漏斗|漏斗|aarrr|哪一层漏|增长台|增长如何|增长怎么样/i,
    },
  ],
  payments: [
    { id: 'sync', title: '同步心跳', hint: '拉 Creem 并写出该跟的账', phrase: '同步心跳', effect: 'write', match: /同步心跳|同步|心跳|sync/ },
    { id: 'read', title: '解读账本', hint: '问 MRR、本月和客户', phrase: '解读账本', effect: 'read', match: /解读账本|这个月收了多少|现在\s*mrr|账本|mrr|赚了|收入|营收|财务|账上/ },
    { id: 'manual', title: '手工入账', hint: '分账、星球、扫码、社媒手录', phrase: '手工入账', effect: 'write', match: /手工入账|入账/ },
    { id: 'expense', title: '支出结算', hint: '支出、提现和结算', phrase: '支出结算', effect: 'write', match: /支出结算|记一笔支出|记支出|提现|结算到账/ },
    { id: 'export', title: '导出月报', hint: '台账 CSV 快照，不是第二份账', phrase: '导出月报', effect: 'write', match: /导出月报|导出|月报/ },
  ],
  wxhub: [
    {
      id: 'today',
      title: '今日行动',
      hint: '读今日行动；带刷新才外跑',
      phrase: '今日行动',
      effect: 'read',
      match: /今日行动|今天要处理|今天处理什么|刷新情报|扫一遍情报|刷新|refresh|跟进|微信那边|今天的微信|有没有人找|找我|最紧急/,
    },
    { id: 'reply', title: '待回复', hint: '只出草稿，不发微信', phrase: '待回复', effect: 'read', match: /待回复|回复草稿|还没回|没回/ },
    { id: 'triage', title: '商机分流', hint: '推进 / 等待 / 忽略', phrase: '商机分流', effect: 'write', match: /商机分流|分流|推进|等待|暂缓|忽略|成交|未成交|商机/ },
    { id: 'lookup', title: '查人查事', hint: '按人、主题或关键词查', phrase: '查人查事', effect: 'read', match: /查人查事|查找|查一下/ },
    { id: 'access', title: '接入体检', hint: '本机情报库是否可读', phrase: '接入体检', effect: 'read', match: /接入体检|接入/ },
  ],
  mail: [
    {
      id: 'mailbox',
      title: '收件箱',
      hint: '读待整理的信；带刷新才外拉',
      phrase: '收件箱',
      effect: 'read',
      match: /收件箱|今日邮件|收邮件|整理邮件|整理邮箱|看看邮件|有什么邮件|有没有新邮件|未读邮件|新邮件|邮箱里|邮件怎么样/,
    },
    {
      id: 'sort-mail',
      title: '分流邮件',
      hint: '跟进 / 归档 / 忽略',
      phrase: '分流邮件',
      effect: 'write',
      match: /分流邮件|邮件分流|归档邮件|整理收件箱|跟进这封|归档这封/,
    },
    {
      id: 'find-mail',
      title: '查邮件',
      hint: '按发件人或主题查已同步的信',
      phrase: '查邮件',
      effect: 'read',
      match: /查信|查邮件|找邮件|搜邮件|邮件里找/,
    },
    {
      id: 'mail-reply',
      title: '回信草稿',
      hint: '只留本机，不代发',
      phrase: '回信草稿',
      effect: 'write',
      match: /邮件回复|回信草稿|写回信/,
    },
    {
      id: 'mail-access',
      title: '接入邮箱',
      hint: '本机邮件.app 和 iCloud / Gmail / QQ',
      phrase: '接入邮箱',
      effect: 'read',
      match: /邮件接入|邮箱接入|接入邮箱|连邮箱|连邮件/,
    },
  ],
  'social-ammo': [
    { id: 'load', title: '装填弹药', hint: '按产品能力写六平台文案', phrase: '装填弹药', effect: 'write', match: /装填弹药|装填|生成弹药|文案|可以发|发什么|弹药准备|写几条/ },
    { id: 'publish', title: '发布登记', hint: '记下已发链接', phrase: '发布登记', effect: 'write', match: /发布登记|记下已发/ },
    { id: 'metrics', title: '采集互动', hint: '浏览、赞评转发收藏', phrase: '采集互动', effect: 'write', match: /采集互动|弹药互动/ },
    { id: 'review', title: '复盘热帖', hint: '有评论的已发稿', phrase: '复盘热帖', effect: 'read', match: /复盘热帖|复盘|比较热|热帖|哪些帖|最热|哪条/ },
  ],
  wxdraft: [
    { id: 'history', title: '复查记录', hint: '上次成功或失败', phrase: '复查记录', effect: 'read', match: /复查记录|复查|上次|成功了吗|草稿写好|转稿成功/ },
    { id: 'draft', title: '收成草稿', hint: 'Markdown 写入公众号草稿箱', phrase: '收成草稿', effect: 'write', match: /收成草稿|转稿|发一篇|公众号/ },
    { id: 'meta', title: '补元数据', hint: '标题、摘要和封面', phrase: '补元数据', effect: 'write', match: /补元数据|元数据|封面/ },
  ],
  accounts: [
    { id: 'create', title: '建档账号', hint: '小红书 / 视频号 / 抖音', phrase: '建档账号', effect: 'write', match: /建档账号|建档/ },
    { id: 'log', title: '记今日发出', hint: '写进当天日记', phrase: '记今日发出', effect: 'write', match: /记今日发出|今日发出|今天发了|发了什么/ },
    { id: 'day-metrics', title: '采当日数据', hint: '浏览和粉丝', phrase: '采当日数据', effect: 'read', match: /采当日数据|当日数据|账号数据|数据怎么样|表现|粉丝/ },
    { id: 'material', title: '关联选材', hint: '指向 Idea 或 Ammo', phrase: '关联选材', effect: 'write', match: /关联选材|选材/ },
  ],
  notes: [
    { id: 'note', title: '记下', hint: '听到、想到就写', phrase: '', effect: 'write', match: /记下/ },
    { id: 'find', title: '找回', hint: '打开笔记列表找一句', phrase: '找回', effect: 'read', match: /找回|那句话在哪|上次那句/ },
    { id: 'promote', title: '升格待办', hint: '把笔记指针交给内核', phrase: '升格待办', effect: 'write', match: /升格待办|升格|变成待办|写成待办/ },
  ],
  pet: [
    { id: 'alert', title: '到点提醒', hint: '待办到点跳到屏幕中间', phrase: '到点提醒', effect: 'write', match: /到点提醒|提醒/ },
    { id: 'open', title: '打开工作台', hint: '点小鹿或拖底部', phrase: '打开工作台', effect: 'write', match: /打开工作台|打开/ },
    { id: 'snooze', title: '稍后消掉', hint: '这次先不处理', phrase: '稍后消掉', effect: 'write', match: /稍后消掉|稍后|消掉/ },
  ],
}

const HOST_OCCUPATION_SKILLS: OccupationSkill[] = [
  {
    id: 'research',
    title: '调研综合',
    hint: '检索、摘录、带出处的结论',
    phrase: '做调研',
    effect: 'read',
    match: /做调研|调研综合|查资料|检索/,
  },
  {
    id: 'verify',
    title: '验证闭环',
    hint: '对照验收标准自检',
    phrase: '对照验收',
    effect: 'read',
    match: /对照验收|验证闭环|自检|跑测试/,
  },
]

const SKILLS_FOR_TEMPLATE: Record<string, OccupationSkill[]> = {
  [HOST_TEMPLATE_ID]: HOST_OCCUPATION_SKILLS,
  engineer: HOST_OCCUPATION_SKILLS,
  blank: [
    {
      id: 'research',
      title: '调研综合',
      hint: '检索、摘录、带出处的结论',
      phrase: '做调研',
      effect: 'read',
      match: /做调研|调研综合|查资料|检索/,
    },
    {
      id: 'verify',
      title: '验证闭环',
      hint: '对照验收标准自检',
      phrase: '对照验收',
      effect: 'read',
      match: /对照验收|验证闭环|自检/,
    },
  ],
}

type SkillPolicy = Pick<OccupationSkill, 'fast' | 'requires' | 'artifact' | 'missing'>

const SKILL_POLICY: Record<string, SkillPolicy> = {
  'monitor:refresh': {
    fast: /刷新态势|刷新监控|刷新项目/,
    requires: '本机仓库目录可读；Vercel 可选',
    artifact: 'Snapshot',
    missing: '刷新失败就说明原因，不要编流量、健康或 LCP',
  },
  'monitor:traffic': {
    requires: '已有态势快照',
    artifact: '流量解读（只读 Snapshot）',
    missing: '还没有态势快照。要先说「刷新态势」，不要编浏览量',
  },
  'monitor:health': {
    requires: '已有态势快照',
    artifact: '仓库健康解读',
    missing: '还没有态势快照。要先说「刷新态势」',
  },
  'monitor:pages': {
    requires: '已有态势快照',
    artifact: '页面归因',
    missing: '没有页面增量就说明没有，不强行归因',
  },
  'monitor:speed': {
    requires: '已有态势快照',
    artifact: '全球性能解读（只读 Snapshot）',
    missing: '没有 Speed Insights 样本就说明原因，不要编 LCP',
  },
  'micro:scan': {
    fast: /扫描痛点|扫描今日帖|扫一遍/,
    requires: '选品模块已启用，外网可达 Reddit / Ask HN',
    artifact: 'Idea / Signal',
    missing: '扫不到就说明缺源或网络，不要拿昨天的帖凑今日热榜',
  },
  'micro:pipeline': {
    fast: /管线改判|盯着|动手做|搁置|丢掉/,
    requires: '点名一条 Idea',
    artifact: '管线状态（主人仍是选品）',
    missing: '对不上序号或标题就问要改哪一条',
  },
  'micro:handoff': {
    fast: /立项交接|立项/,
    requires: '点名一条仍开放的 Idea',
    artifact: 'Idea 指针交给弹药手',
    missing: '源关闭则下游停，不复制第二份选题',
  },
  'micro:review': {
    requires: '已有扫描结果',
    artifact: '今日热榜 / 单条判决',
    missing: '还没有扫描结果。要先说「扫描痛点」。不拿昨天的热帖来凑',
  },
  'growth:experiment': {
    requires: '用户明确要开实验，并带假设',
    artifact: 'Experiment',
    missing: '没假设就问假设和指标，不写文案、不刷新流量、不碰账本',
  },
  'growth:verdict': {
    requires: '点名一条未关闭的实验',
    artifact: 'Experiment 判决',
    missing: '没有实验可判定就先开实验。源关闭不得擅自复活',
  },
  'growth:ship': {
    requires: '赢了的实验',
    artifact: 'Experiment 指针交给弹药手',
    missing: '没赢就不要交接。不复制弹药正文',
  },
  'growth:loop': {
    requires: '用户明确要画增长环',
    artifact: 'Loop',
    missing: '缺步骤就问内容 / 裂变 / 付费 / 销售 / 产品里的哪一种',
  },
  'growth:rank': {
    requires: '用户明确要排渠道',
    artifact: 'Channel',
    missing: '要渠道名和处置：试水 / 扩量 / 暂停 / 杀掉',
  },
  'growth:diagnose': {
    requires: '增长台已启用',
    artifact: '漏斗覆盖与在跑实验（只读）',
    missing: '台是空的就说明先开实验。流量看监控官，文案看弹药手，账本看财务顾问',
  },
  'host:research': {
    requires: '工作区文件或可抓取的网页',
    artifact: '带出处的结论',
    missing: '没查到就说明缺什么，不要编链接或数字',
  },
  'host:verify': {
    requires: '验收标准或可执行的测试',
    artifact: '自检结果',
    missing: '没跑就不要声称已经通过',
  },
  'engineer:research': {
    requires: '工作区文件或可抓取的网页',
    artifact: '带出处的结论',
    missing: '没查到就说明缺什么，不要编链接或数字',
  },
  'engineer:verify': {
    requires: '验收标准或可执行的测试',
    artifact: '自检结果',
    missing: '没跑就不要声称已经通过',
  },
  'blank:research': {
    requires: '工作区文件或可抓取的网页',
    artifact: '带出处的结论',
    missing: '没查到就说明缺什么，不要编链接或数字',
  },
  'blank:verify': {
    requires: '验收标准或可执行的测试',
    artifact: '自检结果',
    missing: '没跑就不要声称已经通过',
  },
  'payments:sync': {
    fast: /同步心跳/,
    requires: 'Creem key',
    artifact: 'Ledger Entry 快照',
    missing: '缺密钥就说到收款台填 key，不要假装已经同步',
  },
  'payments:read': {
    requires: '已有账本或手录',
    artifact: '账本摘要（只读）',
    missing: '还没有同步过账本。要先说「同步心跳」，不要编 MRR',
  },
  'payments:manual': {
    fast: /手工入账/,
    requires: '金额和渠道',
    artifact: 'Ledger Entry',
    missing: '没有金额和渠道就问，不会从微信成交自动流入',
  },
  'payments:expense': {
    fast: /支出结算|记一笔支出|记支出/,
    requires: '支出金额',
    artifact: '支出记录',
    missing: '没金额就问。提现要到结算那一面补，这条一次只改一本账',
  },
  'payments:export': {
    fast: /导出月报/,
    requires: '已有账本',
    artifact: '月报 CSV 快照',
    missing: '这是快照，不是第二份账',
  },
  'wxhub:today': {
    requires: '本机情报库可读',
    artifact: 'Wechat Action 列表（只读）',
    missing: '不能读就说接入体检。不发微信',
  },
  'wxhub:reply': {
    requires: '有待回复候选',
    artifact: 'Reply Draft（只留本机）',
    missing: '没有待回复就说明没有。只出草稿，不发微信',
  },
  'wxhub:triage': {
    fast: /商机分流|推进|等待|暂缓|忽略/,
    requires: '点名一条候选并给出处置',
    artifact: 'Wechat Action 分流',
    missing: '没点名就问要改哪一条。成交不会自动入账',
  },
  'wxhub:lookup': {
    requires: '人名、主题或关键词',
    artifact: '查人查事摘录',
    missing: '没命中就说没有。聊天不出本机',
  },
  'wxhub:access': {
    requires: '无',
    artifact: '接入体检',
    missing: '按本机状态如实说，不要假装已经连上',
  },
  'mail:mailbox': {
    requires: '已接入本机邮件或线上账号',
    artifact: 'Mail Message 列表（只读）',
    missing: '不能读就说接入邮箱。不代发',
  },
  'mail:sort-mail': {
    fast: /分流邮件|归档邮件|跟进这封|归档这封/,
    requires: '点名一封信并给出处置',
    artifact: 'Mail Message 分流',
    missing: '没点名就问要改哪一封。不改正文，不代发',
  },
  'mail:find-mail': {
    requires: '发件人、主题或关键词',
    artifact: '查信摘录',
    missing: '没命中就说没有。先刷新收件箱',
  },
  'mail:mail-reply': {
    requires: '点名一封信',
    artifact: 'Mail Draft（只留本机）',
    missing: '只出草稿，不代发',
  },
  'mail:mail-access': {
    requires: '无',
    artifact: '接入体检',
    missing: '按本机和账号状态如实说，不要假装已经连上',
  },
  'social-ammo:load': {
    fast: /装填弹药|生成弹药/,
    requires: 'Idea 指针或可写的产品能力',
    artifact: 'Ammo',
    missing: '没有 Idea 就问装填哪一条。不从监控偷偷写弹药',
  },
  'social-ammo:publish': {
    fast: /发布登记/,
    requires: '已发链接和第几条弹药',
    artifact: 'Ammo 发布记录',
    missing: '缺链接就问。不代发',
  },
  'social-ammo:metrics': {
    fast: /采集互动/,
    requires: '浏览/赞/评等数字',
    artifact: '互动指标',
    missing: '没有数字就不写 0 充数',
  },
  'social-ammo:review': {
    requires: '有评论的已发稿',
    artifact: '热帖复盘（只读）',
    missing: '没有带评论的已发稿，不拿未发草稿充数',
  },
  'wxdraft:history': {
    requires: '曾收成过草稿',
    artifact: '复查记录',
    missing: '还没收成过就说明还没有',
  },
  'wxdraft:draft': {
    fast: /收成草稿|转稿/,
    requires: '足够长的 Markdown 正文',
    artifact: 'Wx Draft',
    missing: '正文太短就不要空跑。不改表意',
  },
  'wxdraft:meta': {
    fast: /补元数据/,
    requires: '已有草稿',
    artifact: '标题 / 摘要 / 封面',
    missing: '没有草稿就先收成',
  },
  'accounts:create': {
    fast: /建档账号/,
    requires: '小红书 / 视频号 / 抖音 + 名字',
    artifact: 'Account',
    missing: '缺平台或名字就问',
  },
  'accounts:log': {
    fast: /记今日发出|今日发出/,
    requires: '发出标题或链接',
    artifact: 'Day Log',
    missing: '没发出内容就问今天发了什么',
  },
  'accounts:day-metrics': {
    requires: '已建档账号',
    artifact: '当日浏览 / 粉丝',
    missing: '没有数字就问，这不是单条弹药互动',
  },
  'accounts:material': {
    fast: /关联选材/,
    requires: 'Idea 或 Ammo 指针',
    artifact: 'Material 指针',
    missing: '对不上就先去选品或弹药手，不在账号侧复制选题',
  },
  'notes:note': {
    fast: /记下/,
    requires: '要记下的原文',
    artifact: 'Note',
    missing: '没有可记的内容就不要空记',
  },
  'notes:find': {
    requires: '关键词',
    artifact: 'Note 列表',
    missing: '没有命中就说没有',
  },
  'notes:promote': {
    fast: /升格待办|升格|变成待办|写成待办/,
    requires: '点名一条笔记',
    artifact: 'Todo 指针（正文仍在随手记）',
    missing: '对不上就问升格哪一条',
  },
  'pet:alert': {
    requires: '待办到点',
    artifact: 'Alert',
    missing: '没有到点事项就不要弹',
  },
  'pet:open': {
    requires: '无',
    artifact: '打开工作台',
    missing: '打不开就说明原因',
  },
  'pet:snooze': {
    requires: '当前提醒',
    artifact: '稍后消掉',
    missing: '没有当前提醒就不必消',
  },
}

export function listComposerSkills(query: string, agents: readonly AgentRecord[]): ComposerSkill[] {
  const skills: ComposerSkill[] = [KERNEL_COMPOSER_SKILL, ...workbenchComposerSkills(agents)]
  const seen = new Set(skills.map((skill) => skill.insert))
  for (const agent of agents) {
    if (agent.status === 'needs-module' || !isRosterAgent(agent)) {
      continue
    }
    for (const skill of occupationSkills(agent)) {
      const mention = skill.phrase ? `@${agent.title} ${skill.phrase}` : `@${agent.title} `
      if (seen.has(mention)) {
        continue
      }
      seen.add(mention)
      skills.push({
        id: `${agent.id}-${skill.id}`,
        title: skill.title,
        hint: `${agent.title} · ${skill.hint}`,
        insert: mention,
      })
    }
  }
  const needle = query.trim().toLowerCase()
  return skills
    .filter((skill) => {
      if (!needle) {
        return true
      }
      return (
        skill.title.toLowerCase().includes(needle) ||
        skill.hint.toLowerCase().includes(needle) ||
        skill.insert.toLowerCase().includes(needle)
      )
    })
    .slice(0, 24)
}

function primarySkillModule(agent: Pick<AgentRecord, 'moduleIds' | 'viewId'>): string | undefined {
  if (agent.viewId && SKILLS_FOR_MODULE[agent.viewId]) {
    return agent.viewId
  }
  return agent.moduleIds.find((moduleId) => SKILLS_FOR_MODULE[moduleId])
}

export function occupationSkills(
  agent: Pick<AgentRecord, 'moduleIds' | 'viewId' | 'templateId'>,
): OccupationSkill[] {
  const moduleId = primarySkillModule(agent)
  const skills = [
    ...(moduleId ? (SKILLS_FOR_MODULE[moduleId] ?? []) : []),
    ...(SKILLS_FOR_TEMPLATE[agent.templateId] ?? []),
  ]
  return skills.map((skill) => {
    const policy = SKILL_POLICY[`${moduleId ?? agent.templateId}:${skill.id}`]
    return policy ? { ...skill, ...policy } : skill
  })
}

export function parseMentions(text: string, agents: readonly AgentRecord[]): {
  rest: string
  agentIds: string[]
} {
  const found: string[] = []
  const seen = new Set<string>()
  const byLength = [...agents].sort((left, right) => right.title.length - left.title.length)
  let index = 0
  let rest = ''
  while (index < text.length) {
    if (text[index] === '@') {
      const after = text.slice(index + 1)
      const titled = byLength.find((agent) => after.startsWith(agent.title))
      if (titled) {
        if (!seen.has(titled.id)) {
          seen.add(titled.id)
          found.push(titled.id)
        }
        index += 1 + titled.title.length
        rest += ' '
        continue
      }
      const token = after.match(/^[^\s@]+/)?.[0]
      const byId = token ? agents.find((agent) => agent.id === token) : undefined
      if (byId && token) {
        if (!seen.has(byId.id)) {
          seen.add(byId.id)
          found.push(byId.id)
        }
        index += 1 + token.length
        rest += ' '
        continue
      }
    }
    rest += text[index]
    index += 1
  }
  return { rest: rest.replace(/\s+/g, ' ').trim(), agentIds: found }
}

export function statusFor(kind: AgentRecord['kind'], modulesReady: boolean): AgentStatus {
  if (!modulesReady) {
    return 'needs-module'
  }
  switch (kind) {
    case 'window':
      return 'window'
    case 'background':
      return 'background'
    case 'conversational':
    case 'dashboard':
      return 'ready'
    default: {
      const exhaustive: never = kind
      return exhaustive
    }
  }
}

export function modulesReady(moduleIds: readonly string[], modules: readonly ModulePresence[]): boolean {
  if (moduleIds.length === 0) {
    return true
  }
  const enabled = new Set(modules.filter((module) => module.enabled).map((module) => module.id))
  return moduleIds.every((id) => enabled.has(id))
}

export function refreshAgentStatus(agent: AgentRecord, modules: readonly ModulePresence[]): AgentRecord {
  return { ...agent, status: statusFor(agent.kind, modulesReady(agent.moduleIds, modules)) }
}

export function isHostAgent(agent: Pick<AgentRecord, 'id' | 'templateId'>): boolean {
  return agent.id === HOST_AGENT_ID || agent.templateId === HOST_TEMPLATE_ID
}

export function findHostAgent(agents: readonly AgentRecord[]): AgentRecord | undefined {
  return agents.find((agent) => isRosterAgent(agent) && isHostAgent(agent))
}

function hostSortOrder(agents: readonly AgentRecord[]): number {
  const orders = visibleAgents(agents)
    .map((agent) => agent.sortOrder)
    .filter((order): order is number => typeof order === 'number')
  if (orders.length === 0) {
    return 0
  }
  return Math.min(...orders) - 1
}

function upsertHostAgent(
  agents: AgentRecord[],
  modules: readonly ModulePresence[],
  clock: AgentClock,
): AgentRecord[] {
  const template = templateById(HOST_TEMPLATE_ID)
  if (!template) {
    return agents
  }
  const next = [...agents]
  const now = clock.now()
  const existing = next.find((agent) => isHostAgent(agent))
  if (existing) {
    const index = next.indexOf(existing)
    const skillIds = normalizeSkillIds([...(existing.skillIds ?? []), ...HOST_EXECUTION_SKILL_IDS])
    const toolPacks =
      existing.toolPacks && existing.toolPacks.length > 0
        ? existing.toolPacks
        : defaultToolPacks(template.id, template.agentKind)
    const sameSkills =
      skillIds.length === (existing.skillIds ?? []).length &&
      skillIds.every((id, order) => existing.skillIds?.[order] === id)
    const samePacks =
      toolPacks.length === (existing.toolPacks ?? []).length &&
      toolPacks.every((id, order) => existing.toolPacks?.[order] === id)
    const unchanged =
      existing.id === HOST_AGENT_ID &&
      existing.templateId === HOST_TEMPLATE_ID &&
      existing.origin === 'builtin-default' &&
      existing.singleton &&
      sameSkills &&
      samePacks
    next[index] = refreshAgentStatus(
      unchanged
        ? existing
        : {
            ...existing,
            id: HOST_AGENT_ID,
            templateId: HOST_TEMPLATE_ID,
            origin: existing.origin === 'cloned' ? existing.origin : 'builtin-default',
            singleton: true,
            skillIds,
            toolPacks,
            updatedAt: now,
          },
      modules,
    )
    return next
  }
  next.unshift(
    refreshAgentStatus(
      {
        id: HOST_AGENT_ID,
        templateId: template.id,
        title: template.role,
        mark: template.mark,
        description: template.persona,
        hue: template.hue,
        kind: template.agentKind,
        origin: 'builtin-default',
        moduleIds: [],
        skillIds: [...HOST_EXECUTION_SKILL_IDS],
        workspaceName: template.workspaceName,
        toolPacks: defaultToolPacks(template.id, template.agentKind),
        planMode: true,
        singleton: true,
        status: 'ready',
        sortOrder: hostSortOrder(next),
        createdAt: now,
        updatedAt: now,
      },
      modules,
    ),
  )
  return next
}

export function upsertDefaultAgents(
  agents: AgentRecord[],
  modules: readonly ModulePresence[],
  clock: AgentClock = defaultClock,
): AgentRecord[] {
  const next = upsertHostAgent(agents, modules, clock)
  const now = clock.now()
  for (const module of modules) {
    const template = templateForModule(module.id)
    if (!template || !template.defaultAgentId) {
      continue
    }
    const existing = next.find((agent) => agent.id === template.defaultAgentId)
    if (existing) {
      const index = next.indexOf(existing)
      const patched =
        existing.origin === 'builtin-default' && template.viewId && existing.viewId !== template.viewId
          ? { ...existing, viewId: template.viewId, updatedAt: now }
          : existing
      next[index] = refreshAgentStatus(patched, modules)
      continue
    }
    next.push(
      refreshAgentStatus(
        {
          id: template.defaultAgentId,
          templateId: template.id,
          title: template.role,
          mark: template.mark,
          description: template.persona,
          hue: template.hue,
          kind: template.agentKind,
          origin: 'builtin-default',
          moduleIds: [...template.moduleIds],
          ...(template.viewId ? { viewId: template.viewId } : {}),
          workspaceName: template.workspaceName,
          toolPacks: defaultToolPacks(template.id, template.agentKind),
          ...(template.planMode ? { planMode: true } : {}),
          singleton: template.singleton,
          status: 'ready',
          sortOrder: nextSortOrder(next),
          createdAt: now,
          updatedAt: now,
        },
        modules,
      ),
    )
  }
  return next.map((agent) => refreshAgentStatus(agent, modules))
}

export function isRosterAgent(agent: Pick<AgentRecord, 'kind' | 'templateId' | 'moduleIds'>): boolean {
  if (agent.kind === 'background') {
    return false
  }
  const template = templateById(agent.templateId)
  if (template) {
    return template.inRoster !== false
  }
  return !agent.moduleIds.includes('pet')
}

export function isActiveRosterAgent(
  agent: Pick<AgentRecord, 'kind' | 'templateId' | 'moduleIds' | 'status'>,
): boolean {
  return isRosterAgent(agent) && agent.status !== 'needs-module'
}

export function weaveListedOrder(currentIds: readonly string[], listedIds: readonly string[]): string[] {
  const listed = new Set(listedIds)
  const next: string[] = []
  let index = 0
  for (const id of currentIds) {
    if (listed.has(id)) {
      const replacement = listedIds[index]
      if (replacement) {
        next.push(replacement)
        index += 1
      }
      continue
    }
    if (!next.includes(id)) {
      next.push(id)
    }
  }
  for (; index < listedIds.length; index += 1) {
    const rest = listedIds[index]
    if (rest && !next.includes(rest)) {
      next.push(rest)
    }
  }
  return next
}

export const AGENT_TITLE_MAX = 40

export function normalizeAgentTitle(title: string): string {
  const line = title.split('\n').map((item) => item.trim()).find((item) => item.length > 0) ?? ''
  return line.length > AGENT_TITLE_MAX ? line.slice(0, AGENT_TITLE_MAX) : line
}

export function compareRosterAgents(left: AgentRecord, right: AgentRecord): number {
  const leftOrder = typeof left.sortOrder === 'number' ? left.sortOrder : Number.POSITIVE_INFINITY
  const rightOrder = typeof right.sortOrder === 'number' ? right.sortOrder : Number.POSITIVE_INFINITY
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder
  }
  return right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title, 'zh')
}

export function visibleAgents(agents: readonly AgentRecord[]): AgentRecord[] {
  return agents.filter((agent) => isRosterAgent(agent)).sort(compareRosterAgents)
}

export function nextSortOrder(agents: readonly AgentRecord[]): number {
  const orders = visibleAgents(agents)
    .map((agent) => agent.sortOrder)
    .filter((order): order is number => typeof order === 'number')
  if (orders.length === 0) {
    return visibleAgents(agents).length
  }
  return Math.max(...orders) + 1
}

export function ensureRosterSortOrder(agents: readonly AgentRecord[]): AgentRecord[] {
  const roster = visibleAgents(agents)
  if (roster.length === 0 || roster.every((agent) => typeof agent.sortOrder === 'number')) {
    return [...agents]
  }
  const index = new Map(roster.map((agent, order) => [agent.id, order]))
  return agents.map((agent) => {
    const sortOrder = index.get(agent.id)
    return sortOrder == null ? agent : { ...agent, sortOrder }
  })
}

export function canRemoveAgent(agent: Pick<AgentRecord, 'origin'>): boolean {
  return agent.origin === 'user' || agent.origin === 'cloned'
}

export function canCloneAgent(agent: Pick<AgentRecord, 'singleton'>): boolean {
  return !agent.singleton
}

export function canConfigurePacks(agent: Pick<AgentRecord, 'kind'>): boolean {
  return agent.kind === 'conversational' || agent.kind === 'dashboard'
}

export type PlanAgentMutate =
  | { ok: false; error: string }
  | { ok: true; agents: AgentRecord[] }

export function planRenameAgent(
  agents: readonly AgentRecord[],
  threads: readonly ThreadRecord[],
  agentId: string,
  title: string,
  clock: AgentClock = defaultClock,
): { ok: false; error: string } | { ok: true; agents: AgentRecord[]; threads: ThreadRecord[] } {
  const agent = agents.find((item) => item.id === agentId)
  if (!agent) {
    return { ok: false, error: '没有这个成员' }
  }
  const nextTitle = normalizeAgentTitle(title)
  if (!nextTitle) {
    return { ok: false, error: '成员名称不能为空' }
  }
  const now = clock.now()
  return {
    ok: true,
    agents: agents.map((item) => (item.id === agentId ? { ...item, title: nextTitle, updatedAt: now } : item)),
    threads: threads.map((item) => (item.id === `thread:${agentId}` ? { ...item, title: nextTitle } : item)),
  }
}

export function planConfigureAgent(
  agents: readonly AgentRecord[],
  agentId: string,
  input: { toolPacks: readonly string[]; planMode: boolean },
  clock: AgentClock = defaultClock,
): PlanAgentMutate {
  const agent = agents.find((item) => item.id === agentId)
  if (!agent || !isRosterAgent(agent) || !canConfigurePacks(agent)) {
    return { ok: false, error: '没有这个成员' }
  }
  const toolPacks = normalizeToolPacks(input.toolPacks)
  const now = clock.now()
  return {
    ok: true,
    agents: agents.map((item) => {
      if (item.id !== agentId) {
        return item
      }
      const next: AgentRecord = { ...item, toolPacks, updatedAt: now }
      if (input.planMode) {
        next.planMode = true
      } else {
        delete next.planMode
      }
      return next
    }),
  }
}

export function planReorderAgents(
  agents: readonly AgentRecord[],
  ids: readonly string[],
): PlanAgentMutate {
  const roster = visibleAgents(agents)
  if (roster.length === 0) {
    return { ok: true, agents: [...agents] }
  }
  const listed = new Set(roster.filter((agent) => isActiveRosterAgent(agent)).map((agent) => agent.id))
  const incoming = ids.filter((id) => listed.has(id))
  const ordered = weaveListedOrder(
    roster.map((agent) => agent.id),
    incoming,
  )
  const index = new Map(ordered.map((id, order) => [id, order]))
  return {
    ok: true,
    agents: agents.map((agent) => {
      const sortOrder = index.get(agent.id)
      return sortOrder == null ? agent : { ...agent, sortOrder }
    }),
  }
}

export function planRemoveAgent(
  agents: readonly AgentRecord[],
  threads: readonly ThreadRecord[],
  messages: readonly ThreadMessage[],
  agentId: string,
):
  | { ok: false; error: string }
  | { ok: true; agents: AgentRecord[]; threads: ThreadRecord[]; messages: ThreadMessage[] } {
  const agent = agents.find((item) => item.id === agentId)
  if (!agent) {
    return { ok: false, error: '没有这个成员' }
  }
  if (!canRemoveAgent(agent)) {
    return { ok: false, error: '内置成员不能解雇，关掉对应能力即可' }
  }
  const homeId = `thread:${agentId}`
  return {
    ok: true,
    agents: agents.filter((item) => item.id !== agentId),
    threads: threads
      .filter((item) => item.id !== homeId)
      .map((item) => {
        if (!item.agentIds.includes(agentId) && item.workspaceAgentId !== agentId) {
          return item
        }
        const agentIds = item.agentIds.filter((id) => id !== agentId)
        const workspaceAgentId = item.workspaceAgentId === agentId ? agentIds[0] : item.workspaceAgentId
        const next = { ...item, agentIds }
        if (workspaceAgentId) {
          next.workspaceAgentId = workspaceAgentId
        } else {
          delete next.workspaceAgentId
        }
        return next
      }),
    messages: messages.filter((item) => item.threadId !== homeId),
  }
}

export function recommendAgents(
  agents: readonly AgentRecord[],
  threads: readonly ThreadRecord[] = [],
): AgentRecommend {
  const latest = new Map<string, string>()
  for (const thread of threads) {
    for (const id of thread.agentIds) {
      const prev = latest.get(id)
      if (!prev || thread.updatedAt > prev) {
        latest.set(id, thread.updatedAt)
      }
    }
  }
  const listed = visibleAgents(agents)
    .filter((agent) => isActiveRosterAgent(agent))
    .sort((left, right) => {
      const leftAt = latest.get(left.id) ?? left.updatedAt
      const rightAt = latest.get(right.id) ?? right.updatedAt
      const byTime = rightAt.localeCompare(leftAt)
      return byTime !== 0 ? byTime : left.title.localeCompare(right.title, 'zh')
    })
  return {
    templates: listedTemplates(),
    agents: listed,
  }
}

export function singletonOccupant(agents: readonly AgentRecord[], templateId: string): AgentRecord | undefined {
  const template = templateById(templateId)
  if (!template?.singleton) {
    return undefined
  }
  return agents.find((agent) => agent.templateId === templateId)
}

function planHireBundle(
  agents: readonly AgentRecord[],
  template: AgentTemplate,
  modules: readonly ModulePresence[],
  clock: AgentClock,
): CreateAgentResult {
  const hired: AgentRecord[] = []
  let working = [...agents]
  for (const templateId of template.hireTemplateIds ?? []) {
    const part = templateById(templateId)
    if (!part || part.inRoster === false) {
      continue
    }
    const occupant =
      singletonOccupant(working, part.id) ??
      (part.defaultAgentId ? working.find((agent) => agent.id === part.defaultAgentId) : undefined)
    if (occupant) {
      hired.push(occupant)
      continue
    }
    const now = clock.now()
    const id = part.defaultAgentId || uniqueAgentId(working, slugify(part.role) || `agent-${slugify(part.id)}`)
    const agent = refreshAgentStatus(
      {
        id,
        templateId: part.id,
        title: part.role,
        mark: part.mark.slice(0, 1),
        description: part.persona.trim().slice(0, 100),
        hue: part.hue,
        kind: part.agentKind,
        origin: 'user',
        moduleIds: [...part.moduleIds],
        ...(part.viewId ? { viewId: part.viewId } : {}),
        workspaceName: part.workspaceName || part.role,
        singleton: part.singleton,
        status: 'ready',
        sortOrder: nextSortOrder(working),
        createdAt: now,
        updatedAt: now,
      },
      modules,
    )
    hired.push(agent)
    working = [...working, agent]
  }
  if (hired[0]) {
    return { ok: true, agent: hired[0], agents: hired }
  }
  return { ok: false, error: '这条雇佣快捷方式没有可雇的身份' }
}

export function planCreateAgent(
  agents: readonly AgentRecord[],
  input: CreateAgentInput,
  modules: readonly ModulePresence[],
  clock: AgentClock = defaultClock,
): CreateAgentResult {
  const title = input.title.trim()
  if (!title) {
    return { ok: false, error: '成员名称不能为空' }
  }

  const source = input.cloneFrom ? agents.find((agent) => agent.id === input.cloneFrom) : undefined
  if (input.cloneFrom && !source) {
    return { ok: false, error: '要复制的成员已经不在了' }
  }

  if (source?.singleton) {
    return {
      ok: false,
      existingId: source.id,
      error: `「${source.title}」是单例，共享同一份数据，打开已有实例即可`,
    }
  }

  const templateId = source?.templateId ?? input.templateId
  const template = templateById(templateId)
  if (!template) {
    return { ok: false, error: '没有这条职业模板' }
  }
  if (template.inRoster === false) {
    return { ok: false, error: `「${template.role}」不是左栏身份` }
  }

  if (template.hireTemplateIds?.length && !source) {
    return planHireBundle(agents, template, modules, clock)
  }

  const occupant = singletonOccupant(agents, template.id)
  if (occupant && !source) {
    return {
      ok: false,
      existingId: occupant.id,
      error: `「${occupant.title}」已经在，单例模板不会再复制一份账本`,
    }
  }

  const now = clock.now()
  const origin: AgentOrigin = source ? 'cloned' : template.id === HOST_TEMPLATE_ID ? 'builtin-default' : 'user'
  const moduleIds = unique([
    ...(source?.moduleIds ?? template.moduleIds),
    ...(input.extraModuleIds ?? []),
  ])
  const id = uniqueAgentId(
    agents,
    source
      ? `${source.id}-copy`
      : template.id === HOST_TEMPLATE_ID
        ? HOST_AGENT_ID
        : slugify(title) || `agent-${slugify(template.id)}`,
  )
  const skillIds = normalizeSkillIds([
    ...(source?.skillIds ?? []),
    ...(template.id === HOST_TEMPLATE_ID || template.id === 'engineer' ? [...HOST_EXECUTION_SKILL_IDS] : []),
  ])
  const toolPacks =
    input.extraToolPacks !== undefined
      ? normalizeToolPacks(input.extraToolPacks)
      : normalizeToolPacks(source?.toolPacks ?? template.toolPacks ?? defaultToolPacks(template.id, template.agentKind))
  const planMode = input.planMode ?? source?.planMode ?? template.planMode ?? false
  const agent = refreshAgentStatus(
    {
      id,
      templateId: template.id,
      title,
      mark: (source?.mark ?? template.mark).slice(0, 1),
      description: (input.description ?? source?.description ?? template.persona).trim().slice(0, 100),
      hue: source?.hue ?? template.hue,
      kind: source?.kind ?? template.agentKind,
      origin,
      moduleIds,
      ...((source?.viewId ?? template.viewId) ? { viewId: source?.viewId ?? template.viewId } : {}),
      workspaceName: (input.workspaceName?.trim() || source?.workspaceName || template.workspaceName || title).slice(0, 80),
      ...(skillIds.length > 0 ? { skillIds } : {}),
      toolPacks,
      ...(planMode ? { planMode: true } : {}),
      singleton: Boolean(!source && template.singleton),
      status: 'ready',
      sortOrder: nextSortOrder(agents),
      createdAt: now,
      updatedAt: now,
    },
    modules,
  )
  return { ok: true, agent }
}

export function ensureInboxThread(threads: ThreadRecord[], clock: AgentClock = defaultClock): ThreadRecord[] {
  if (threads.some((thread) => thread.id === INBOX_THREAD_ID)) {
    return threads
  }
  const now = clock.now()
  return [
    {
      id: INBOX_THREAD_ID,
      title: '今日',
      kind: 'inbox',
      agentIds: [],
      createdAt: now,
      updatedAt: now,
    },
    ...threads,
  ]
}

export function defaultThreadFor(agent: AgentRecord, clock: AgentClock = defaultClock): ThreadRecord {
  const now = clock.now()
  return {
    id: `thread:${agent.id}`,
    title: agent.title,
    kind: 'agent',
    agentIds: [agent.id],
    workspaceAgentId: agent.id,
    createdAt: now,
    updatedAt: now,
  }
}

export function upsertAgentThread(threads: ThreadRecord[], agent: AgentRecord, clock: AgentClock = defaultClock): ThreadRecord[] {
  if (agent.kind === 'background') {
    return threads
  }
  const id = `thread:${agent.id}`
  if (threads.some((thread) => thread.id === id)) {
    return threads
  }
  return [...threads, defaultThreadFor(agent, clock)]
}

export type DispatchKind =
  | 'decompose'
  | 'open'
  | 'invoke'
  | 'note'
  | 'forward'
  | 'window'
  | 'chat'
  | 'miss'
  | 'classify'

export interface DispatchAction {
  kind: DispatchKind
  agentId?: string
  agentIds?: string[]
  text: string
  invoke?: string
}

export interface DispatchOptions {
  /** 当前会话所属成员：没有 @ 时，对话型继续聊，随手记继续记，职业主对话走分配。 */
  implicitAgentId?: string
  /** 项目在场成员。问身份 / 能力且没 @ 时，全部听见，不只主成员。 */
  projectAgentIds?: readonly string[]
}

export function acceptsModelAllocate(agent: Pick<AgentRecord, 'kind' | 'moduleIds' | 'skillIds'>): boolean {
  return agent.kind === 'dashboard' || agent.moduleIds.includes('notes') || assignedWorkbenchSkills(agent).length > 0
}

export function canChat(agent: AgentRecord): boolean {
  return agent.kind === 'conversational' && !agent.moduleIds.includes('notes')
}

export function acceptsImplicitRoute(agent: AgentRecord): boolean {
  return canChat(agent) || agent.moduleIds.includes('notes') || agent.kind === 'dashboard'
}

function matchOccupationSkill(
  agent: Pick<AgentRecord, 'moduleIds' | 'viewId' | 'templateId'>,
  text: string,
): OccupationSkill | undefined {
  return matchRouteSkill(occupationSkills(agent), text)
}

export function occupationSkillChoices(
  agent: Pick<AgentRecord, 'moduleIds' | 'viewId' | 'skillIds' | 'templateId'>,
): Array<{ id: string; title: string; phrase: string }> {
  const seen = new Set<string>()
  const choices: Array<{ id: string; title: string; phrase: string }> = []
  for (const skill of occupationSkills(agent)) {
    if (!skill.phrase.trim() || seen.has(skill.id) || seen.has(skill.phrase)) {
      continue
    }
    seen.add(skill.id)
    seen.add(skill.phrase)
    choices.push({ id: skill.id, title: skill.title, phrase: skill.phrase })
  }
  for (const skill of assignedWorkbenchSkills(agent)) {
    if (seen.has(skill.id) || seen.has(skill.phrase) || (skill.occupationId && seen.has(skill.occupationId))) {
      continue
    }
    seen.add(skill.id)
    seen.add(skill.phrase)
    choices.push({ id: skill.id, title: skill.title, phrase: skill.phrase })
  }
  return choices
}

export function identityReply(
  agent: Pick<AgentRecord, 'title' | 'moduleIds' | 'viewId' | 'skillIds' | 'templateId'>,
): string {
  const skills = occupationSkillChoices(agent)
  const lines = [`我是「${agent.title}」。底层模型是 ${DEEPSEEK_MODEL_LABEL}。`]
  if (skills.length > 0) {
    lines.push('', '能力', '', '| 能力 | 说明 |', '| --- | --- |')
    for (const skill of skills) {
      lines.push(`| ${skill.title} | ${skill.phrase || skill.title} |`)
    }
  }
  return lines.join('\n')
}

export function skillMissReply(
  agent: Pick<AgentRecord, 'title' | 'moduleIds' | 'viewId' | 'skillIds' | 'templateId'>,
  text = '',
): string {
  if (isIdentityAsk(text)) {
    return identityReply(agent)
  }
  const skills = occupationSkillChoices(agent)
  if (skills.length === 0) {
    return `对不上「${agent.title}」的 Skill。`
  }
  const lines = [
    `我是「${agent.title}」，刚才这句还对不上要执行哪一条。`,
    '',
    '我可以：',
    '',
    '| 能力 | 你可以说 |',
    '| --- | --- |',
  ]
  for (const skill of skills) {
    lines.push(`| ${skill.title} | ${skill.phrase || skill.title} |`)
  }
  lines.push('', '缺数据时我会说明缺什么，不会编。越权的事请 @ 对应成员。先点一条，或再说具体一点。')
  return lines.join('\n')
}

export function inboxMissReply(
  text: string,
  agents: readonly AgentRecord[] = [],
  agentIds: readonly string[] = [],
): string {
  const names = agentIds
    .map((id) => agents.find((agent) => agent.id === id)?.title)
    .filter((title): title is string => Boolean(title))
  if (names.length > 1) {
    return `这句话对上了 ${names.map((name) => `「${name}」`).join('、')}。今日请 @ 其中一位，避免派错人。没有拆成待办。`
  }
  if (isInboxQuestion(text)) {
    return '今日是收件箱，不是哪个成员的主对话。问事情请 @ 成员，或直接说口令（例如「刷新态势」「评估 idea」）。这句话没有拆成待办。'
  }
  return '今日请 @ 成员或说一条口令。这句话没有拆成待办。'
}

export { isSkillMissText }

export function agentSystemPrompt(
  agent: AgentRecord,
  tools: readonly OpcToolInfo[] = [],
  workspace?: { cwd?: string; repoBrief?: string },
): string {
  const assigned = assignedWorkbenchSkills(agent)
  const occupation = occupationSkills(agent)
  const occupationSection =
    occupation.length > 0
      ? ['本职 Skill。查数或动手请调工具，不要编数据：', ...occupation.map((skill) => formatSkillContract(skill))].join(
          '\n',
        )
      : ''
  const assignedSection =
    assigned.length > 0
      ? [
          '已赋能建议 Skill。按说明书开口；没有对应工具时不要假装调了收款、监控、选品。',
          ...assigned.map((skill) => `- ${skill.title}（口令：${skill.phrase}）：${skill.prompt}`),
        ].join('\n')
      : ''
  const toolsSection = formatOpcToolsPrompt(tools)
  const notesHint = agent.moduleIds.includes('notes') && tools.some((tool) => tool.name === 'notes_add')
    ? '用户要记下的话默认调用 notes_add，不要只口头答应。'
    : ''
  const draftHint =
    agent.templateId === 'wxdraft' || agent.moduleIds.includes('wxdraft')
      ? '调整正文时尽可能不改原文：只做红线词筛查、错别字纠正、去掉没有形成格式的 Markdown 符号。禁止润色、扩写、改结构、改语气、改例子或改结论。表意不做任何调整。'
      : ''
  const planHint = agent.planMode
    ? '这位成员默认先出计划。未批准前不要调用写工具；用户回复「按计划执行」后再动手。'
    : ''
  const delegateHint = tools.some((tool) => tool.name === 'agent_delegate')
    ? '只读调研可调用 agent_delegate。子循环不能再派、不能改文件。'
    : ''
  const codingHint = codingSystemHint(hasWorkspaceWriteTools(tools))
  const repoBrief = workspace?.repoBrief?.trim() ?? ''
  const toolRule = toolsSection
    ? '需要查数或动手时按协议调用工具，不要假装已经调用。对不上本职 Skill 时列出我会的能力请用户点名。越权请让用户 @ 对应成员。'
    : '不要假装已经调用了收款、监控、选品等工具；那些需要用户 @ 对应成员。'
  return [
    `你是 ${PRODUCT_NAME} 里的「${agent.title}」。`,
    agent.description,
    occupationSection,
    assignedSection,
    notesHint,
    draftHint,
    planHint,
    delegateHint,
    codingHint,
    composeWorkspaceSystemHint(workspace?.cwd ?? ''),
    repoBrief,
    toolsSection,
    `底层模型是 ${DEEPSEEK_MODEL_LABEL}。被问到你是谁或什么模型时，如实说身份和模型，不要装作调用了工具。`,
    `用中文简洁回答。回复必须是 Markdown：集合用表格，步骤用列表，代码用围栏，链接和图片用标准语法。${toolRule}`,
  ]
    .filter((line) => line.trim())
    .join('\n')
}

export function chatTurns(
  messages: readonly ThreadMessage[],
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'agent')
    .slice(-16)
    .map((message) => ({
      role: message.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: message.text,
    }))
    .filter((turn) => turn.content.trim())
}

/**
 * 有 key 时，读 Skill、模糊写句、赋能建议都交给 dsh session（工具目录在人设里）。
 * 只有零歧义写口令仍走固定 bridge。
 */
export function promoteToClassify(
  actions: readonly DispatchAction[],
  agents: readonly AgentRecord[],
  options: { hasKey: boolean },
): DispatchAction[] {
  if (!options.hasKey) {
    return [...actions]
  }
  return actions.map((action) => {
    if (!action.agentId || !action.text.trim()) {
      return action
    }
    switch (action.kind) {
      case 'miss':
        if (isIdentityAsk(action.text)) {
          return action
        }
        break
      case 'note':
        break
      case 'invoke': {
        const agent = agents.find((item) => item.id === action.agentId)
        if (!agent || !action.invoke || keepBridgeInvoke(agent, action.invoke, action.text)) {
          return action
        }
        return { kind: 'chat', agentId: action.agentId, text: action.text }
      }
      case 'chat':
      case 'classify':
      case 'decompose':
      case 'open':
      case 'forward':
      case 'window':
        return action
      default: {
        const exhaustive: never = action.kind
        return exhaustive
      }
    }
    const agent = agents.find((item) => item.id === action.agentId)
    if (!agent || !acceptsModelAllocate(agent)) {
      return action
    }
    return { ...action, kind: 'chat' }
  })
}

function keepBridgeInvoke(agent: AgentRecord, invoke: string, text: string): boolean {
  if (isWorkbenchAdviceInvoke(invoke)) {
    return false
  }
  const skill = routableSkills(agent).find((item) => item.id === invoke)
  if (!skill) {
    return true
  }
  return isSkillFastPath(skill, text)
}

export function promoteMissToClassify(
  actions: readonly DispatchAction[],
  agents: readonly AgentRecord[],
  options: { hasKey: boolean },
): DispatchAction[] {
  return promoteToClassify(actions, agents, options)
}

export function planDispatch(
  text: string,
  agents: readonly AgentRecord[],
  options: DispatchOptions = {},
): {
  rest: string
  agentIds: string[]
  actions: DispatchAction[]
} {
  const parsed = parseMentions(text, agents.filter((agent) => isRosterAgent(agent)))
  const rest = parsed.rest || text.trim()
  if (parsed.agentIds.length === 0) {
    if (isIdentityAsk(rest) && options.projectAgentIds?.length) {
      const agentIds = rosterAgentsByIds(options.projectAgentIds, agents).map((agent) => agent.id)
      if (agentIds.length > 0) {
        return { rest, agentIds, actions: actionsForHearers(agentIds, rest, agents) }
      }
    }
    const implicit = options.implicitAgentId
      ? agents.find((agent) => agent.id === options.implicitAgentId)
      : undefined
    if (implicit && acceptsImplicitRoute(implicit)) {
      return { rest, agentIds: [implicit.id], actions: actionsForAgent(implicit, rest) }
    }
    const inbox = matchInboxHearer(rest, agents)
    if (inbox) {
      return inbox
    }
    if (isInboxQuestion(rest)) {
      return { rest, agentIds: [], actions: [{ kind: 'miss', text: rest }] }
    }
    return { rest, agentIds: [], actions: [{ kind: 'decompose', text: rest }] }
  }
  return { rest, agentIds: parsed.agentIds, actions: actionsForHearers(parsed.agentIds, rest, agents) }
}

function matchInboxHearer(
  text: string,
  agents: readonly AgentRecord[],
): { rest: string; agentIds: string[]; actions: DispatchAction[] } | undefined {
  const hits: AgentRecord[] = []
  const seen = new Set<string>()
  for (const agent of agents) {
    if (!isRosterAgent(agent) || agent.status === 'needs-module') {
      continue
    }
    const triggered = routableSkills(agent).some((skill) => isInboxSkillTrigger(skill, text))
    if (!triggered || seen.has(agent.id)) {
      continue
    }
    seen.add(agent.id)
    hits.push(agent)
  }
  if (hits.length === 1 && hits[0]) {
    const agent = hits[0]
    return { rest: text, agentIds: [agent.id], actions: actionsForAgent(agent, text) }
  }
  if (hits.length > 1) {
    return {
      rest: text,
      agentIds: [],
      actions: [{ kind: 'miss', text, agentIds: hits.map((agent) => agent.id) }],
    }
  }
  return undefined
}

function actionsForHearers(
  agentIds: readonly string[],
  rest: string,
  agents: readonly AgentRecord[],
): DispatchAction[] {
  const actions: DispatchAction[] = []
  if (agentIds.length > 1) {
    actions.push({ kind: 'forward', agentIds: [...agentIds], text: rest })
  }
  for (const id of agentIds) {
    const agent = agents.find((item) => item.id === id)
    if (!agent) {
      continue
    }
    actions.push(...actionsForAgent(agent, rest))
  }
  return actions
}

function assignedInvoke(agent: AgentRecord, text: string): DispatchAction | undefined {
  const assigned = matchAssignedWorkbenchSkill(agent, text)
  if (!assigned) {
    return undefined
  }
  const canRunOccupation = Boolean(
    assigned.occupationId && occupationSkills(agent).some((skill) => skill.id === assigned.occupationId),
  )
  return {
    kind: 'invoke',
    agentId: agent.id,
    text,
    invoke: workbenchInvokeId(assigned, canRunOccupation),
  }
}

export function routableSkills(agent: AgentRecord): RouteSkill[] {
  const seen = new Set<string>()
  const skills: RouteSkill[] = []
  for (const skill of [...occupationSkills(agent), ...assignedSkillRoutes(agent)]) {
    if (seen.has(skill.id)) {
      continue
    }
    seen.add(skill.id)
    skills.push(skill)
  }
  return skills
}

function actionsForAgent(agent: AgentRecord, text: string): DispatchAction[] {
  const assigned = assignedInvoke(agent, text)
  switch (agent.kind) {
    case 'window':
      return [{ kind: 'window', agentId: agent.id, text }]
    case 'background':
      return [{ kind: 'open', agentId: agent.id, text }]
    case 'conversational':
      if (agent.moduleIds.includes('notes')) {
        const skill = matchOccupationSkill(agent, text)
        if (skill && skill.id !== 'note') {
          return [{ kind: 'invoke', agentId: agent.id, text, invoke: skill.id }]
        }
        if (assigned) {
          return [assigned]
        }
        return [{ kind: 'note', agentId: agent.id, text }]
      }
      if (assigned) {
        return [assigned]
      }
      return [{ kind: 'chat', agentId: agent.id, text }]
    case 'dashboard': {
      if (assigned) {
        return [assigned]
      }
      const decision = classifyOccupationIntent(occupationSkills(agent), text)
      if (decision.kind === 'invoke') {
        return [{ kind: 'invoke', agentId: agent.id, text, invoke: decision.skillId }]
      }
      return [{ kind: 'miss', agentId: agent.id, text }]
    }
    default: {
      const exhaustive: never = agent.kind
      return exhaustive
    }
  }
}

export function applyThreadListing(
  threads: readonly ThreadRecord[],
  threadId: string,
  listing: ThreadRecord['lastListing'] | undefined,
  clock: AgentClock = defaultClock,
): ThreadRecord[] {
  if (!listing?.ids.length) {
    return threads.map((thread) => (thread.id === threadId ? { ...thread, updatedAt: clock.now() } : thread))
  }
  return threads.map((thread) =>
    thread.id === threadId ? { ...thread, updatedAt: clock.now(), lastListing: listing } : thread,
  )
}

export function applyThreadPlan(
  threads: readonly ThreadRecord[],
  threadId: string,
  plan: ThreadRecord['plan'],
  clock: AgentClock = defaultClock,
): ThreadRecord[] {
  return threads.map((thread) =>
    thread.id === threadId ? { ...thread, plan, updatedAt: clock.now() } : thread,
  )
}

export function appendMessage(
  messages: ThreadMessage[],
  input: { threadId: string; role: ThreadMessage['role']; text: string; agentId?: string; thinking?: string },
  clock: AgentClock = defaultClock,
): ThreadMessage {
  const thinking = input.thinking?.trim()
  return {
    id: `msg-${hashCode(`${input.threadId}:${clock.now()}:${input.text}`).toString(36)}-${messages.length}`,
    threadId: input.threadId,
    role: input.role,
    ...(input.agentId ? { agentId: input.agentId } : {}),
    text: input.text,
    ...(thinking ? { thinking } : {}),
    createdAt: clock.now(),
  }
}

export function touchThread(threads: ThreadRecord[], threadId: string, clock: AgentClock = defaultClock): ThreadRecord[] {
  return threads.map((thread) => (thread.id === threadId ? { ...thread, updatedAt: clock.now() } : thread))
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function uniqueAgentId(agents: readonly AgentRecord[], base: string): string {
  const taken = new Set(agents.map((agent) => agent.id))
  if (!taken.has(base)) {
    return base
  }
  let index = 2
  while (taken.has(`${base}-${index}`)) {
    index += 1
  }
  return `${base}-${index}`
}
