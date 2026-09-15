import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  applyAgentSortOrder,
  idsAtPlaceholder,
  insertBeforeIdFromY,
  listedAgentRailIds,
  listPinnedProjects,
  listUnpinnedProjects,
  mergeProjectRailIds,
  moveRailIds,
} from './rail-chrome.ts'
import type { ThreadRecord } from './agent.ts'

const rendererSrc = join(dirname(fileURLToPath(import.meta.url)), '../../renderer/src')

function project(partial: Partial<ThreadRecord> & Pick<ThreadRecord, 'id' | 'title'>): ThreadRecord {
  return {
    kind: 'user',
    agentIds: ['rumi'],
    createdAt: '2026-09-12T10:00:00.000Z',
    updatedAt: '2026-09-13T10:00:00.000Z',
    ...partial,
  }
}

test('置顶是独立列表，钉住的项目不再出现在项目列表', () => {
  const pinned = project({
    id: 'thread:user:pin',
    title: '钉住',
    pinnedAt: '2026-09-13T08:00:00.000Z',
    sortOrder: 0,
  })
  const loose = project({ id: 'thread:user:loose', title: '未钉', sortOrder: 1 })
  const threads = [loose, pinned]
  assert.deepEqual(
    listPinnedProjects(threads).map((item) => item.id),
    [pinned.id],
  )
  assert.deepEqual(
    listUnpinnedProjects(threads).map((item) => item.id),
    [loose.id],
  )
})

test('左栏 HTML 有和项目、成员同级的置顶列表', () => {
  const html = readFileSync(join(rendererSrc, '../index.html'), 'utf8')
  assert.match(html, /id="pin-nav"/)
  assert.match(html, /aria-label="置顶"/)
  const pinAt = html.indexOf('id="pin-nav"')
  const projectAt = html.indexOf('id="thread-nav"')
  const agentAt = html.indexOf('id="agent-nav"')
  assert.ok(pinAt > 0 && pinAt < projectAt && projectAt < agentAt)
})

test('成员拖到另一人上方后绘制顺序立刻跟着变', () => {
  const agents = [
    { id: 'rumi', sortOrder: 0 },
    { id: 'mina', sortOrder: 1 },
    { id: 'nari', sortOrder: 2 },
  ]
  const ids = moveRailIds(
    agents.map((agent) => agent.id),
    'nari',
    'rumi',
    true,
  )
  assert.deepEqual(ids, ['nari', 'rumi', 'mina'])
  const next = applyAgentSortOrder(agents, ids)
  assert.deepEqual(listedAgentRailIds(next), ['nari', 'rumi', 'mina'])
})

test('能力已停用的成员不进左栏名单，主理人有默认徽章', () => {
  assert.deepEqual(
    listedAgentRailIds([
      { id: 'host', sortOrder: 0, status: 'ready' },
      { id: 'ammo', sortOrder: 1, status: 'needs-module' },
      { id: 'monitor', sortOrder: 2, status: 'ready' },
    ]),
    ['host', 'monitor'],
  )
  const studioCss = readFileSync(join(rendererSrc, 'studio.css'), 'utf8')
  const studioTs = readFileSync(join(rendererSrc, 'studio.ts'), 'utf8')
  const html = readFileSync(join(rendererSrc, '../index.html'), 'utf8')
  const fixture = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../scripts/host-badge-fixture.html'), 'utf8')
  assert.match(studioCss, /\.host-badge/)
  assert.match(studioCss, /#agent-nav button\.is-host/)
  assert.match(studioCss, /\.mention-chip\.is-host/)
  assert.match(studioTs, /hostBadgeEl/)
  assert.match(studioTs, /classList.toggle\('is-host'/)
  assert.match(html, /对应成员会从名单里拿掉/)
  assert.match(fixture, /class="is-host"/)
  assert.match(fixture, />默认</)
  assert.equal(fixture.includes('能力已停用'), false)
})

test('拖动按指针落点在目标行中线前插入，过中线则排到后面', () => {
  const items = [
    { id: 'a', top: 0, height: 40 },
    { id: 'b', top: 40, height: 40 },
    { id: 'c', top: 80, height: 40 },
  ]
  assert.equal(insertBeforeIdFromY(items, 10), 'a')
  assert.equal(insertBeforeIdFromY(items, 61), 'c')
  assert.equal(insertBeforeIdFromY(items, 130), undefined)
  assert.deepEqual(idsAtPlaceholder(['a', 'placeholder', 'c'], 'b'), ['a', 'b', 'c'])
  assert.deepEqual(mergeProjectRailIds(['pin'], ['loose']), ['pin', 'loose'])
})

test('侧栏本身不是窗口拖拽区，避免拖成员时被系统吃掉指针', () => {
  const appCss = readFileSync(join(rendererSrc, 'app.css'), 'utf8')
  const studioCss = readFileSync(join(rendererSrc, 'studio.css'), 'utf8')
  const appRail = appCss.match(/\.rail\s*\{[^}]+\}/)?.[0] ?? ''
  const studioRail = studioCss.match(/\.rail\s*\{[^}]+\}/)?.[0] ?? ''
  assert.match(appRail, /-webkit-app-region:\s*no-drag/, 'app.css 后加载，.rail 必须是 no-drag')
  assert.doesNotMatch(studioRail, /-webkit-app-region:\s*drag/)
})

test('工作窗标题贴顶更紧，不显示成员数字', () => {
  const studioCss = readFileSync(join(rendererSrc, 'studio.css'), 'utf8')
  const html = readFileSync(join(rendererSrc, '../index.html'), 'utf8')
  const studioTs = readFileSync(join(rendererSrc, 'studio.ts'), 'utf8')
  assert.match(studioCss, /\.thread-head\s*\{[^}]*padding:\s*20px 28px 10px/)
  assert.equal(html.includes('thread-count'), false)
  assert.equal(studioTs.includes('#thread-count'), false)
})

test('成员列表超长可滚、不露滚动条', () => {
  const studioCss = readFileSync(join(rendererSrc, 'studio.css'), 'utf8')
  assert.match(studioCss, /\.rail-block\[data-rail-list='agent'\]\s*\{[^}]*flex:\s*1/)
  assert.match(studioCss, /#agent-nav\s*\{[^}]*overflow-y:\s*auto/)
  assert.match(studioCss, /#agent-nav\s*\{[^}]*scrollbar-width:\s*none/)
  assert.match(studioCss, /#agent-nav::-webkit-scrollbar\s*\{[^}]*display:\s*none/)
})

test('项目左栏叠头像，标题旁头像可点进 @', () => {
  const studioCss = readFileSync(join(rendererSrc, 'studio.css'), 'utf8')
  assert.match(studioCss, /\.rail-face/)
  assert.match(studioCss, /\.thread-face \.agent-avatar\.is-mentionable/)
})

test('思考过程用独立样式，默认收起', () => {
  const studioCss = readFileSync(join(rendererSrc, 'studio.css'), 'utf8')
  const studioTs = readFileSync(join(rendererSrc, 'studio.ts'), 'utf8')
  assert.match(studioCss, /\.thread-think\s*\{/)
  assert.match(studioCss, /\.thread-think-body\s*\{/)
  assert.match(studioTs, /className = 'thread-think'/)
  assert.match(studioTs, /思考过程/)
  assert.match(studioTs, /createElement\('details'\)/)
  assert.equal(studioTs.includes("details.open = true"), false)
  assert.equal(studioTs.includes("setAttribute('open'"), false)
})
