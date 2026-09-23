import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import { silentLogger } from '../src/log.js'
import { createMemoryStore } from '../src/store.js'
import { postJson, startTestServer, testConfig, TEST_TOKEN } from './helpers.js'

test('空 body -> 400 且 code=invalid_body', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await postJson(server, '/v1/todos', undefined, { raw: '' })

  assert.equal(res.status, 400)
  assert.equal(res.body.ok, false)
  assert.equal(res.body.code, 'invalid_body')
})

test('空 JSON 对象 -> 400 invalid_body', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await postJson(server, '/v1/todos', {})

  assert.equal(res.status, 400)
  assert.equal(res.body.code, 'invalid_body')
})

test('字段类型错 -> 400 invalid_body', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await postJson(server, '/v1/todos', { text: 123 })

  assert.equal(res.status, 400)
  assert.equal(res.body.code, 'invalid_body')
})

test('空白字符串 -> 400 invalid_body', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await postJson(server, '/v1/todos', { text: '   ' })

  assert.equal(res.status, 400)
  assert.equal(res.body.code, 'invalid_body')
})

test('刻意构造的原始 JSON（数组 / 非法 JSON）-> 400 invalid_body', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const asArray = await postJson(server, '/v1/todos', undefined, { raw: '[]' })
  assert.equal(asArray.status, 400)
  assert.equal(asArray.body.code, 'invalid_body')

  const broken = await postJson(server, '/v1/todos', undefined, { raw: '{"text":' })
  assert.equal(broken.status, 400)
  assert.equal(broken.body.code, 'invalid_body')
})

test('4xx 错误体不含堆栈 / 内部路径', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await postJson(server, '/v1/todos', {})
  const serialized = JSON.stringify(res.body)

  assert.ok(!serialized.includes('at '), '错误体不应包含堆栈')
  assert.ok(!serialized.includes('.js:'), '错误体不应包含源码路径')
  assert.equal(res.body.code, 'invalid_body')
})

test('未知路由 -> 404 not_found', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await server.authorized('/v1/nope')

  assert.equal(res.status, 404)
  assert.equal(res.body.code, 'not_found')
})

test('已知路径用错方法 -> 405 method_not_allowed', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await server.authorized('/v1/todos', { method: 'DELETE' })

  assert.equal(res.status, 405)
  assert.equal(res.body.code, 'method_not_allowed')
})

test('超过请求体上限 -> 413 body_too_large', async (t) => {
  const server = await startTestServer({ MAX_BODY_BYTES: '400' })
  t.after(() => server.close())

  const res = await postJson(server, '/v1/todos', { text: 'x'.repeat(1000) })

  assert.equal(res.status, 413)
  assert.equal(res.body.code, 'body_too_large')
})

test('limit 非法 -> 400 invalid_query', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const tooBig = await server.authorized('/v1/todos?limit=9999')
  assert.equal(tooBig.status, 400)
  assert.equal(tooBig.body.code, 'invalid_query')

  const notANumber = await server.authorized('/v1/notes?limit=abc')
  assert.equal(notANumber.status, 400)
  assert.equal(notANumber.body.code, 'invalid_query')
})

test('存储层抛错 -> 500 internal，且不外泄内部消息', async (t) => {
  const config = testConfig()
  const leakyStore = {
    ...createMemoryStore(),
    async listTodos() {
      throw new Error('relation "todos" does not exist at /app/src/pg-store.js:42')
    },
  }
  const app = createApp({ store: leakyStore, token: TEST_TOKEN, config, logger: silentLogger })
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => app.close(resolve)))
  const baseUrl = `http://127.0.0.1:${app.address().port}`

  const response = await fetch(`${baseUrl}/v1/todos`, {
    headers: { Authorization: `Bearer ${TEST_TOKEN}` },
  })
  const body = await response.json()

  assert.equal(response.status, 500)
  assert.equal(body.code, 'internal')
  assert.equal(body.error, 'internal error')
  assert.ok(!JSON.stringify(body).includes('pg-store.js'), '内部错误细节不得回显给客户端')
  assert.ok(!JSON.stringify(body).includes('relation'), 'SQL 细节不得回显给客户端')
})
