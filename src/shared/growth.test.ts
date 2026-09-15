import assert from 'node:assert/strict'
import test from 'node:test'
import {
  channelStatusLabel,
  emptyGrowth,
  formatDiagnose,
  planChannel,
  planLoop,
  planOpenExperiment,
  planShip,
  planVerdict,
  type GrowthExperiment,
  type GrowthState,
} from './growth.ts'

function experiment(partial: Partial<GrowthExperiment> & Pick<GrowthExperiment, 'id' | 'title'>): GrowthExperiment {
  return {
    hypothesis: '改按钮能提高注册',
    metric: '注册数',
    stage: 'activation',
    status: 'running',
    ideaId: '',
    loopId: '',
    channelId: '',
    ammoNote: '',
    note: '',
    createdAt: '2026-09-14T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
    ...partial,
  }
}

function state(partial: Partial<GrowthState> = {}): GrowthState {
  return {
    ...emptyGrowth(),
    ...partial,
  }
}

test('空台诊断不假装有流量或账本', () => {
  const reply = formatDiagnose(emptyGrowth()).text
  assert.match(reply, /还是空的/)
  assert.match(reply, /项目监控官/)
  assert.match(reply, /财务顾问/)
  assert.doesNotMatch(reply, /已刷新|MRR/)
})

test('诊断漏斗点出缺层，并可点名最该盯的实验', () => {
  const current = state({
    experiments: [
      experiment({ id: 'a', title: '改 CTA', stage: 'activation', status: 'running' }),
      experiment({ id: 'b', title: 'GEO 长尾', stage: 'acquisition', status: 'draft' }),
    ],
    channels: [
      {
        id: 'c1',
        name: '小红书',
        status: 'testing',
        stage: 'acquisition',
        score: 3,
        productId: '',
        note: '',
        createdAt: '2026-09-14T00:00:00.000Z',
        updatedAt: '2026-09-14T00:00:00.000Z',
      },
    ],
  })
  const listed = formatDiagnose(current, '诊断漏斗')
  assert.match(listed.text, /诊断漏斗/)
  assert.match(listed.text, /还没有覆盖/)
  assert.match(listed.text, /留存/)
  assert.equal(listed.listing?.kind, 'experiment')
  assert.deepEqual(listed.listing?.ids, ['a', 'b'])
  const named = formatDiagnose(current, '最该盯哪条')
  assert.match(named.text, /改 CTA/)
})

test('开实验要假设；有 Idea 指针不抄正文', () => {
  const empty = planOpenExperiment('开实验', emptyGrowth())
  assert.equal(empty.input, undefined)
  assert.match(empty.reply, /要假设/)
  const opened = planOpenExperiment(
    '开实验 官网 CTA。假设：首屏改按钮能提高注册。指标：注册数 层：激活',
    emptyGrowth(),
    ['idea-1'],
  )
  assert.equal(opened.input?.title, '官网 CTA')
  assert.match(opened.input?.hypothesis ?? '', /首屏改按钮/)
  assert.equal(opened.input?.stage, 'activation')
  assert.equal(opened.input?.ideaId, 'idea-1')
  assert.match(opened.reply, /Idea 指针/)
})

test('同名实验更新而不是复制第二份', () => {
  const current = state({
    experiments: [experiment({ id: 'a', title: '官网 CTA', status: 'running' })],
  })
  const again = planOpenExperiment('开实验 官网 CTA。假设：再改一次文案。', current)
  assert.equal(again.input?.id, 'a')
  assert.match(again.reply, /已更新/)
})

test('判实验要对象；已关闭不得复活', () => {
  const running = [experiment({ id: 'a', title: '改 CTA' }), experiment({ id: 'b', title: 'GEO 长尾' })]
  assert.match(planVerdict('判实验', running).reply, /第一条/)
  const hit = planVerdict('判实验 第一条 赢了', running)
  assert.equal(hit.id, 'a')
  assert.equal(hit.status, 'won')
  const closed = planVerdict('判实验 第一条 输了', [experiment({ id: 'a', title: '改 CTA', status: 'won' })])
  assert.equal(closed.id, undefined)
  assert.match(closed.reply, /不得擅自复活/)
})

test('画增长环按类型更新同一份', () => {
  const first = planLoop('画增长环 内容环：发帖 → GEO → 注册', [])
  assert.equal(first.input?.kind, 'content')
  assert.match(first.input?.steps ?? '', /GEO/)
  const second = planLoop('画增长环 内容环：发帖 → 搜索 → 回访', [
    {
      id: 'l1',
      title: '内容环',
      kind: 'content',
      steps: '旧步骤',
      productId: '',
      note: '',
      createdAt: '2026-09-14T00:00:00.000Z',
      updatedAt: '2026-09-14T00:00:00.000Z',
    },
  ])
  assert.equal(second.input?.id, 'l1')
  assert.match(second.reply, /已更新/)
})

test('排渠道记下处置和分数，不是账号', () => {
  const created = planChannel('排渠道 小红书 扩量 4分', [])
  assert.equal(created.input?.name, '小红书')
  assert.equal(created.input?.status, 'scaling')
  assert.equal(created.input?.score, 4)
  assert.match(created.reply, /不是账号/)
  const listed = planChannel('排渠道', [
    {
      id: 'c1',
      name: '小红书',
      status: 'scaling',
      stage: 'acquisition',
      score: 4,
      productId: '',
      note: '',
      createdAt: '2026-09-14T00:00:00.000Z',
      updatedAt: '2026-09-14T00:00:00.000Z',
    },
  ])
  assert.equal(listed.input, undefined)
  assert.match(listed.reply, /小红书/)
  assert.equal(channelStatusLabel('scaling'), '扩量')
})

test('交接弹药只传指针，未赢或已交都停', () => {
  const noAmmo = planShip('交接弹药', [experiment({ id: 'a', title: '改 CTA', status: 'won' })], false)
  assert.match(noAmmo.reply, /弹药手还没启用/)
  const running = planShip('交接弹药', [experiment({ id: 'a', title: '改 CTA', status: 'running' })], true)
  assert.match(running.reply, /只有赢了/)
  const won = planShip('交接弹药', [experiment({ id: 'a', title: '改 CTA', status: 'won' })], true)
  assert.equal(won.id, 'a')
  assert.match(won.reply, /指针交给弹药手/)
  const again = planShip(
    '交接弹药',
    [experiment({ id: 'a', title: '改 CTA', status: 'won', ammoNote: 'ammo:a' })],
    true,
  )
  assert.equal(again.id, undefined)
  assert.match(again.reply, /已经交给/)
})
