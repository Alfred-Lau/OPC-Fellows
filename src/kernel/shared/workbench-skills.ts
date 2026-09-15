import type { AgentRecord } from './agent.ts'
import { templateById } from './templates.ts'
import type { RouteSkill } from '../../shared/intent-route.ts'

/**
 * 可赋能的 Workbench Skill。
 * 职业 SOP 仍按模块私有；这里是用户点选后挂到某个成员身上的建议能力。
 */
export interface WorkbenchSkill {
  id: string
  title: string
  hint: string
  phrase: string
  group: string
  /** 插图用的身份画像。 */
  portraitId: string
  hue: number
  match: RegExp
  prompt: string
  /** 若对应已有职业 Skill，有模块时走原来的 invoke。 */
  occupationId?: string
  requires?: string
  artifact?: string
  missing?: string
}

export const WORKBENCH_SKILLS: readonly WorkbenchSkill[] = [
  {
    id: 'invest-advice',
    title: '投资建议',
    hint: '仓位、回撤和该不该动手',
    phrase: '做投资建议',
    group: '建议',
    portraitId: 'payments',
    hue: 1,
    match: /做投资建议|投资建议/,
    prompt: '用投资建议 Skill：结合这位成员能看到的账本与项目语境，说清仓位、回撤和该不该动手。标出假设与风险，不要假装已经下单或调仓。',
    requires: '成员能看到的账本或用户描述的仓位',
    artifact: '建议（线程即记录，不另开 Artifact）',
    missing: '没数据就说明缺什么。不要假装已经下单或调仓',
  },
  {
    id: 'opc-advice',
    title: 'OPC 建议',
    hint: '站点、项目和下一步',
    phrase: '做 OPC 建议',
    group: '建议',
    portraitId: 'monitor',
    hue: 3,
    match: /做 OPC 建议|OPC 建议|opc建议/i,
    prompt: '用 OPC 建议 Skill：对着一人公司的站点、项目和下一步给可执行建议。不要假装刚刷新了监控；没数据就说明缺什么。',
    requires: '用户描述或成员能看到的站点 / 项目',
    artifact: '建议（线程即记录）',
    missing: '不要假装刚刷新了监控；没数据就说明缺什么',
  },
  {
    id: 'site-advice',
    title: '网站建议',
    hint: '流量、页面和转化',
    phrase: '做网站建议',
    group: '建议',
    portraitId: 'monitor',
    hue: 3,
    match: /做网站建议|网站建议/,
    prompt: '用网站建议 Skill：从流量、页面和转化看，给出能改的一两处。没有实时数据就按用户描述推理，并标明不确定处。',
    requires: '流量 / 页面描述或监控快照',
    artifact: '建议（线程即记录）',
    missing: '没有实时数据就按用户描述推理，并标明不确定处',
  },
  {
    id: 'collab-design',
    title: '合作设计优化',
    hint: '协作流程和界面怎么改',
    phrase: '做合作设计优化建议',
    group: '建议',
    portraitId: 'creator',
    hue: 2,
    match: /做合作设计优化建议|合作设计优化/,
    prompt: '用合作设计优化 Skill：把协作流程和界面怎么改说具体，点名谁做什么、哪一块先动。不要空讲理念。',
    requires: '当前协作方式或界面描述',
    artifact: '建议（线程即记录）',
    missing: '没有具体对象就问先改哪一块，不要空讲理念',
  },
  {
    id: 'product-design',
    title: '产品设计建议',
    hint: '方向、结构和下手处',
    phrase: '做产品设计建议',
    group: '产品设计',
    portraitId: 'micro',
    hue: 5,
    match: /做产品设计建议|产品设计建议|产品设计/,
    prompt: '用产品设计建议 Skill：从方向、结构和下手处给建议。能复用选品判断就复用，不要编造用户没给的调研数字。',
    requires: '方向或用户描述的产品',
    artifact: '建议（线程即记录）',
    missing: '不要编造用户没给的调研数字',
  },
  {
    id: 'review-idea',
    title: '评估 idea',
    hint: '痛感、热度和判决',
    phrase: '评估 idea',
    group: '产品设计',
    portraitId: 'micro',
    hue: 5,
    occupationId: 'review',
    match: /评估\s*idea|评估idea|今日热榜|今天的产品\s*idea/,
    prompt: '用评估 idea Skill：看痛感、热度和判决。没有选品模块时，按用户描述做判断，并说明缺今日热榜。',
    requires: '今日热榜或用户描述的 idea',
    artifact: '判决（有选品模块时主人是 Idea）',
    missing: '没有选品模块时说明缺今日热榜，不要编热度数字',
  },
  {
    id: 'scan-pain',
    title: '扫描痛点',
    hint: '从 Reddit / Ask HN 捞今日帖',
    phrase: '扫描痛点',
    group: '产品设计',
    portraitId: 'micro',
    hue: 5,
    occupationId: 'scan',
    match: /扫描痛点|扫描今日帖/,
    prompt: '用扫描痛点 Skill：从真实求助里捞今日痛点。没有选品模块时，说明需要选品策略师或启用选品模块。',
    requires: '选品模块或用户描述的求助',
    artifact: 'Idea / Signal（有选品模块时）',
    missing: '没有选品模块时说明需要选品策略师，不要编帖子',
  },
  {
    id: 'research-brief',
    title: '调研综合',
    hint: '检索、摘录、带出处的结论',
    phrase: '做调研',
    group: '执行',
    portraitId: 'host',
    hue: 4,
    match: /做调研|调研综合|查资料|检索/,
    prompt:
      '用调研综合 Skill：先读工作区或抓取网页，再给出带出处的结论。没查到就说明缺什么，不要编链接或数字。只读调研可派 agent_delegate。',
    requires: '工作区文件或可抓取的网页',
    artifact: '带出处的结论（线程即记录）',
    missing: '没查到就说明缺什么，不要编链接',
  },
  {
    id: 'verify-loop',
    title: '验证闭环',
    hint: '对照验收标准自检',
    phrase: '对照验收',
    group: '执行',
    portraitId: 'host',
    hue: 4,
    match: /对照验收|验证闭环|自检|跑测试/,
    prompt: '用验证闭环 Skill：对照用户给的验收标准或测试命令自检。能跑测试就跑；没跑就不要说已经过了。仓库简报里有 test / lint / typecheck 脚本就优先用，不要编命令。',
    requires: '验收标准或可执行的测试',
    artifact: '自检结果',
    missing: '没跑就不要声称已经通过',
  },
  {
    id: 'grill-change',
    title: '问清楚',
    hint: '动手前把需求问到没有分叉',
    phrase: '问清楚',
    group: '执行',
    portraitId: 'host',
    hue: 4,
    match: /问清楚|先对齐|先问清楚/,
    prompt:
      '用问清楚 Skill：动手改代码前把这次要做成什么样问清楚。一次只问最卡住的分叉，给选项；用户没点名就不要写文件。对齐后请用户说「改代码」或「按计划执行」。实践改编自 mattpocock/skills 的 grilling，不搬原文。',
    requires: '用户愿意回答这次要改什么',
    artifact: '对齐后的结论（线程即记录）',
    missing: '用户不答就停在问题上，不要假装已经对齐去改代码',
  },
  {
    id: 'ship-change',
    title: '改代码',
    hint: '按接缝落地，改完自检',
    phrase: '改代码',
    group: '执行',
    portraitId: 'host',
    hue: 4,
    match: /改代码|落地实现|按规格实现|动手改/,
    prompt:
      '用改代码 Skill：先读工作区和仓库简报。能测的改动先在确认过的接缝写一条会失败的测试，再写刚好让它通过的代码，一次一条垂直切片。用 apply_patch 做最小改动。做完跑测试，再按规范和规格两轴各看一遍。不要编 API，不要整文件覆写。实践改编自 mattpocock/skills 的 implement / tdd / code-review。',
    requires: '项目文件夹或可写工作区',
    artifact: '工作区改动 + 自检结果',
    missing: '没读到代码就说明缺文件夹或文件，不要空写',
  },
  {
    id: 'tdd',
    title: '先写测试',
    hint: '红绿切片，测行为不测私有',
    phrase: '先写测试',
    group: '执行',
    portraitId: 'host',
    hue: 4,
    match: /先写测试|红绿重构|test-driven|\btdd\b/i,
    prompt:
      '用先写测试 Skill：先和用户确认测哪条接缝（对外行为，不是私有方法）。红：写一条会失败的测试；绿：只写刚好让它通过的代码。一次一条垂直切片。禁止先堆全部测试再实现，禁止断言复述实现。实践改编自 mattpocock/skills 的 tdd。',
    requires: '可运行的测试命令或用户给出的验收',
    artifact: '失败再通过的测试 + 最小实现',
    missing: '接缝没确认就先问测哪条公共行为，不要对内部方法下手',
  },
  {
    id: 'code-review',
    title: '审查改动',
    hint: '规范与规格两轴分开看',
    phrase: '审查改动',
    group: '执行',
    portraitId: 'host',
    hue: 4,
    match: /审查改动|代码审查|对照规格审查/,
    prompt:
      '用审查改动 Skill：对着这次 diff 分两轴写。规范：是否符合仓库已有写法和明显坏味道（重复、过早抽象、改一处要动一片）。规格：用户要的有没有做成、有没有多做。两轴分开列，不要合成一个分数。没 diff 就先用 git 或工作区工具把改动读出来。实践改编自 mattpocock/skills 的 code-review。',
    requires: '可比较的改动或用户指定的对照点',
    artifact: '规范报告 + 规格报告',
    missing: '没有对照点就问从哪个提交或文件看起，不要空审',
  },
  {
    id: 'diagnose-bug',
    title: '排查',
    hint: '先有复现命令再假设原因',
    phrase: '排查',
    group: '执行',
    portraitId: 'host',
    hue: 4,
    match: /排查|诊断这个|查这个 bug|debug this/i,
    prompt:
      '用排查 Skill：先做出一条能打中这个症状的复现命令并真的跑过，再缩小输入，再列 3–5 个可证伪假设。没有复现命令不要猜。修好后把最小复现留成回归测试，去掉临时调试日志。输出里的密钥打码。实践改编自 mattpocock/skills 的 diagnosing-bugs。',
    requires: '可复现的症状或用户给的报错',
    artifact: '复现命令 + 假设 + 修复与回归',
    missing: '做不出复现就列出试过什么，请用户给日志或环境，不要空猜',
  },
]

const SKILL_BY_ID = new Map(WORKBENCH_SKILLS.map((skill) => [skill.id, skill]))

export function listWorkbenchSkills(): WorkbenchSkill[] {
  return [...WORKBENCH_SKILLS]
}

export function workbenchSkillById(id: string): WorkbenchSkill | undefined {
  return SKILL_BY_ID.get(id)
}

export function normalizeSkillIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) {
    return []
  }
  const seen = new Set<string>()
  const next: string[] = []
  for (const value of ids) {
    const id = String(value)
    if (!SKILL_BY_ID.has(id) || seen.has(id)) {
      continue
    }
    seen.add(id)
    next.push(id)
  }
  return next
}

export function assignedSkillIds(agent: Pick<AgentRecord, 'skillIds'>): string[] {
  return normalizeSkillIds(agent.skillIds)
}

export function agentHasSkill(agent: Pick<AgentRecord, 'skillIds'>, skillId: string): boolean {
  return assignedSkillIds(agent).includes(skillId)
}

export function assignedWorkbenchSkills(agent: Pick<AgentRecord, 'skillIds'>): WorkbenchSkill[] {
  return assignedSkillIds(agent)
    .map((id) => SKILL_BY_ID.get(id))
    .filter((skill): skill is WorkbenchSkill => Boolean(skill))
}

export function holdersOfSkill(agents: readonly AgentRecord[], skillId: string): AgentRecord[] {
  return agents.filter((agent) => agentHasSkill(agent, skillId))
}

export function planAssignSkill(
  agents: readonly AgentRecord[],
  agentId: string,
  skillId: string,
  clock: { now: () => string },
): { ok: boolean; agents?: AgentRecord[]; error?: string } {
  if (!SKILL_BY_ID.has(skillId)) {
    return { ok: false, error: '没有这条 Skill' }
  }
  const agent = agents.find((item) => item.id === agentId)
  if (!agent || agent.kind === 'background') {
    return { ok: false, error: '没有这个成员' }
  }
  const skillIds = normalizeSkillIds([...(agent.skillIds ?? []), skillId])
  return {
    ok: true,
    agents: agents.map((item) =>
      item.id === agentId ? { ...item, skillIds, updatedAt: clock.now() } : item,
    ),
  }
}

export function planRevokeSkill(
  agents: readonly AgentRecord[],
  agentId: string,
  skillId: string,
  clock: { now: () => string },
): { ok: boolean; agents?: AgentRecord[]; error?: string } {
  const agent = agents.find((item) => item.id === agentId)
  if (!agent) {
    return { ok: false, error: '没有这个成员' }
  }
  const skillIds = assignedSkillIds(agent).filter((id) => id !== skillId)
  return {
    ok: true,
    agents: agents.map((item) => {
      if (item.id !== agentId) {
        return item
      }
      const next = { ...item, updatedAt: clock.now() }
      if (skillIds.length === 0) {
        delete next.skillIds
        return next
      }
      return { ...next, skillIds }
    }),
  }
}

export function assignedSkillRoutes(agent: Pick<AgentRecord, 'skillIds'>): RouteSkill[] {
  return assignedWorkbenchSkills(agent).map((skill) => ({
    id: skill.id,
    title: skill.title,
    hint: skill.hint,
    phrase: skill.phrase,
    effect: 'read',
    match: skill.match,
    requires: skill.requires,
    artifact: skill.artifact,
    missing: skill.missing,
  }))
}

export function matchAssignedWorkbenchSkill(
  agent: Pick<AgentRecord, 'skillIds'>,
  text: string,
): WorkbenchSkill | undefined {
  const body = text.toLowerCase()
  return assignedWorkbenchSkills(agent).find((skill) => skill.match.test(text) || skill.match.test(body))
}

export function workbenchInvokeId(skill: WorkbenchSkill, canRunOccupation: boolean): string {
  return skill.occupationId && canRunOccupation ? skill.occupationId : skill.id
}

export function isWorkbenchAdviceInvoke(invoke: string): boolean {
  return SKILL_BY_ID.has(invoke)
}

export function workbenchSkillSystemPrompt(
  agent: Pick<AgentRecord, 'title' | 'description'>,
  skill: WorkbenchSkill,
): string {
  return [
    `你是「${agent.title}」，正在执行赋能 Skill「${skill.title}」。`,
    agent.description,
    skill.prompt,
    '用中文简洁回答。回复必须是 Markdown：集合用表格，步骤用列表。不要假装已经调用了收款、监控、选品等工具。',
  ]
    .filter((line) => line.trim())
    .join('\n')
}

export function workbenchSkillMark(skill: WorkbenchSkill): string {
  return templateById(skill.portraitId)?.mark ?? skill.title.slice(0, 1)
}

export function workbenchComposerSkills(
  agents: readonly AgentRecord[],
): Array<{ id: string; title: string; hint: string; insert: string }> {
  const skills: Array<{ id: string; title: string; hint: string; insert: string }> = []
  for (const skill of WORKBENCH_SKILLS) {
    for (const agent of holdersOfSkill(agents, skill.id)) {
      skills.push({
        id: `wb-${skill.id}-${agent.id}`,
        title: skill.title,
        hint: `${agent.title} · ${skill.hint}`,
        insert: `@${agent.title} ${skill.phrase}`,
      })
    }
  }
  return skills
}
