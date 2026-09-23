import assert from 'node:assert/strict'
import { test } from 'node:test'
import { postJson, startTestServer } from './helpers.js'

test('POST /v1/notes 带正确 token -> 200 且 GET 能读回中文', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const title = '部署笔记（中文标题）'
  const body = '第一步：openssl rand -hex 32 生成 token。\n第二步：docker compose up -d --build。'

  const created = await postJson(server, '/v1/notes', { title, body })

  assert.equal(created.status, 200)
  assert.equal(created.body.ok, true)
  assert.equal(created.body.item.title, title)
  assert.equal(created.body.item.body, body)
  assert.equal(created.body.item.device_id, 'unspecified')

  const listed = await server.authorized('/v1/notes')

  assert.equal(listed.status, 200)
  assert.equal(listed.body.items.length, 1)
  assert.equal(listed.body.items[0].id, created.body.item.id)
  assert.equal(listed.body.items[0].title, title)
  // 中文必须逐字节读回，不做任何转义/丢失。
  assert.equal(listed.body.items[0].body, body)
})

test('POST /v1/notes 的 title 可省略 -> null', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const created = await postJson(server, '/v1/notes', { body: '只有正文' })

  assert.equal(created.status, 200)
  assert.equal(created.body.item.title, null)
  assert.equal(created.body.item.body, '只有正文')
})

test('POST /v1/notes 记录 device_id 且可按设备过滤', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  await postJson(server, '/v1/notes', { body: '来自手机', device_id: 'iphone' })
  await postJson(server, '/v1/notes', { body: '来自台式机', device_id: 'mac-mini' })

  const all = await server.authorized('/v1/notes')
  assert.equal(all.body.items.length, 2)

  const filtered = await server.authorized('/v1/notes?device_id=iphone')
  assert.equal(filtered.body.items.length, 1)
  assert.equal(filtered.body.items[0].body, '来自手机')
})

test('笔记与待办是两张独立的表', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  await postJson(server, '/v1/notes', { body: '一条笔记' })

  const todos = await server.authorized('/v1/todos')
  assert.equal(todos.body.items.length, 0)
})
