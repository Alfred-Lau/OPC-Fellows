import { markdownTable } from './chat-markdown.ts'
import { asSkillReply, pinByIds, type ShortListing, type SkillReply } from './listing.ts'
import { pickIndexed } from './skill-route.ts'

export const GROWTH_AGENT_ID = 'growth'

export const GROWTH_TAG = '增长'

export type AarrrStage = 'acquisition' | 'activation' | 'retention' | 'referral' | 'revenue'

export type ExperimentStatus = 'draft' | 'running' | 'won' | 'lost' | 'inconclusive'

export type ExperimentVerdict = 'won' | 'lost' | 'inconclusive'

export type LoopKind = 'content' | 'viral' | 'paid' | 'sales' | 'product'

export type ChannelStatus = 'testing' | 'scaling' | 'paused' | 'killed'

export interface GrowthExperiment {
  id: string
  title: string
  hypothesis: string
  metric: string
  stage: AarrrStage
  status: ExperimentStatus
  ideaId: string
  loopId: string
  channelId: string
  ammoNote: string
  note: string
  createdAt: string
  updatedAt: string
}

export interface GrowthLoop {
  id: string
  title: string
  kind: LoopKind
  steps: string
  productId: string
  note: string
  createdAt: string
  updatedAt: string
}

export interface GrowthChannel {
  id: string
  name: string
  status: ChannelStatus
  stage: AarrrStage
  score: number
  productId: string
  note: string
  createdAt: string
  updatedAt: string
}

export interface GrowthState {
  experiments: GrowthExperiment[]
  loops: GrowthLoop[]
  channels: GrowthChannel[]
}

export interface GrowthExperimentInput {
  id?: string
  title: string
  hypothesis?: string
  metric?: string
  stage?: AarrrStage
  status?: ExperimentStatus
  ideaId?: string
  loopId?: string
  channelId?: string
  ammoNote?: string
  note?: string
}

export interface GrowthLoopInput {
  id?: string
  title: string
  kind?: LoopKind
  steps?: string
  productId?: string
  note?: string
}

export interface GrowthChannelInput {
  id?: string
  name: string
  status?: ChannelStatus
  stage?: AarrrStage
  score?: number
  productId?: string
  note?: string
}

export const AARRR_STAGES: readonly AarrrStage[] = [
  'acquisition',
  'activation',
  'retention',
  'referral',
  'revenue',
]

export const EXPERIMENT_STATUSES: readonly ExperimentStatus[] = [
  'draft',
  'running',
  'won',
  'lost',
  'inconclusive',
]

export const LOOP_KINDS: readonly LoopKind[] = ['content', 'viral', 'paid', 'sales', 'product']

export const CHANNEL_STATUSES: readonly ChannelStatus[] = ['testing', 'scaling', 'paused', 'killed']

export function emptyGrowth(): GrowthState {
  return { experiments: [], loops: [], channels: [] }
}

export function isAarrrStage(value: unknown): value is AarrrStage {
  return AARRR_STAGES.includes(value as AarrrStage)
}

export function isExperimentStatus(value: unknown): value is ExperimentStatus {
  return EXPERIMENT_STATUSES.includes(value as ExperimentStatus)
}

export function isLoopKind(value: unknown): value is LoopKind {
  return LOOP_KINDS.includes(value as LoopKind)
}

export function isChannelStatus(value: unknown): value is ChannelStatus {
  return CHANNEL_STATUSES.includes(value as ChannelStatus)
}

export function aarrrLabel(stage: AarrrStage): string {
  switch (stage) {
    case 'acquisition':
      return '获客'
    case 'activation':
      return '激活'
    case 'retention':
      return '留存'
    case 'referral':
      return '推荐'
    case 'revenue':
      return '营收'
    default: {
      const exhaustive: never = stage
      return exhaustive
    }
  }
}

export function experimentStatusLabel(status: ExperimentStatus): string {
  switch (status) {
    case 'draft':
      return '草稿'
    case 'running':
      return '在跑'
    case 'won':
      return '赢了'
    case 'lost':
      return '输了'
    case 'inconclusive':
      return '无结论'
    default: {
      const exhaustive: never = status
      return exhaustive
    }
  }
}

export function loopKindLabel(kind: LoopKind): string {
  switch (kind) {
    case 'content':
      return '内容环'
    case 'viral':
      return '裂变环'
    case 'paid':
      return '付费环'
    case 'sales':
      return '销售环'
    case 'product':
      return '产品环'
    default: {
      const exhaustive: never = kind
      return exhaustive
    }
  }
}

export function channelStatusLabel(status: ChannelStatus): string {
  switch (status) {
    case 'testing':
      return '试水'
    case 'scaling':
      return '扩量'
    case 'paused':
      return '暂停'
    case 'killed':
      return '杀掉'
    default: {
      const exhaustive: never = status
      return exhaustive
    }
  }
}

export function clampChannelScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 3
  }
  return Math.min(5, Math.max(1, Math.round(value)))
}

export function listedExperiments(
  experiments: readonly GrowthExperiment[],
  pinnedIds?: readonly string[],
): GrowthExperiment[] {
  if (pinnedIds?.length) {
    return pinByIds(experiments, pinnedIds, (item) => item.id)
  }
  const running = experiments.filter((item) => item.status === 'running' || item.status === 'draft')
  return running.length > 0 ? running : [...experiments]
}

export function parseAarrrStage(text: string): AarrrStage | undefined {
  if (/获客|拉新|acquisition/i.test(text)) {
    return 'acquisition'
  }
  if (/激活|注册|首次|activation/i.test(text)) {
    return 'activation'
  }
  if (/留存|回访|retention/i.test(text)) {
    return 'retention'
  }
  if (/推荐|裂变|邀请|referral/i.test(text)) {
    return 'referral'
  }
  if (/营收|付费|转化|revenue/i.test(text)) {
    return 'revenue'
  }
  return undefined
}

export function parseLoopKind(text: string): LoopKind | undefined {
  if (/裂变|病毒|viral/i.test(text)) {
    return 'viral'
  }
  if (/付费|投放|广告|paid/i.test(text)) {
    return 'paid'
  }
  if (/销售|私域|sales/i.test(text)) {
    return 'sales'
  }
  if (/产品|功能|product/i.test(text)) {
    return 'product'
  }
  if (/内容|内容环|geo|seo/i.test(text)) {
    return 'content'
  }
  return undefined
}

export function parseChannelStatus(text: string): ChannelStatus | undefined {
  if (/扩量|加码|放量|scaling/i.test(text)) {
    return 'scaling'
  }
  if (/杀掉|停掉|killed/i.test(text)) {
    return 'killed'
  }
  if (/暂停|paused/i.test(text)) {
    return 'paused'
  }
  if (/试水|测试|testing/i.test(text)) {
    return 'testing'
  }
  return undefined
}

export function parseVerdict(text: string): ExperimentVerdict | undefined {
  if (/无结论|看不出|不确定|inconclusive/i.test(text)) {
    return 'inconclusive'
  }
  if (/赢了|有效|成功|won/i.test(text)) {
    return 'won'
  }
  if (/输了|失败|无效|lost/i.test(text)) {
    return 'lost'
  }
  return undefined
}

export function formatDiagnose(state: GrowthState, text = ''): SkillReply {
  const experiments = state.experiments
  if (experiments.length === 0 && state.loops.length === 0 && state.channels.length === 0) {
    return asSkillReply(
      [
        '增长台还是空的。先说「开实验」，带上假设和指标。',
        '流量看 @项目监控官，文案看 @社媒弹药手，账本看 @财务顾问。这份台不复制他们的数字。',
      ].join('\n'),
    )
  }
  const listed = listedExperiments(experiments)
  const rows = listed.slice(0, 8).map((item, index) => [
    String(index + 1),
    item.title,
    aarrrLabel(item.stage),
    experimentStatusLabel(item.status),
    item.metric || '—',
  ])
  const gaps = missingStages(state)
  const gapLine =
    gaps.length > 0 ? `还没有覆盖：**${gaps.map(aarrrLabel).join('、')}**。` : '五层都有在跑的实验或扩量渠道。'
  const picked = shouldNameBest(text) ? pickHottest(listed) : undefined
  const headline = picked ? `最该先盯的是 **${picked.title}**（${experimentStatusLabel(picked.status)}）。` : `诊断漏斗 · 实验 **${experiments.length}** 条。`
  const channelLine =
    state.channels.length > 0
      ? `渠道 ${state.channels.map((item) => `${item.name} ${channelStatusLabel(item.status)} ${item.score}分`).join('、')}。`
      : '还没有渠道表。说「排渠道 小红书 试水 3分」。'
  const loopLine =
    state.loops.length > 0
      ? `增长环：${state.loops.map((item) => `${item.title}（${loopKindLabel(item.kind)}）`).join('、')}。`
      : '还没有增长环。说「画增长环 内容环：发帖 → GEO → 注册」。'
  return asSkillReply(
    [headline, '', markdownTable(['#', '实验', '层', '状态', '指标'], rows), '', gapLine, channelLine, loopLine].join('\n'),
    listed.length > 0 ? { kind: 'experiment', ids: listed.map((item) => item.id) } : undefined,
  )
}

export function planOpenExperiment(
  text: string,
  state: GrowthState,
  ideaIds?: readonly string[],
): { input?: GrowthExperimentInput; reply: string } {
  const stripped = text
    .replace(/开实验|开一个实验|新实验/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!stripped) {
    return { reply: '开实验要假设。例如「开实验 官网 CTA 改成试用。假设：首屏改按钮能提高注册。指标：注册数 层：激活」。' }
  }
  const hypothesis = fieldAfter(stripped, /假设[:：]/) || stripped
  const metric = fieldAfter(stripped, /指标[:：]/) || ''
  const title = firstTitle(stripped) || hypothesis.slice(0, 32)
  const ideaId = ideaIds?.[0] ?? ''
  const existing = state.experiments.find((item) => item.title === title)
  return {
    input: {
      ...(existing ? { id: existing.id } : {}),
      title,
      hypothesis,
      metric,
      stage: parseAarrrStage(stripped) ?? existing?.stage ?? 'acquisition',
      status: existing?.status === 'draft' || !existing ? 'running' : existing.status,
      ideaId,
    },
    reply: existing
      ? `已更新实验「${title}」。假设仍只有这一份，不另开一条。`
      : `已开实验「${title}」· ${aarrrLabel(parseAarrrStage(stripped) ?? 'acquisition')}。${ideaId ? '挂了 Idea 指针，正文仍在选品。' : '没有 Idea 指针也行，这是增长台自己的假设。'}`,
  }
}

export function planVerdict(
  text: string,
  experiments: readonly GrowthExperiment[],
  pinnedIds?: readonly string[],
): { id?: string; status?: ExperimentVerdict; reply: string } {
  const listed = listedExperiments(experiments, pinnedIds)
  if (listed.length === 0) {
    return { reply: '还没有实验可判定。先开实验。' }
  }
  const verdict = parseVerdict(text)
  const picked = pickIndexed(listed, text, { pinnedIds, idOf: (item) => item.id })
  if (!verdict) {
    return { reply: '判实验要赢了、输了或无结论。例如「判实验 第一条 赢了」。' }
  }
  if ('kind' in picked) {
    if (listed.length === 1) {
      const only = listed[0]
      if (!only) {
        return { reply: '还没有实验可判定。先开实验。' }
      }
      if (isClosedStatus(only.status)) {
        return { reply: `「${only.title}」已经是${experimentStatusLabel(only.status)}。源关闭则下游停，不得擅自复活。` }
      }
      return {
        id: only.id,
        status: verdict,
        reply: `已判定「${only.title}」${experimentStatusLabel(verdict)}。${verdict === 'won' ? '要交给弹药手就说「交接弹药」。' : '不要复制一份下游对象。'}`,
      }
    }
    return { reply: `现在有 ${listed.length} 条可判定。说「判实验 第一条 赢了」。` }
  }
  if ('needle' in picked) {
    return { reply: `对不上「${picked.needle}」这一条。` }
  }
  if (isClosedStatus(picked.item.status)) {
    return { reply: `「${picked.item.title}」已经是${experimentStatusLabel(picked.item.status)}。源关闭则下游停，不得擅自复活。` }
  }
  return {
    id: picked.item.id,
    status: verdict,
    reply: `已判定「${picked.item.title}」${experimentStatusLabel(verdict)}。${verdict === 'won' ? '要交给弹药手就说「交接弹药」。' : '不要复制一份下游对象。'}`,
  }
}

export function planLoop(text: string, loops: readonly GrowthLoop[]): { input?: GrowthLoopInput; reply: string } {
  const stripped = text
    .replace(/画增长环|增长环/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!stripped) {
    if (loops.length === 0) {
      return { reply: '画增长环要步骤。例如「画增长环 内容环：发帖 → GEO → 注册 → 再发」。' }
    }
    return {
      reply: [
        `已有增长环 **${loops.length}** 条。`,
        '',
        markdownTable(
          ['#', '环', '类型', '步骤'],
          loops.map((item, index) => [String(index + 1), item.title, loopKindLabel(item.kind), item.steps || '—']),
        ),
      ].join('\n'),
    }
  }
  const kind = parseLoopKind(stripped) ?? 'content'
  const steps = stripped.replace(/^(内容环|裂变环|付费环|销售环|产品环)[:：]?\s*/u, '').trim() || stripped
  const title = loopKindLabel(kind)
  const existing = loops.find((item) => item.kind === kind || item.title === title)
  return {
    input: {
      ...(existing ? { id: existing.id } : {}),
      title: existing?.title ?? title,
      kind,
      steps,
    },
    reply: existing ? `已更新「${existing.title}」：${steps}。` : `已画「${title}」：${steps}。可挂产品目录指针，不复制产品记录。`,
  }
}

export function planChannel(text: string, channels: readonly GrowthChannel[]): { input?: GrowthChannelInput; reply: string } {
  const stripped = text
    .replace(/排渠道|渠道排序|渠道优先级/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!stripped) {
    if (channels.length === 0) {
      return { reply: '排渠道要点名和处置。例如「排渠道 小红书 扩量 4分」。' }
    }
    return {
      reply: [
        `渠道 **${channels.length}** 条。`,
        '',
        markdownTable(
          ['#', '渠道', '处置', '层', '分'],
          channels.map((item, index) => [
            String(index + 1),
            item.name,
            channelStatusLabel(item.status),
            aarrrLabel(item.stage),
            String(item.score),
          ]),
        ),
      ].join('\n'),
    }
  }
  const status = parseChannelStatus(stripped) ?? 'testing'
  const stage = parseAarrrStage(stripped) ?? 'acquisition'
  const scoreHit = stripped.match(/(\d)\s*分/)
  const score = scoreHit?.[1] ? clampChannelScore(Number(scoreHit[1])) : 3
  const name = stripped
    .replace(/试水|测试|扩量|加码|放量|暂停|杀掉|停掉/g, ' ')
    .replace(/\d\s*分/g, ' ')
    .replace(/获客|激活|留存|推荐|营收/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!name) {
    return { reply: '排渠道要点名，例如「排渠道 小红书 扩量 4分」。' }
  }
  const existing = channels.find((item) => item.name === name)
  return {
    input: {
      ...(existing ? { id: existing.id } : {}),
      name,
      status,
      stage,
      score,
    },
    reply: existing
      ? `已把「${name}」改成${channelStatusLabel(status)} · ${score}分。`
      : `已记下渠道「${name}」· ${channelStatusLabel(status)} · ${score}分 · ${aarrrLabel(stage)}。这不是账号，也不是弹药。`,
  }
}

export function planShip(
  text: string,
  experiments: readonly GrowthExperiment[],
  hasAmmo: boolean,
  pinnedIds?: readonly string[],
): { id?: string; reply: string } {
  if (!hasAmmo) {
    return { reply: '弹药手还没启用。增长台不写文案，交接只传指针。先雇社媒弹药手。' }
  }
  const won = experiments.filter((item) => item.status === 'won')
  const listed = pinnedIds?.length ? listedExperiments(experiments, pinnedIds) : won.length > 0 ? won : listedExperiments(experiments)
  if (listed.length === 0) {
    return { reply: '没有可交接的实验。先判一条赢了，再交接弹药。' }
  }
  const picked = pickIndexed(listed, text, { pinnedIds, idOf: (item) => item.id })
  const target = 'item' in picked ? picked.item : listed.length === 1 ? listed[0] : undefined
  if (!target) {
    if ('needle' in picked) {
      return { reply: `对不上「${picked.needle}」这一条。` }
    }
    return { reply: `有 ${listed.length} 条。说「交接弹药 第一条」。` }
  }
  if (target.status !== 'won') {
    return { reply: `「${target.title}」还是${experimentStatusLabel(target.status)}。只有赢了的实验才交给弹药手。` }
  }
  if (target.ammoNote.startsWith('ammo:')) {
    return { reply: `「${target.title}」的指针已经交给弹药手。不复制第二份文案。` }
  }
  return {
    id: target.id,
    reply: `指针交给弹药手：「${target.title}」。去 @社媒弹药手 装填弹药。增长台不写文案。`,
  }
}

export function experimentTodoTitle(experiment: Pick<GrowthExperiment, 'title' | 'status'>): string {
  return `跟进实验：${experiment.title}（${experimentStatusLabel(experiment.status)}）`
}

export function isClosedStatus(status: ExperimentStatus): boolean {
  return status === 'won' || status === 'lost' || status === 'inconclusive'
}

function missingStages(state: GrowthState): AarrrStage[] {
  const covered = new Set<AarrrStage>()
  for (const item of state.experiments) {
    if (item.status === 'running' || item.status === 'won') {
      covered.add(item.stage)
    }
  }
  for (const item of state.channels) {
    if (item.status === 'scaling' || item.status === 'testing') {
      covered.add(item.stage)
    }
  }
  return AARRR_STAGES.filter((stage) => !covered.has(stage))
}

function pickHottest(experiments: readonly GrowthExperiment[]): GrowthExperiment | undefined {
  return (
    experiments.find((item) => item.status === 'running') ??
    experiments.find((item) => item.status === 'draft') ??
    experiments[0]
  )
}

function shouldNameBest(text: string): boolean {
  return /最好|最该|哪一层|哪条|哪一个/.test(text)
}

function fieldAfter(text: string, marker: RegExp): string {
  const match = text.split(marker)[1]
  if (!match) {
    return ''
  }
  return match.split(/假设[:：]|指标[:：]|层[:：]/)[0]?.trim() ?? ''
}

function firstTitle(text: string): string {
  const before = text.split(/假设[:：]|指标[:：]|层[:：]/)[0]?.trim() ?? ''
  return before.replace(/[。．]$/u, '').trim()
}

export function listingOf(state: GrowthState, kind: ShortListing['kind']): ShortListing | undefined {
  switch (kind) {
    case 'experiment':
      return { kind, ids: listedExperiments(state.experiments).map((item) => item.id) }
    case 'idea':
    case 'ammo':
    case 'wx':
    case 'account':
    case 'note':
      return undefined
    default: {
      const exhaustive: never = kind
      return exhaustive
    }
  }
}
