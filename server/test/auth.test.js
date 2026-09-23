import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startTestServer, TEST_TOKEN } from './helpers.js'

test('无 token 访问 /v1/todos -> 401', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await server.request('/v1/todos')

  assert.equal(res.status, 401)
  assert.equal(res.body.ok, false)
  assert.equal(res.body.code, 'unauthorized')
})

test('无 token 访问 /v1/notes -> 401', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await server.request('/v1/notes')

  assert.equal(res.status, 401)
  assert.equal(res.body.code, 'unauthorized')
})

test('错误 token -> 401', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await server.request('/v1/todos', {
    headers: { Authorization: 'Bearer wrong-token-0000000000000000' },
  })

  assert.equal(res.status, 401)
  assert.equal(res.body.code, 'unauthorized')
})

test('前缀相同的 token 不算通过（不是 startsWith 比较）', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await server.request('/v1/todos', {
    headers: { Authorization: `Bearer ${TEST_TOKEN}extra` },
  })

  assert.equal(res.status, 401)
})

test('Authorization 缺少 Bearer 前缀 -> 401', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await server.request('/v1/todos', { headers: { Authorization: TEST_TOKEN } })

  assert.equal(res.status, 401)
})

test('空 Bearer -> 401', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await server.request('/v1/todos', { headers: { Authorization: 'Bearer ' } })

  assert.equal(res.status, 401)
})

test('token 放在查询串里一律不认 -> 401', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await server.request(`/v1/todos?token=${TEST_TOKEN}`)

  assert.equal(res.status, 401)
})

test('正确 token -> 200', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await server.authorized('/v1/todos')

  assert.equal(res.status, 200)
  assert.equal(res.body.ok, true)
  assert.deepEqual(res.body.items, [])
})

test('Authorization 大小写不敏感（bearer 也可）', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await server.request('/v1/todos', {
    headers: { Authorization: `bearer ${TEST_TOKEN}` },
  })

  assert.equal(res.status, 200)
})
