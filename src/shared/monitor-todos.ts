import type { AgentTodoDraft } from './agent-inbox.ts'
import { dayKey, toIsoLocal, tomorrowMorning } from './datetime.ts'
import { isFreshFailure } from './monitor.ts'
import type { GitProjectInfo, MonitorSnapshot, VercelAlertInfo, VercelProjectInfo } from './monitor.ts'
import { formatVital, poorVitalTodos } from './speed-insights.ts'
import { getProjectTag } from './tags.ts'

const MAX_PROPOSALS = 12
const TRAFFIC_DROP_PCT = 20
const TRAFFIC_YESTERDAY_MIN = 10

export function proposeMonitorTodos(snapshot: MonitorSnapshot, now = new Date()): AgentTodoDraft[] {
  const notifyAt = toIsoLocal(tomorrowMorning(now))
  const stamp = dayKey(tomorrowMorning(now))
  const drafts: AgentTodoDraft[] = []

  for (const project of snapshot.projects) {
    drafts.push(...gitTodos(project, notifyAt, stamp))
  }
  for (const project of snapshot.vercel.projects) {
    drafts.push(...vercelTodos(project, notifyAt, stamp, now))
  }
  for (const alert of snapshot.vercel.alerts) {
    const draft = alertTodo(alert, notifyAt, stamp)
    if (draft) {
      drafts.push(draft)
    }
  }

  return drafts.slice(0, MAX_PROPOSALS)
}

function tagged(draft: Omit<AgentTodoDraft, 'tags'>): AgentTodoDraft {
  return { ...draft, tags: [getProjectTag()] }
}

function gitTodos(project: GitProjectInfo, notifyAt: string, stamp: string): AgentTodoDraft[] {
  if (!project.isRepo) {
    return []
  }
  const items: AgentTodoDraft[] = []
  if (project.dirty) {
    items.push(
      tagged({
        title: `整理 ${project.name} 未提交改动`,
        note: project.lastCommit ? `最近提交：${project.lastCommit}` : project.dir,
        notifyAt,
        dedupeKey: `monitor:git-dirty:${project.name}:${stamp}`,
      }),
    )
  }
  if (project.ahead > 0) {
    items.push(
      tagged({
        title: `推送 ${project.name} 本地超前 ${project.ahead} 个提交`,
        note: project.branch ? `分支 ${project.branch}` : project.dir,
        notifyAt,
        dedupeKey: `monitor:git-ahead:${project.name}:${stamp}`,
      }),
    )
  }
  if (project.behind > 0) {
    items.push(
      tagged({
        title: `拉取 ${project.name} 落后远程 ${project.behind} 个提交`,
        note: project.branch ? `分支 ${project.branch}` : project.dir,
        notifyAt,
        dedupeKey: `monitor:git-behind:${project.name}:${stamp}`,
      }),
    )
  }
  return items
}

function vercelTodos(
  project: VercelProjectInfo,
  notifyAt: string,
  stamp: string,
  now: Date,
): AgentTodoDraft[] {
  const items: AgentTodoDraft[] = []
  if (isFreshFailure(project, now.getTime())) {
    items.push(
      tagged({
        title: `排查 ${project.name} 生产部署失败`,
        note: project.lastCommitMessage ?? project.url ?? undefined,
        notifyAt,
        dedupeKey: `monitor:vercel-error:${project.name}:${stamp}`,
      }),
    )
  }
  const analytics = project.analytics
  if (
    analytics &&
    !analytics.isGrowing &&
    analytics.yesterdayPageviews >= TRAFFIC_YESTERDAY_MIN &&
    analytics.deltaPct !== null &&
    analytics.deltaPct <= -TRAFFIC_DROP_PCT
  ) {
    items.push(
      tagged({
        title: `关注 ${project.name} 流量回落`,
        note: `今日 ${analytics.todayPageviews}，昨日 ${analytics.yesterdayPageviews}（${analytics.deltaPct}%）`,
        notifyAt,
        dedupeKey: `monitor:traffic-drop:${project.name}:${stamp}`,
      }),
    )
  }
  const poor = poorVitalTodos(project)[0]
  if (poor) {
    const label = { lcp: 'LCP', inp: 'INP', ttfb: 'TTFB', cls: 'CLS' } as const
    items.push(
      tagged({
        title: `关注 ${project.name} ${label[poor.vital]} 偏慢`,
        note: `${poor.where} ${formatVital(poor.vital, poor.value)}`,
        notifyAt,
        dedupeKey: `monitor:speed:${project.name}:${stamp}`,
      }),
    )
  }
  return items
}

function alertTodo(alert: VercelAlertInfo, notifyAt: string, stamp: string): AgentTodoDraft | null {
  if (alert.endedAt || /resolved|ok|good/i.test(alert.status)) {
    return null
  }
  const key = alert.id || alert.title
  if (!key) {
    return null
  }
  return tagged({
    title: `处理线上报警：${alert.title}`,
    note: alert.summary ?? alert.type,
    notifyAt,
    dedupeKey: `monitor:alert:${key}:${stamp}`,
  })
}
