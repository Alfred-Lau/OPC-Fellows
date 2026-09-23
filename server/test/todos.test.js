import assert from 'node:assert/strict'
import { test } from 'node:test'
import { postJson, startTestServer } from './helpers.js'

test('POST /v1/todos 带正确 token -> 200 且 GET 能读回', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const created = await postJson(server, '/v1/todos', { text: '给 server/ 写 README' })

  assert.equal(created.status, 200)
  assert.equal(created.body.ok, true)
  assert.equal(created.body.item.text, '给 server/ 写 README')
  assert.equal(created.body.item.status, 'open')
  assert.equal(created.body.item.done, false)
  // 没带 device_id 时用占位值，保证每行都有来源标记。
  assert.equal(created.body.item.device_id, 'unspecified')

  const listed = await server.authorized('/v1/todos')
  assert.equal(listed.status, 200)
  assert.equal(listed.body.items.length, 1)
  assert.equal(listed.body.items[0].id, created.body.item.id)
})

test('POST /v1/todos 记录 device_id', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const created = await postJson(server, '/v1/todos', { text: '来自笔记本', device_id: 'macbook-pro' })

  assert.equal(created.status, 200)
  assert.equal(created.body.item.device_id, 'macbook-pro')

  const filtered = await server.authorized('/v1/todos?device_id=macbook-pro')
  assert.equal(filtered.body.items.length, 1)

  const other = await server.authorized('/v1/todos?device_id=other-device')
  assert.equal(other.body.items.length, 0)
})

test('GET /v1/todos 里 limit 生效', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  for (const text of ['第一条', '第二条', '第三条']) {
    await postJson(server, '/v1/todos', { text })
  }

  const res = await server.authorized('/v1/todos?limit=2')

  assert.equal(res.status, 200)
  assert.equal(res.body.items.length, 2)
  // 最新的在最前。
  assert.equal(res.body.items[0].text, '第三条')
})

test('POST /v1/todos 接受中文并原样返回', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const text = '中文待办：把 token 换成 openssl rand -hex 32 ✅'
  const created = await postJson(server, '/v1/todos', { text })

  assert.equal(created.status, 200)
  assert.equal(created.body.item.text, text)
})
