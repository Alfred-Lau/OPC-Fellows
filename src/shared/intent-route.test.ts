import assert from 'node:assert/strict'
import test from 'node:test'
import {
  allocateIntentSystemPrompt,
  classifyOccupationIntent,
  formatSkillContract,
  isIdentityAsk,
  isInboxQuestion,
  isInboxSkillTrigger,
  isOccupationAsk,
  isSkillFastPath,
  isSkillMissText,
  parseAllocateIntent,
  parseReadIntent,
  readIntentSystemPrompt,
  shouldClassifyRead,
  type RouteSkill,
} from './intent-route.ts'

const monitor: RouteSkill[] = [
  { id: 'refresh', title: '刷新态势', hint: '采集', phrase: '刷新态势', effect: 'write', match: /刷新态势|刷新/ },
  { id: 'traffic', title: '解读流量', hint: '掉量', phrase: '解读流量', effect: 'read', match: /流量|掉量/ },
  { id: 'health', title: '项目健康', hint: '未提交', phrase: '项目健康', effect: 'read', match: /项目健康|还健康/ },
]

test('问句对不上 Trigger 时落到第一条读 Skill，不回 miss', () => {
  const asked = classifyOccupationIntent(monitor, '这几个项目如何')
  assert.equal(asked.kind, 'invoke')
  if (asked.kind === 'invoke') {
    assert.equal(asked.skillId, 'traffic')
  }
  const traffic = classifyOccupationIntent(monitor, '我这几个项目流量如何？')
  assert.equal(traffic.kind, 'invoke')
  if (traffic.kind === 'invoke') {
    assert.equal(traffic.skillId, 'traffic')
  }
  const refresh = classifyOccupationIntent(monitor, '刷新态势')
  assert.equal(refresh.kind, 'invoke')
  if (refresh.kind === 'invoke') {
    assert.equal(refresh.skillId, 'refresh')
  }
  assert.equal(classifyOccupationIntent(monitor, '随便聊聊').kind, 'miss')
})

test('闲聊不上模型；口语问句才分类', () => {
  assert.equal(isOccupationAsk('这几个项目如何'), true)
  assert.equal(isOccupationAsk('随便聊聊'), false)
  assert.equal(shouldClassifyRead('随便聊聊'), false)
  assert.equal(shouldClassifyRead('帮忙看下线上'), true)
})

test('问身份和模型不上分类，也不当业务问句', () => {
  assert.equal(isIdentityAsk('你是什么模型'), true)
  assert.equal(isIdentityAsk('你是谁'), true)
  assert.equal(isIdentityAsk('你会什么'), true)
  assert.equal(isIdentityAsk('你有什么能力'), true)
  assert.equal(isIdentityAsk('上次转稿成功了吗'), false)
  assert.equal(isIdentityAsk('封面是什么'), false)
  assert.equal(isOccupationAsk('你是什么模型'), false)
  assert.equal(shouldClassifyRead('你是什么模型'), false)
  assert.equal(classifyOccupationIntent(monitor, '你是什么模型').kind, 'miss')
})

test('模型只能点名读 Skill，写 Skill 当 miss', () => {
  assert.equal(parseReadIntent('{"skillId":"traffic"}', monitor), 'traffic')
  assert.equal(parseReadIntent('```json\n{"skillId":"health"}\n```', monitor), 'health')
  assert.equal(parseReadIntent('{"skillId":"refresh"}', monitor), undefined)
  assert.equal(parseReadIntent('{"skillId":null}', monitor), undefined)
  assert.equal(parseReadIntent('不是 json', monitor), undefined)
  assert.match(readIntentSystemPrompt('项目监控官', monitor), /traffic/)
  assert.match(readIntentSystemPrompt('项目监控官', monitor), /分配/)
})

test('分配模型可以点读、点写、开口或 miss', () => {
  assert.deepEqual(parseAllocateIntent('{"action":"invoke","skillId":"traffic"}', monitor), {
    kind: 'invoke',
    skillId: 'traffic',
  })
  assert.deepEqual(parseAllocateIntent('{"action":"invoke","skillId":"refresh"}', monitor), {
    kind: 'invoke',
    skillId: 'refresh',
  })
  assert.deepEqual(parseAllocateIntent('{"action":"chat"}', monitor), { kind: 'chat' })
  assert.deepEqual(parseAllocateIntent('{"action":"miss"}', monitor), { kind: 'miss' })
  assert.deepEqual(parseAllocateIntent('{"action":"note"}', monitor), { kind: 'miss' })
  assert.deepEqual(parseAllocateIntent('{"skillId":"health"}', monitor), { kind: 'invoke', skillId: 'health' })
  assert.deepEqual(parseAllocateIntent('{"skillId":null}', monitor), { kind: 'miss' })
  assert.deepEqual(parseAllocateIntent('不是 json', monitor), { kind: 'miss' })
  assert.match(allocateIntentSystemPrompt('项目监控官', monitor), /分配/)
  assert.match(allocateIntentSystemPrompt('项目监控官', monitor), /chat/)
  assert.match(allocateIntentSystemPrompt('项目监控官', monitor), /refresh/)
  const notes: RouteSkill[] = [
    { id: 'note', title: '记下', hint: '听到就写', phrase: '', effect: 'write', match: /记下/ },
    { id: 'find', title: '找回', hint: '找一句', phrase: '找回', effect: 'read', match: /找回/ },
  ]
  assert.deepEqual(parseAllocateIntent('{"action":"note"}', notes), { kind: 'note' })
  assert.match(allocateIntentSystemPrompt('随手记', notes), /"note"/)
})

test('旧菜单和新引导都能认成 miss 文案', () => {
  assert.equal(isSkillMissText('先点一条，或再说具体一点。'), true)
  assert.equal(isSkillMissText('对不上「项目监控官」的 Skill。可以说：'), true)
  assert.equal(isSkillMissText('我是「选品策略师」，刚才这句还对不上要执行哪一条。'), true)
  assert.equal(isSkillMissText('仓库健康：未提交都没有。'), false)
})

test('有 key 时只有零歧义写口令走快路径', () => {
  const refresh = monitor[0]
  const traffic = monitor[1]
  assert.ok(refresh)
  assert.ok(traffic)
  assert.equal(isSkillFastPath(refresh, '刷新态势'), true)
  assert.equal(isSkillFastPath({ ...refresh, fast: /刷新监控/ }, '刷新监控'), true)
  assert.equal(isSkillFastPath(refresh, '这个月流量如何'), false)
  assert.equal(isSkillFastPath(traffic, '解读流量'), false)
  assert.equal(isSkillFastPath(traffic, '这个月流量如何'), false)
  const contract = formatSkillContract({
    ...traffic,
    requires: '已有态势快照',
    artifact: '流量解读',
    missing: '要先刷新态势',
  })
  assert.match(contract, /前置：已有态势快照/)
  assert.match(contract, /缺数据：要先刷新态势/)
})

test('今日 Trigger 只用口令原句，问句不当待办', () => {
  const refresh = monitor[0]
  const traffic = monitor[1]
  assert.ok(refresh)
  assert.ok(traffic)
  assert.equal(isInboxSkillTrigger(refresh, '刷新态势'), true)
  assert.equal(isInboxSkillTrigger(traffic, '解读流量'), true)
  assert.equal(isInboxSkillTrigger(traffic, '这个月流量如何'), false)
  assert.equal(isInboxQuestion('这个月流量如何'), true)
  assert.equal(isInboxQuestion('今天的产品 idea 是什么'), true)
  assert.equal(isInboxQuestion('明天下午交周报'), false)
  assert.equal(isInboxQuestion('提醒我看看仓库'), false)
})
