import type { AgentTodoDraft } from './agent-inbox.ts'
import { atHour, dayKey, toIsoLocal, tomorrowMorning } from './datetime.ts'

export const WECHAT_HUB_AGENT_ID = 'wxhub'
export const WECHAT_HUB_TAG = '微信'
export const WECHAT_FOLLOW_TAG = '跟进'
export const WECHAT_DEAL_TAG = '商机'
export const DEFAULT_RADAR_DB = '~/.wechat-intelligence-hub/radar.db'
export const HUB_INSTALL_URL = 'https://github.com/Rion-Wu-tech/wechat-intelligence-hub'

export const WECHAT_TRIAGE_DECISIONS = ['pursue', 'wait', 'pause', 'ignore', 'won', 'lost'] as const
export type WechatTriageDecision = (typeof WECHAT_TRIAGE_DECISIONS)[number]

export type WechatHubAccess = 'missing' | 'engine' | 'index' | 'ready'
export type WechatActionKind = 'today' | 'inbox'
export type WechatLookupKind = 'search' | 'person' | 'reply'

export const WECHAT_TRIAGE_LABELS: Record<WechatTriageDecision, string> = {
  pursue: '推进',
  wait: '等待',
  pause: '暂缓',
  ignore: '忽略',
  won: '成交',
  lost: '未成交',
}

export interface WechatHubSettings {
  hubHome: string
  heartbeatHours: number
  notify: boolean
  todoFollowUp: boolean
}

export interface WechatAction {
  id: number
  title: string
  status: string
  recordType: string
  confidence: string
  stage: string
  opportunityType: string
  priority: number
  amount: string
  followUp: string
  nextAction: string
  lastSignal: string
  notes: string
  kind: WechatActionKind
}

export interface WechatCoverage {
  access: WechatHubAccess
  hubHome: string | null
  hubScript: string | null
  readerBin: string | null
  radarDb: boolean
  radarDbPath: string
  summary: string
  dbStatus: string
}

export interface WechatLookup {
  kind: WechatLookupKind
  query: string
  text: string
  at: string
}

export interface WechatHubState {
  settings: WechatHubSettings
  coverage: WechatCoverage
  today: WechatAction[]
  inbox: WechatAction[]
  lookup: WechatLookup | null
  lastRunAt: string | null
  scanning: boolean
  lastError: string | null
  ingested: number
}

export interface WechatHubLaunch {
  kind: 'script' | 'python' | 'missing'
  command: string
  argsPrefix: string[]
  hubHome: string | null
  hubScript: string | null
}

export const DEFAULT_WECHAT_HUB_SETTINGS: WechatHubSettings = {
  hubHome: '',
  heartbeatHours: 24,
  notify: true,
  todoFollowUp: true,
}

export const EMPTY_WECHAT_COVERAGE: WechatCoverage = {
  access: 'missing',
  hubHome: null,
  hubScript: null,
  readerBin: null,
  radarDb: false,
  radarDbPath: DEFAULT_RADAR_DB,
  summary: '还没有找到本机微信情报库。先在这台电脑上安装 WeChat Intelligence Hub，完成只读接入后再刷新。',
  dbStatus: '',
}

export function isTriageDecision(value: unknown): value is WechatTriageDecision {
  return typeof value === 'string' && (WECHAT_TRIAGE_DECISIONS as readonly string[]).includes(value)
}

export function isLookupKind(value: unknown): value is WechatLookupKind {
  return value === 'search' || value === 'person' || value === 'reply'
}

export function normalizeHeartbeatHours(value: unknown): number {
  const hours = typeof value === 'number' ? value : Number(value)
  if (hours === 0 || hours === 12 || hours === 24 || hours === 48) {
    return hours
  }
  return DEFAULT_WECHAT_HUB_SETTINGS.heartbeatHours
}

export function normalizeWechatSettings(value: unknown): WechatHubSettings {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_WECHAT_HUB_SETTINGS }
  }
  const row = value as Partial<WechatHubSettings>
  return {
    hubHome: typeof row.hubHome === 'string' ? row.hubHome.trim() : '',
    heartbeatHours: normalizeHeartbeatHours(row.heartbeatHours),
    notify: typeof row.notify === 'boolean' ? row.notify : DEFAULT_WECHAT_HUB_SETTINGS.notify,
    todoFollowUp:
      typeof row.todoFollowUp === 'boolean' ? row.todoFollowUp : DEFAULT_WECHAT_HUB_SETTINGS.todoFollowUp,
  }
}

export function expandHome(pathValue: string, home: string): string {
  if (pathValue === '~') {
    return home
  }
  if (pathValue.startsWith('~/')) {
    return joinPath(home, pathValue.slice(2))
  }
  return pathValue
}

export function redactHome(text: string, home: string): string {
  if (!home) {
    return text
  }
  return text.split(home).join('~')
}

export function hubHomeCandidates(home: string, env: Record<string, string | undefined> = {}): string[] {
  const extras = [env.WECHAT_HUB_HOME, env.OWNWORKBUDDY_WECHAT_HUB_HOME]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => expandHome(value.trim(), home))
  const codex = expandHome(env.CODEX_HOME?.trim() || '~/.codex', home)
  return uniquePaths([
    ...extras,
    joinPath(codex, 'share/wechat-intelligence-hub/projects/wechat-intelligence-hub'),
    joinPath(home, 'wechat-intelligence-hub'),
    joinPath(home, 'Documents/wechat-intelligence-hub'),
    joinPath(home, 'codezone/wechat-intelligence-hub'),
    joinPath(home, 'workspace/wechat-intelligence-hub'),
  ])
}

export function hubScriptCandidates(home: string, env: Record<string, string | undefined> = {}): string[] {
  const extras = [env.OWNWORKBUDDY_WECHAT_HUB_BIN]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => expandHome(value.trim(), home))
  const codex = expandHome(env.CODEX_HOME?.trim() || '~/.codex', home)
  return uniquePaths([...extras, joinPath(codex, 'skills/wechat-intelligence-hub/scripts/hub.sh')])
}

export function readerCandidates(home: string, env: Record<string, string | undefined> = {}): string[] {
  const extras = [env.RION_WECHAT_CLI_BIN, env.RION_WECHAT_READER_BIN, env.OWNWORKBUDDY_RION_WECHAT_CLI]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => expandHome(value.trim(), home))
  const codex = expandHome(env.CODEX_HOME?.trim() || '~/.codex', home)
  return uniquePaths([
    ...extras,
    joinPath(codex, 'bin/rion-wechat-cli'),
    joinPath(codex, 'skills/wechat-cli/scripts/reader.sh'),
    joinPath(home, '.local/bin/rion-wechat-cli'),
  ])
}

export function radarDbPath(home: string): string {
  return expandHome(DEFAULT_RADAR_DB, home)
}

export function resolveHubLaunch(
  settings: WechatHubSettings,
  home: string,
  env: Record<string, string | undefined>,
  exists: (path: string) => boolean,
): WechatHubLaunch {
  const overrideHome = settings.hubHome ? expandHome(settings.hubHome, home) : ''
  const homes = uniquePaths([overrideHome, ...hubHomeCandidates(home, env)].filter(Boolean))
  const scripts = hubScriptCandidates(home, env)

  for (const script of scripts) {
    if (!exists(script)) {
      continue
    }
    const scriptDir = parentDir(script)
    const nearby = [
      joinPath(scriptDir, '../../../share/wechat-intelligence-hub/projects/wechat-intelligence-hub'),
      joinPath(scriptDir, '../../../../projects/wechat-intelligence-hub'),
    ]
    const hubHome =
      [...homes, ...nearby].find((candidate) => exists(joinPath(candidate, 'wechat_intelligence_hub.py'))) ?? null
    return {
      kind: 'script',
      command: script,
      argsPrefix: [],
      hubHome,
      hubScript: script,
    }
  }

  for (const hubHome of homes) {
    const engine = joinPath(hubHome, 'wechat_intelligence_hub.py')
    if (exists(engine)) {
      return {
        kind: 'python',
        command: 'python3',
        argsPrefix: [engine],
        hubHome,
        hubScript: null,
      }
    }
  }

  return {
    kind: 'missing',
    command: '',
    argsPrefix: [],
    hubHome: overrideHome || null,
    hubScript: null,
  }
}

export function resolveReaderBin(
  home: string,
  env: Record<string, string | undefined>,
  exists: (path: string) => boolean,
): string | null {
  return readerCandidates(home, env).find((path) => exists(path)) ?? null
}

export function coverageFromLaunch(input: {
  launch: WechatHubLaunch
  readerBin: string | null
  radarDb: boolean
  radarDbPath: string
  dbStatus: string
}): WechatCoverage {
  const { launch, readerBin, radarDb, radarDbPath: dbPath, dbStatus } = input
  if (launch.kind === 'missing') {
    return {
      ...EMPTY_WECHAT_COVERAGE,
      hubHome: launch.hubHome,
      radarDb,
      radarDbPath: dbPath,
      dbStatus,
    }
  }
  const access: WechatHubAccess = radarDb ? (readerBin ? 'ready' : 'index') : 'engine'
  return {
    access,
    hubHome: launch.hubHome,
    hubScript: launch.hubScript,
    readerBin,
    radarDb,
    radarDbPath: dbPath,
    dbStatus,
    summary: coverageSummary(access, radarDb, Boolean(readerBin)),
  }
}

export function coverageSummary(access: WechatHubAccess, radarDb: boolean, hasReader: boolean): string {
  switch (access) {
    case 'missing':
      return '还没有找到本机微信情报库。先在这台电脑上安装 WeChat Intelligence Hub，完成只读接入后再刷新。'
    case 'engine':
      return '找到了本地引擎，但还没有情报库索引。请先在本机完成微信只读接入，生成 ~/.wechat-intelligence-hub/radar.db。'
    case 'index':
      return radarDb
        ? '可以用已有索引看今日行动和待分流。完整实时读取还要本机 rion-wechat-cli。聊天不会离开这台电脑。'
        : '本地索引未就绪。'
    case 'ready':
      return hasReader
        ? '本机引擎和只读 Reader 都已找到。刷新只跑本地命令，不发微信、不上传聊天。'
        : '本机引擎已就绪。'
    default: {
      const _never: never = access
      return _never
    }
  }
}

export function parseOpportunityMarkdown(text: string, kind: WechatActionKind): WechatAction[] {
  const actions: WechatAction[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let current: WechatAction | null = null

  for (const raw of lines) {
    const line = raw.trimEnd()
    const header = line.match(/^- \*\*#(\d+)｜(.+?)\*\*[：:](.*)$/)
    if (header) {
      if (current) {
        actions.push(current)
      }
      const meta = header[3]?.trim() ?? ''
      const labels = meta.split('，')[0]?.split(/\s*\/\s*/) ?? []
      current = {
        id: Number(header[1]),
        title: (header[2] ?? '').trim(),
        status: labels[0]?.trim() || '',
        recordType: labels[1]?.trim() || '',
        confidence: labels[2]?.trim() || '',
        stage: labels[3]?.trim() || '',
        opportunityType: labels[4]?.trim() || '',
        priority: Number(meta.match(/优先级\s*(\d+)/)?.[1] ?? 0),
        amount: (meta.match(/预算\/报价：([^，,]+)/)?.[1] ?? '').trim(),
        followUp: (meta.match(/跟进：([^\s，,]+)/)?.[1] ?? '').trim(),
        nextAction: '',
        lastSignal: '',
        notes: '',
        kind,
      }
      continue
    }
    if (!current) {
      continue
    }
    const next = line.match(/^\s+- 下一步：(.+)$/)
    if (next) {
      current.nextAction = next[1]?.trim() ?? ''
      continue
    }
    const signal = line.match(/^\s+- 最后信号：([^；;]+)/)
    if (signal) {
      current.lastSignal = signal[1]?.trim() ?? ''
      continue
    }
    const note = line.match(/^\s+- 备注：(.+)$/)
    if (note) {
      current.notes = note[1]?.trim() ?? ''
    }
  }
  if (current) {
    actions.push(current)
  }
  return actions.filter((row) => Number.isFinite(row.id) && row.id > 0 && row.title)
}

export function parseDbStatus(text: string): { messages: number; opportunities: number; open: number; summary: string } {
  const messages = Number(text.match(/消息：(\d+)\s*条/)?.[1] ?? 0)
  const opportunities = Number(text.match(/商机：(\d+)\s*个/)?.[1] ?? 0)
  const open = Number(text.match(/开放\s*(\d+)\s*个/)?.[1] ?? 0)
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
  return {
    messages,
    opportunities,
    open,
    summary: lines.join(' · '),
  }
}

export function followUpNotifyAt(followUp: string, now = new Date()): string {
  const match = followUp.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    return toIsoLocal(tomorrowMorning(now))
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 9, 0, 0, 0)
  if (Number.isNaN(date.getTime())) {
    return toIsoLocal(tomorrowMorning(now))
  }
  return toIsoLocal(atHour(date, 9))
}

export function proposeWechatTodos(
  today: WechatAction[],
  inbox: WechatAction[],
  now = new Date(),
): AgentTodoDraft[] {
  const stamp = dayKey(now)
  const drafts: AgentTodoDraft[] = []
  for (const row of today.slice(0, 10)) {
    drafts.push({
      title: `跟进微信：${row.title}`,
      note: actionNote(row),
      notifyAt: followUpNotifyAt(row.followUp, now),
      tags: [WECHAT_HUB_TAG, WECHAT_FOLLOW_TAG],
      dedupeKey: `wxhub:today:${row.id}:${stamp}`,
    })
  }
  for (const row of inbox.slice(0, 5)) {
    drafts.push({
      title: `分流微信：${row.title}`,
      note: actionNote(row),
      notifyAt: followUpNotifyAt(row.followUp, now),
      tags: [WECHAT_HUB_TAG, WECHAT_DEAL_TAG],
      dedupeKey: `wxhub:inbox:${row.id}`,
    })
  }
  return drafts
}

export function lookupHint(kind: WechatLookupKind): string {
  switch (kind) {
    case 'search':
      return '只搜本机已索引的聊天，不会把原文送到云端。'
    case 'person':
      return '按联系人或群名查看本机上下文，不发送消息。'
    case 'reply':
      return '只生成本地回复草稿，不会替你发出去。'
    default: {
      const _never: never = kind
      return _never
    }
  }
}

function actionNote(row: WechatAction): string {
  return [
    `#${row.id} · ${row.status} · ${row.recordType} · ${row.stage}`,
    row.nextAction ? `下一步：${row.nextAction}` : '',
    row.amount ? `预算/报价：${row.amount}` : '',
    row.followUp ? `跟进：${row.followUp}` : '',
    row.lastSignal ? `最后信号：${row.lastSignal}` : '',
    row.notes,
  ]
    .filter(Boolean)
    .join('\n')
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const path of paths) {
    if (!path || seen.has(path)) {
      continue
    }
    seen.add(path)
    result.push(path)
  }
  return result
}

function parentDir(path: string): string {
  const pieces = path.split(/[\\/]/).filter(Boolean)
  pieces.pop()
  const joined = pieces.join('/')
  return path.startsWith('/') ? `/${joined}` : joined
}

function joinPath(...parts: string[]): string {
  const chunks: string[] = []
  for (const part of parts) {
    for (const piece of part.split(/[\\/]/)) {
      if (!piece || piece === '.') {
        continue
      }
      if (piece === '..') {
        chunks.pop()
        continue
      }
      chunks.push(piece)
    }
  }
  const joined = chunks.join('/')
  return parts[0]?.startsWith('/') ? `/${joined}` : joined
}
