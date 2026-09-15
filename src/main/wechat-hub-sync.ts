import { BrowserWindow, Notification } from 'electron'
import { ingestTodos } from './todo-ingest'
import { probeWechatCoverage, runHubCommand } from './wechat-hub-cli'
import {
  loadWechatHub,
  saveWechatLookup,
  saveWechatScan,
  saveWechatSettings,
  setWechatCoverage,
  setWechatLastError,
  setWechatScanning,
  wechatHubSettings,
  wechatHubState,
} from './wechat-hub-store'
import { showWorkbench } from './workbench-window'
import {
  HUB_INSTALL_URL,
  WECHAT_HUB_AGENT_ID,
  isLookupKind,
  isTriageDecision,
  lookupHint,
  parseDbStatus,
  parseOpportunityMarkdown,
  proposeWechatTodos,
  type WechatHubSettings,
  type WechatHubState,
  type WechatLookupKind,
  type WechatTriageDecision,
} from '../shared/wechat-hub'

const MIN_HEARTBEAT_MS = 6 * 60 * 60_000

let timer: NodeJS.Timeout | null = null
let inflight: Promise<WechatHubState> | null = null
let onNotificationClick: () => void = () => undefined

export function setWechatNotifyClickHandler(handler: () => void): void {
  onNotificationClick = handler
}

export function broadcastWechatHub(): void {
  const state = wechatHubState()
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('wxhub:changed', state)
    }
  }
}

export async function refreshWechatCoverage(): Promise<WechatHubState> {
  loadWechatHub()
  const { coverage } = probeWechatCoverage()
  if (coverage.access === 'missing' || coverage.access === 'engine') {
    setWechatCoverage(coverage)
    broadcastWechatHub()
    return wechatHubState()
  }
  const status = await runHubCommand(['db-status'], 20_000)
  const parsed = parseDbStatus(status.ok ? status.stdout : '')
  setWechatCoverage({
    ...coverage,
    dbStatus: parsed.summary || coverage.dbStatus,
    summary: parsed.summary ? `${coverage.summary} 索引：${parsed.messages} 条消息，开放商机 ${parsed.open} 个。` : coverage.summary,
  })
  if (!status.ok && status.error) {
    setWechatLastError(status.error)
  }
  broadcastWechatHub()
  return wechatHubState()
}

export function refreshWechatHub(): Promise<WechatHubState> {
  if (inflight) {
    return inflight
  }
  inflight = runRefresh().finally(() => {
    inflight = null
  })
  return inflight
}

async function runRefresh(): Promise<WechatHubState> {
  loadWechatHub()
  const settings = wechatHubSettings()
  const probed = probeWechatCoverage(settings)
  if (probed.coverage.access === 'missing') {
    setWechatCoverage(probed.coverage)
    setWechatLastError(`还没有本机引擎。安装说明：${HUB_INSTALL_URL}`)
    broadcastWechatHub()
    return wechatHubState()
  }
  if (probed.coverage.access === 'engine') {
    setWechatCoverage(probed.coverage)
    setWechatLastError('找到了引擎，但还没有 ~/.wechat-intelligence-hub/radar.db。请先在本机完成微信只读接入。')
    broadcastWechatHub()
    return wechatHubState()
  }

  setWechatScanning(true)
  setWechatLastError(null)
  broadcastWechatHub()

  try {
    const [todayResult, inboxResult, status] = await Promise.all([
      runHubCommand(['today', '--limit', '10']),
      runHubCommand(['inbox', '--limit', '20']),
      runHubCommand(['db-status'], 20_000),
    ])
    const errors = [todayResult.error, inboxResult.error, status.ok ? null : status.error].filter(Boolean)
    const today = parseOpportunityMarkdown(todayResult.stdout, 'today')
    const inbox = parseOpportunityMarkdown(inboxResult.stdout, 'inbox')
    const parsed = parseDbStatus(status.ok ? status.stdout : '')
    const coverage = {
      ...probed.coverage,
      dbStatus: parsed.summary,
      summary: parsed.summary
        ? `${probed.coverage.summary} 索引：${parsed.messages} 条消息，开放商机 ${parsed.open} 个。`
        : probed.coverage.summary,
    }

    let ingested = 0
    if (settings.todoFollowUp) {
      const drafts = proposeWechatTodos(today, inbox)
      if (drafts.length > 0) {
        const result = ingestTodos({
          agentId: WECHAT_HUB_AGENT_ID,
          source: '微信情报 · 今日行动',
          tags: ['微信'],
          items: drafts,
        })
        ingested = result.created.length + result.updated.length
      }
    }

    saveWechatScan({
      today,
      inbox,
      coverage,
      ingested,
      error: errors[0] ?? null,
    })

    if (settings.notify && (today.length > 0 || inbox.length > 0)) {
      const note = new Notification({
        title: '微信情报',
        body: `今日 ${today.length} 项，待分流 ${inbox.length} 项${ingested ? `，已写入 ${ingested} 条待办` : ''}`,
      })
      note.on('click', () => {
        onNotificationClick()
        showWorkbench('wxhub')
      })
      note.show()
    }
  } catch (error) {
    setWechatLastError(error instanceof Error ? error.message : String(error))
  } finally {
    setWechatScanning(false)
    broadcastWechatHub()
  }
  return wechatHubState()
}

export async function lookupWechat(kind: unknown, query: unknown): Promise<WechatHubState> {
  if (!isLookupKind(kind) || typeof query !== 'string' || !query.trim()) {
    setWechatLastError('请输入要查找的联系人、群名或关键词。')
    broadcastWechatHub()
    return wechatHubState()
  }
  const q = query.trim()
  const args = lookupArgs(kind, q)
  const result = await runHubCommand(args, 90_000)
  saveWechatLookup({
    kind,
    query: q,
    text: result.ok ? result.stdout.trim() || '没有找到匹配内容。' : `${lookupHint(kind)}\n${result.error ?? '查找失败'}`,
    at: new Date().toISOString(),
  })
  if (!result.ok) {
    setWechatLastError(result.error)
  }
  broadcastWechatHub()
  return wechatHubState()
}

export async function triageWechat(
  id: unknown,
  decision: unknown,
  followUp?: unknown,
  note?: unknown,
): Promise<WechatHubState> {
  if (typeof id !== 'number' && typeof id !== 'string') {
    setWechatLastError('缺少商机编号。')
    broadcastWechatHub()
    return wechatHubState()
  }
  if (!isTriageDecision(decision)) {
    setWechatLastError('分流决定只能是推进 / 等待 / 暂缓 / 忽略 / 成交 / 未成交。')
    broadcastWechatHub()
    return wechatHubState()
  }
  if (decision === 'wait' && (typeof followUp !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(followUp))) {
    setWechatLastError('选择「等待」时需要填写跟进日期，例如 2026-09-12。')
    broadcastWechatHub()
    return wechatHubState()
  }
  const args = ['triage', String(id), decision]
  appendTriageArgs(args, decision, followUp, note)
  const result = await runHubCommand(args, 30_000)
  if (!result.ok) {
    setWechatLastError(result.error)
    broadcastWechatHub()
    return wechatHubState()
  }
  return refreshWechatHub()
}

export function saveHubSettings(input: Partial<WechatHubSettings>): WechatHubState {
  saveWechatSettings(input)
  scheduleWechatHeartbeat()
  void refreshWechatCoverage()
  return wechatHubState()
}

export function scheduleWechatHeartbeat(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  const hours = wechatHubSettings().heartbeatHours
  if (hours <= 0) {
    return
  }
  const ms = Math.max(hours * 60 * 60_000, MIN_HEARTBEAT_MS)
  timer = setInterval(() => {
    void refreshWechatHub()
  }, ms)
}

export function stopWechatHeartbeat(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function lookupArgs(kind: WechatLookupKind, query: string): string[] {
  switch (kind) {
    case 'search':
      return ['db-search', query, '--limit', '20']
    case 'person':
      return ['person', query]
    case 'reply':
      return ['reply', query]
    default: {
      const _never: never = kind
      return _never
    }
  }
}

function appendTriageArgs(
  args: string[],
  decision: WechatTriageDecision,
  followUp: unknown,
  note: unknown,
): void {
  if (typeof followUp === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(followUp)) {
    args.push('--follow-up', followUp)
  }
  if (typeof note === 'string' && note.trim()) {
    args.push('--note', note.trim())
  }
  if (decision === 'pursue' && (!followUp || typeof followUp !== 'string')) {
    args.push('--next-action', '本机工作台跟进')
  }
}
