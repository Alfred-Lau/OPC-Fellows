import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startTestServer } from './helpers.js'

test('GET /health 免鉴权即返回 ok:true', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await server.request('/health')

  assert.equal(res.status, 200)
  assert.equal(res.body.ok, true)
  assert.equal(res.body.service, 'opc-fellows-server')
  assert.equal(typeof res.body.uptimeMs, 'number')
})

test('GET /health 即使带了错误 token 也返回 200（不校验凭证）', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await server.request('/health', {
    headers: { Authorization: 'Bearer totally-wrong-token-000000' },
  })

  assert.equal(res.status, 200)
  assert.equal(res.body.ok, true)
})

test('GET /health 不返回 token 或配置明文', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await server.request('/health')
  const serialized = JSON.stringify(res.body)

  assert.ok(!serialized.includes(server.token), '健康检查响应不得包含 SERVER_TOKEN 的值')
  assert.deepEqual(
    Object.keys(res.body).sort(),
    ['ok', 'service', 'time', 'uptimeMs'].sort(),
  )
})

test('POST /health 返回 405', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await server.authorized('/health', { method: 'POST' })

  assert.equal(res.status, 405)
  assert.equal(res.body.code, 'method_not_allowed')
})
