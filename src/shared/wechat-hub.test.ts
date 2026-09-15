import assert from 'node:assert/strict'
import test from 'node:test'
import {
  coverageFromLaunch,
  coverageSummary,
  followUpNotifyAt,
  hubHomeCandidates,
  isTriageDecision,
  lookupHint,
  normalizeWechatSettings,
  parseDbStatus,
  parseOpportunityMarkdown,
  proposeWechatTodos,
  redactHome,
  resolveHubLaunch,
  resolveReaderBin,
} from './wechat-hub.ts'

const SAMPLE = `# 微信个人情报库｜今日行动

- **#12｜Brand A Thread**：待回复 / 正式机会 / 已确认 / 待报价 / 商单/合作，优先级 4，预算/报价：650 USD，跟进：2026-08-03
  - 下一步：发送合作方案
  - 最后信号：2026-08-02 10:12；证据 3 条；强化 2 次
  - 备注：等待 brief
- **#8｜培训群**：待审核 / 待审核候选 / 待核实 / 待确认 / 培训，优先级 5
  - 下一步：待人工确认
  - 最后信号：未知；证据 1 条；强化 1 次
  - 候选过期：2026-08-20

先处理到期跟进和待结算，再用 \`triage <ID> <决定>\` 更新结果。
`

test('解析今日行动 Markdown，不把空标题收进来', () => {
  const rows = parseOpportunityMarkdown(SAMPLE, 'today')
  assert.equal(rows.length, 2)
  assert.equal(rows[0]?.id, 12)
  assert.equal(rows[0]?.title, 'Brand A Thread')
  assert.equal(rows[0]?.status, '待回复')
  assert.equal(rows[0]?.recordType, '正式机会')
  assert.equal(rows[0]?.priority, 4)
  assert.equal(rows[0]?.amount, '650 USD')
  assert.equal(rows[0]?.followUp, '2026-08-03')
  assert.equal(rows[0]?.nextAction, '发送合作方案')
  assert.equal(rows[0]?.lastSignal, '2026-08-02 10:12')
  assert.equal(rows[1]?.id, 8)
  assert.equal(rows[1]?.kind, 'today')
  assert.deepEqual(parseOpportunityMarkdown('暂无符合条件的商机。\n', 'inbox'), [])
})

test('有明确跟进日期就用当天上午 9 点提醒', () => {
  assert.equal(followUpNotifyAt('2026-08-03', new Date('2026-08-01T12:00:00')), '2026-08-03T09:00:00')
  assert.equal(followUpNotifyAt('', new Date('2026-08-01T12:00:00')), '2026-08-02T09:00:00')
})

test('今日行动和待分流分别写入待办，并用 id 去重', () => {
  const today = parseOpportunityMarkdown(SAMPLE, 'today')
  const drafts = proposeWechatTodos(today, today, new Date('2026-08-03T08:00:00'))
  assert.equal(drafts[0]?.title, '跟进微信：Brand A Thread')
  assert.equal(drafts[0]?.dedupeKey, 'wxhub:today:12:2026-08-03')
  assert.deepEqual(drafts[0]?.tags, ['微信', '跟进'])
  assert.equal(drafts[2]?.title, '分流微信：Brand A Thread')
  assert.equal(drafts[2]?.dedupeKey, 'wxhub:inbox:12')
  assert.ok(drafts[0]?.note?.includes('下一步：发送合作方案'))
})

test('本机路径候选包含 Codex Skill 和常见克隆位置', () => {
  const homes = hubHomeCandidates('/Users/me', { CODEX_HOME: '~/.codex', WECHAT_HUB_HOME: '~/code/hub' })
  assert.ok(homes.includes('/Users/me/code/hub'))
  assert.ok(homes.includes('/Users/me/.codex/share/wechat-intelligence-hub/projects/wechat-intelligence-hub'))
  assert.ok(homes.includes('/Users/me/Documents/wechat-intelligence-hub'))
})

test('Codex share 安装布局能从 hub.sh 反推引擎目录', () => {
  const files = new Set([
    '/Users/me/.codex/skills/wechat-intelligence-hub/scripts/hub.sh',
    '/Users/me/.codex/share/wechat-intelligence-hub/projects/wechat-intelligence-hub/wechat_intelligence_hub.py',
  ])
  const launch = resolveHubLaunch(
    { hubHome: '', heartbeatHours: 24, notify: true, todoFollowUp: true },
    '/Users/me',
    { CODEX_HOME: '~/.codex' },
    (path) => files.has(path),
  )
  assert.equal(launch.kind, 'script')
  assert.equal(launch.hubHome, '/Users/me/.codex/share/wechat-intelligence-hub/projects/wechat-intelligence-hub')
})

test('优先用已安装的 hub.sh，否则退到 python 引擎', () => {
  const files = new Set([
    '/Users/me/.codex/skills/wechat-intelligence-hub/scripts/hub.sh',
    '/Users/me/wechat-intelligence-hub/wechat_intelligence_hub.py',
  ])
  const exists = (path: string) => files.has(path)
  const scripted = resolveHubLaunch({ hubHome: '', heartbeatHours: 24, notify: true, todoFollowUp: true }, '/Users/me', {}, exists)
  assert.equal(scripted.kind, 'script')
  assert.equal(scripted.hubHome, '/Users/me/wechat-intelligence-hub')

  const pythonOnly = resolveHubLaunch(
    { hubHome: '~/hub', heartbeatHours: 0, notify: false, todoFollowUp: false },
    '/Users/me',
    {},
    (path) => path === '/Users/me/hub/wechat_intelligence_hub.py',
  )
  assert.equal(pythonOnly.kind, 'python')
  assert.equal(pythonOnly.command, 'python3')
  assert.equal(pythonOnly.hubHome, '/Users/me/hub')

  const missing = resolveHubLaunch(
    { hubHome: '', heartbeatHours: 24, notify: true, todoFollowUp: true },
    '/Users/me',
    {},
    () => false,
  )
  assert.equal(missing.kind, 'missing')
})

test('覆盖状态：缺引擎 / 仅引擎 / 有索引 / Reader 齐全', () => {
  assert.match(coverageSummary('missing', false, false), /安装/)
  assert.match(coverageSummary('engine', false, false), /radar\.db/)
  assert.match(coverageSummary('index', true, false), /聊天不会离开/)
  assert.match(coverageSummary('ready', true, true), /不发微信/)
  const ready = coverageFromLaunch({
    launch: {
      kind: 'script',
      command: '/hub.sh',
      argsPrefix: [],
      hubHome: '/hub',
      hubScript: '/hub.sh',
    },
    readerBin: '/bin/rion-wechat-cli',
    radarDb: true,
    radarDbPath: '/Users/me/.wechat-intelligence-hub/radar.db',
    dbStatus: '消息：12 条',
  })
  assert.equal(ready.access, 'ready')
})

test('db-status 抽出消息和商机数量', () => {
  const parsed = parseDbStatus('数据库：~/.wechat-intelligence-hub/radar.db\n消息：79 条\n商机：6 个（开放 2 个）\n')
  assert.equal(parsed.messages, 79)
  assert.equal(parsed.opportunities, 6)
  assert.equal(parsed.open, 2)
})

test('错误信息里的家目录要打码', () => {
  assert.equal(redactHome('失败：/Users/me/.codex/skills/hub.sh', '/Users/me'), '失败：~/.codex/skills/hub.sh')
})

test('设置归一化和分流枚举', () => {
  assert.equal(normalizeWechatSettings({ heartbeatHours: 12, notify: false }).heartbeatHours, 12)
  assert.equal(normalizeWechatSettings({ heartbeatHours: 7 }).heartbeatHours, 24)
  assert.equal(isTriageDecision('pursue'), true)
  assert.equal(isTriageDecision('send'), false)
  assert.match(lookupHint('reply'), /不会替你发出去/)
})

test('Reader 可从环境变量覆盖', () => {
  const bin = resolveReaderBin('/Users/me', { RION_WECHAT_CLI_BIN: '~/bin/rion-wechat-cli' }, (path) => path === '/Users/me/bin/rion-wechat-cli')
  assert.equal(bin, '/Users/me/bin/rion-wechat-cli')
})
