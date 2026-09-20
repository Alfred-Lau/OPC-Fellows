import { startsWithSkillPhrase } from './read-answer.ts'

export type SkillEffect = 'read' | 'write'

export interface RouteSkill {
  id: string
  title: string
  hint: string
  phrase: string
  effect: SkillEffect
  match: RegExp
  /** 零歧义写口令的额外家族。有 key 时只有 phrase 前缀或本正则才走 bridge。 */
  fast?: RegExp
  /** 执行前必须具备的条件。 */
  requires?: string
  /** 成功时交出的 Artifact 或结果形态。 */
  artifact?: string
  /** 缺数据或越权时的拒答口径。 */
  missing?: string
}

export type IntentDecision =
  | { kind: 'invoke'; skillId: string }
  | { kind: 'miss' }

export type AllocateDecision =
  | { kind: 'invoke'; skillId: string }
  | { kind: 'chat' }
  | { kind: 'miss' }
  | { kind: 'note' }

export type ClassifyDecision = {
  kind: 'invoke' | 'chat' | 'miss' | 'note'
  invoke?: string
  text: string
}

const ASK =
  /如何|怎么样|怎样|还行|好不好|什么情况|帮我看|看看|看下|看一下|盯一下|有没有异常|异常吗|正常吗|掉了吗|怎样了|如何了/

const SMALL_TALK = /随便|聊聊|哈哈|呵呵|^嗯+$|^好的$|^谢谢/

const IDENTITY =
  /你是谁|你是什么模型|你是哪[个种]模型|什么模型|哪个模型|你叫什么|你会什么|你能做什么|你是啥|你有什么能力|有什么能力|有哪些能力|你们会什么|你们能做什么|who are you|what model/i

export function isOccupationAsk(text: string): boolean {
  return ASK.test(text.trim())
}

export function isIdentityAsk(text: string): boolean {
  return IDENTITY.test(text.trim())
}

export function shouldClassifyRead(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || SMALL_TALK.test(trimmed) || isIdentityAsk(trimmed)) {
    return false
  }
  return isOccupationAsk(trimmed) || trimmed.length >= 4
}

export function primaryReadSkill(skills: readonly RouteSkill[]): RouteSkill | undefined {
  return skills.find((skill) => skill.effect === 'read')
}

export function matchRouteSkill(skills: readonly RouteSkill[], text: string): RouteSkill | undefined {
  const body = text.toLowerCase()
  return skills.find((skill) => skill.match.test(text) || skill.match.test(body))
}

/** 有 key 时只有零歧义写 Skill 走固定 bridge；读 Skill 和模糊句进 Agent Loop。 */
export function isSkillFastPath(skill: Pick<RouteSkill, 'effect' | 'phrase' | 'fast'>, text: string): boolean {
  if (skill.effect !== 'write') {
    return false
  }
  if (startsWithSkillPhrase(text, skill.phrase)) {
    return true
  }
  return Boolean(skill.fast?.test(text))
}

/** 今日无 @ 时允许的 Trigger：写口令快路径，或读 Skill / 赋能 Skill 的芯片原句。不用宽正则，避免抢走待办。 */
export function isInboxSkillTrigger(skill: Pick<RouteSkill, 'effect' | 'phrase' | 'fast'>, text: string): boolean {
  if (isSkillFastPath(skill, text)) {
    return true
  }
  return Boolean(skill.phrase.trim()) && startsWithSkillPhrase(text, skill.phrase)
}

/** 问句不该在今日被默默拆成待办。带「提醒 / 待办」的仍当任务。 */
export function isInboxQuestion(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) {
    return false
  }
  if (/提醒|待办|交周报|deadline|日程/i.test(trimmed)) {
    return false
  }
  if (isIdentityAsk(trimmed) || isOccupationAsk(trimmed) || SMALL_TALK.test(trimmed)) {
    return true
  }
  return /[？?]$/.test(trimmed) || /是什么|有哪些|有什么|怎么做|如何|怎么样|吗$/.test(trimmed)
}

export function formatSkillContract(skill: RouteSkill): string {
  const effect = skill.effect === 'write' ? '写' : '读'
  const parts = [`- ${skill.id}：${skill.title}。${skill.hint}（${effect}）`]
  if (skill.requires) {
    parts.push(`  前置：${skill.requires}`)
  }
  if (skill.artifact) {
    parts.push(`  成功：${skill.artifact}`)
  }
  if (skill.missing) {
    parts.push(`  缺数据：${skill.missing}`)
  }
  return parts.join('\n')
}

export function classifyOccupationIntent(skills: readonly RouteSkill[], text: string): IntentDecision {
  const hit = matchRouteSkill(skills, text)
  if (hit) {
    return { kind: 'invoke', skillId: hit.id }
  }
  if (isOccupationAsk(text)) {
    const read = primaryReadSkill(skills)
    if (read) {
      return { kind: 'invoke', skillId: read.id }
    }
  }
  return { kind: 'miss' }
}

/** 本地口令匹配；对不上就交给 dsh session，不再另开 Completions 分类器。 */
export function localClassifyDecision(skills: readonly RouteSkill[], text: string): ClassifyDecision {
  const decision = classifyOccupationIntent(skills, text)
  switch (decision.kind) {
    case 'invoke':
      return { kind: 'invoke', invoke: decision.skillId, text }
    case 'miss':
      return { kind: 'chat', text }
    default: {
      const exhaustive: never = decision
      return exhaustive
    }
  }
}

export function parseReadIntent(raw: string, skills: readonly RouteSkill[]): string | undefined {
  const decision = parseAllocateIntent(raw, skills)
  if (decision.kind !== 'invoke') {
    return undefined
  }
  const skill = skills.find((item) => item.id === decision.skillId)
  return skill?.effect === 'read' ? skill.id : undefined
}

export function parseAllocateIntent(raw: string, skills: readonly RouteSkill[]): AllocateDecision {
  const json = extractJsonObject(raw)
  if (!json) {
    return { kind: 'miss' }
  }
  const action = typeof json.action === 'string' ? json.action.trim() : ''
  const skillId = typeof json.skillId === 'string' ? json.skillId.trim() : ''
  if (action === 'chat') {
    return { kind: 'chat' }
  }
  if (action === 'note') {
    return skills.some((skill) => skill.id === 'note') ? { kind: 'note' } : { kind: 'miss' }
  }
  if (action === 'miss') {
    return { kind: 'miss' }
  }
  if ((action === 'invoke' || !action) && skillId) {
    const skill = skills.find((item) => item.id === skillId)
    if (!skill) {
      return { kind: 'miss' }
    }
    if (skill.id === 'note') {
      return { kind: 'note' }
    }
    return { kind: 'invoke', skillId: skill.id }
  }
  return { kind: 'miss' }
}

export function readIntentSystemPrompt(title: string, skills: readonly RouteSkill[]): string {
  return allocateIntentSystemPrompt(title, skills)
}

export function allocateIntentSystemPrompt(title: string, skills: readonly RouteSkill[]): string {
  const skillLines = skills.map((skill) => formatSkillContract(skill)).join('\n')
  const allowNote = skills.some((skill) => skill.id === 'note')
  return [
    `你在「${title}」的主对话里做分配：先理解这句话要什么，再决定下一步。不执行工具。`,
    '可选 action：',
    '- invoke：用户明确要做下列某条 Skill。写 Skill 必须是明确要求执行。',
    '- chat：问身份、模型、能力、解释、闲聊，或对不上 Skill 但需要开口回答。',
    '- miss：完全不知所云，只需让用户点一条 Skill。',
    allowNote ? '- note：听到、想到就记下，不是找回或升格。' : '',
    'Skill：',
    skillLines || '- （无）',
    allowNote
      ? '只输出一个 JSON 对象：{"action":"invoke","skillId":"id"} 或 {"action":"chat"} 或 {"action":"miss"} 或 {"action":"note"}。'
      : '只输出一个 JSON 对象：{"action":"invoke","skillId":"id"} 或 {"action":"chat"} 或 {"action":"miss"}。',
  ]
    .filter((line) => line.trim())
    .join('\n')
}

export function isSkillMissText(text: string): boolean {
  return (
    text.includes('先点一条') ||
    text.includes('刚才这句还对不上') ||
    text.includes('没有拆成待办') ||
    /对不上「.+」的 Skill/.test(text)
  )
}

function extractJsonObject(raw: string): { skillId?: unknown; action?: unknown } | undefined {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced?.[1] ?? trimmed).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) {
    return undefined
  }
  try {
    return JSON.parse(body.slice(start, end + 1)) as { skillId?: unknown }
  } catch {
    return undefined
  }
}
