import { BrowserWindow, Notification } from 'electron'
import { ingestTodos } from './todo-ingest'
import { fetchPainSources } from './micro-sourcing-fetch'
import { startXPainCollector, stopXPainCollector } from './micro-sourcing-x'
import { polishMicroIdeas } from './micro-sourcing-llm'
import {
  loadMicroSourcing,
  microSettings,
  microState,
  saveMicroScan,
  setMicroLastError,
  setMicroScanning,
} from './micro-sourcing-store'
import { dayKey } from '../shared/datetime'
import {
  MICRO_AGENT_ID,
  MICRO_TAG,
  enabledSources,
  mergeIdeas,
  pruneSignals,
  resolveScanProxy,
  scoreSignal,
  upsertSignals,
  type MicroSourcingState,
  type PainSignal,
  type ScanError,
} from '../shared/micro-sourcing'
import { proposeMicroTodos } from '../shared/micro-sourcing-todos'

const MIN_HEARTBEAT_MS = 6 * 60 * 60_000

let timer: NodeJS.Timeout | null = null
let inflight: Promise<MicroSourcingState> | null = null
let onNotificationClick: () => void = () => undefined

export function setMicroNotifyClickHandler(handler: () => void): void {
  onNotificationClick = handler
}

export function broadcastMicro(): void {
  const state = microState()
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('micro:changed', state)
    }
  }
}

export function scanMicroSourcing(): Promise<MicroSourcingState> {
  startXPainCollector()
  if (inflight) {
    return inflight
  }
  inflight = runScan().finally(() => {
    inflight = null
  })
  return inflight
}

async function runScan(): Promise<MicroSourcingState> {
  loadMicroSourcing()
  const previous = microState()
  const settings = microSettings()
  const sources = enabledSources(settings)
  if (sources.length === 0) {
    setMicroLastError('至少打开一个领域，才能去金矿板块捞痛点。')
    broadcastMicro()
    return microState()
  }

  setMicroScanning(true)
  setMicroLastError(null)
  broadcastMicro()

  const now = new Date()
  const fetchedAt = now.toISOString()
  const errors: ScanError[] = []
  const incoming: PainSignal[] = []

  try {
    const batches = await fetchPainSources(sources, resolveScanProxy(settings.proxyUrl), now)
    for (const batch of batches) {
      if (batch.error) {
        errors.push({ source: batch.source.label, message: batch.error })
      }
      for (const post of batch.posts) {
        incoming.push(
          scoreSignal(
            {
              id: `${post.source}:${post.sourceId}`,
              source: post.source,
              sourceId: post.sourceId,
              url: post.url,
              title: post.title,
              body: post.body,
              community: post.community,
              sourceLabel: post.sourceLabel,
              domain: post.domain,
              score: post.score,
              comments: post.comments,
              createdAt: post.createdAt,
              fetchedAt,
              excerpts: post.excerpts,
            },
            settings,
            now,
          ),
        )
      }
    }

    const keepIds = previous.ideas
      .filter((idea) => idea.status === 'watching' || idea.status === 'building' || idea.status === 'parked')
      .flatMap((idea) => idea.signalIds)
    const signals = pruneSignals(upsertSignals(previous.signals, incoming), now, keepIds)
    let ideas = mergeIdeas(previous.ideas, signals, now, false)
    const polished = await polishMicroIdeas(
      ideas.filter((idea) => idea.status !== 'dismissed' && idea.postedDay === dayKey(now)).slice(0, 8),
      signals,
    )
    if (polished.usedModel) {
      const polishedIds = new Map(polished.ideas.map((idea) => [idea.id, idea]))
      ideas = ideas.map((idea) => polishedIds.get(idea.id) ?? idea)
      ideas = mergeIdeas(ideas, signals, now, true)
    }

    const newIdeas = ideas.filter(
      (idea) => idea.status === 'new' && idea.firstSeenAt === fetchedAt,
    ).length
    const errorText =
      incoming.length === 0 && errors.length > 0
        ? `这一轮没捞到当天的帖。${errors.map((item) => `${item.source}: ${item.message}`).join('；')}`
        : incoming.length === 0
          ? '今天这些源还没有新帖。热榜不会再用存量旧帖充数。'
          : null

    saveMicroScan({
      signals,
      ideas,
      lastRun: {
        at: fetchedAt,
        signalCount: incoming.length,
        ideaCount: ideas.filter((idea) => idea.status !== 'dismissed').length,
        newIdeas,
        errors,
        usedModel: polished.usedModel,
      },
      error: errorText,
    })
    afterScan(previous.ideas.map((idea) => idea.id), newIdeas)
  } catch (error) {
    setMicroLastError(error instanceof Error ? error.message : String(error))
  } finally {
    setMicroScanning(false)
    broadcastMicro()
  }
  return microState()
}

function afterScan(previousIds: string[], newIdeaCount: number): void {
  const state = microState()
  const settings = state.settings
  const fresh = state.ideas.filter((idea) => idea.status === 'new' && !previousIds.includes(idea.id))
  if (settings.todoFollowUp) {
    const drafts = proposeMicroTodos(state.ideas)
    if (drafts.length > 0) {
      ingestTodos({
        agentId: MICRO_AGENT_ID,
        source: 'Micro 选品策略 · 每日热榜',
        tags: [MICRO_TAG],
        items: drafts,
      })
    }
  }
  if (settings.notify && Notification.isSupported() && (newIdeaCount > 0 || fresh.length > 0)) {
    const top = fresh[0] ?? state.ideas.find((idea) => idea.status === 'new')
    if (!top) {
      return
    }
    const notification = new Notification({
      title: newIdeaCount > 1 ? `选品 · ${newIdeaCount} 个新痛点` : `选品 · ${top.title}`,
      body: top.pain,
      silent: false,
    })
    notification.on('click', () => {
      onNotificationClick()
    })
    notification.show()
  }
}

export function scheduleMicroHeartbeat(): void {
  startXPainCollector()
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  const settings = microSettings()
  if (settings.heartbeatHours <= 0) {
    return
  }
  const interval = Math.max(MIN_HEARTBEAT_MS, settings.heartbeatHours * 3_600_000)
  timer = setInterval(() => {
    void scanMicroSourcing()
  }, interval)
  const lastAt = microState().lastRun?.at
  const stale = !lastAt || Date.now() - Date.parse(lastAt) >= interval
  if (stale) {
    void scanMicroSourcing()
  }
}

export function stopMicroHeartbeat(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  stopXPainCollector()
}
