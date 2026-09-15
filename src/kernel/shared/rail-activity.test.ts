import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  agentRailActivity,
  describeRailActivity,
  isRailBusy,
  projectRailActivity,
  removeRailMark,
  strongestRailActivity,
  upsertRailMark,
  type RailActivityKind,
  type RailActivityMark,
} from './rail-activity.ts'

const rendererSrc = join(dirname(fileURLToPath(import.meta.url)), '../../renderer/src')

function mark(
  partial: Pick<RailActivityMark, 'agentId' | 'threadId'> & Partial<RailActivityMark>,
): RailActivityMark {
  return { kind: 'working', ...partial }
}

test('成员行只看自己的工作标记', () => {
  const marks = [
    mark({ agentId: 'rumi', threadId: 'thread:user:a', kind: 'thinking' }),
    mark({ agentId: 'mina', threadId: 'thread:user:a', kind: 'working' }),
  ]
  assert.equal(agentRailActivity('rumi', marks), 'thinking')
  assert.equal(agentRailActivity('mina', marks), 'working')
  assert.equal(agentRailActivity('nari', marks), 'idle')
})

test('项目行只点亮正在该项目里干活的人，主对话不算', () => {
  const project = { id: 'thread:user:opc', agentIds: ['rumi', 'mina'] }
  const marks = [
    mark({ agentId: 'rumi', threadId: 'thread:agent:rumi', kind: 'working' }),
    mark({ agentId: 'mina', threadId: 'thread:user:opc', kind: 'thinking' }),
  ]
  assert.equal(projectRailActivity(project, marks), 'thinking')
  assert.equal(agentRailActivity('rumi', marks), 'working')
})

test('同一项目里执行压过思考，思考压过出错', () => {
  assert.equal(strongestRailActivity(['error', 'thinking', 'working']), 'working')
  assert.equal(strongestRailActivity(['idle', 'error']), 'error')
  assert.equal(strongestRailActivity([]), 'idle')
})

test('工作标记按成员覆盖，忙完就清掉', () => {
  const first = upsertRailMark([], mark({ agentId: 'rumi', threadId: 't1', kind: 'thinking' }))
  const next = upsertRailMark(first, mark({ agentId: 'rumi', threadId: 't1', kind: 'working' }))
  assert.deepEqual(
    next.map((item) => item.kind),
    ['working'],
  )
  assert.equal(isRailBusy(next), true)
  assert.equal(isRailBusy(removeRailMark(next, 'rumi')), false)
  assert.equal(isRailBusy([mark({ agentId: 'rumi', threadId: 't1', kind: 'error' })]), false)
})

test('工作态文案覆盖全部种类', () => {
  const kinds: RailActivityKind[] = ['idle', 'thinking', 'working', 'error']
  assert.deepEqual(
    kinds.map((kind) => describeRailActivity(kind)),
    ['', '正在想', '正在做', '没接上'],
  )
})

test('左栏有思考旋转环、执行转圈和出错点', () => {
  const studioCss = readFileSync(join(rendererSrc, 'studio.css'), 'utf8')
  const studioTs = readFileSync(join(rendererSrc, 'studio.ts'), 'utf8')
  assert.match(studioCss, /@keyframes rail-spin/)
  assert.match(studioCss, /\.rail-activity-ring/)
  assert.match(studioCss, /\.rail-activity-dots/)
  assert.match(studioCss, /\[data-activity='working'\]/)
  assert.match(studioCss, /\[data-activity='thinking'\]/)
  assert.match(studioCss, /\[data-activity='error'\]/)
  assert.match(studioCss, /prefers-reduced-motion/)
  assert.match(studioCss, /body\[data-rail='collapsed'\] \.rail-item-meta/)
  assert.match(studioTs, /withAgentWork/)
  assert.match(studioTs, /wrapRailAvatar/)
  assert.match(studioTs, /dataset.activity/)
})
