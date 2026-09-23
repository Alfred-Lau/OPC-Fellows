import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ConfigError, loadConfig } from '../src/config.js'
import { startTestServer, TEST_TOKEN } from './helpers.js'

const BASE = { SERVER_TOKEN: TEST_TOKEN, STORE: 'memory' }

test('缺少 SERVER_TOKEN -> 拒绝启动', () => {
  assert.throws(() => loadConfig({ STORE: 'memory' }), ConfigError)
})

test('SERVER_TOKEN 太短 -> 拒绝启动', () => {
  assert.throws(() => loadConfig({ ...BASE, SERVER_TOKEN: 'short' }), ConfigError)
})

test('配置报错信息不回显 token 的值', () => {
  const secret = 'x'.repeat(4)
  try {
    loadConfig({ ...BASE, SERVER_TOKEN: secret })
    assert.fail('应当抛错')
  } catch (error) {
    assert.ok(error instanceof ConfigError)
    assert.ok(!error.message.includes(secret), '配置错误信息不得包含 token 值')
  }
})

test('STORE=postgres 必须给 DATABASE_URL', () => {
  assert.throws(() => loadConfig({ ...BASE, STORE: 'postgres' }), ConfigError)
  assert.doesNotThrow(() =>
    loadConfig({ ...BASE, STORE: 'postgres', DATABASE_URL: 'postgres://u:p@db:5432/d' }),
  )
})

test('STORE=memory 不需要 DATABASE_URL（本地试跑 / 测试）', () => {
  const config = loadConfig({ ...BASE })
  assert.equal(config.store, 'memory')
  assert.equal(config.databaseUrl, '')
})

test('CORS_ORIGIN 默认关闭，且拒绝通配符', () => {
  assert.equal(loadConfig({ ...BASE }).corsOrigin, '')
  assert.throws(() => loadConfig({ ...BASE, CORS_ORIGIN: '*' }), ConfigError)
  assert.throws(() => loadConfig({ ...BASE, CORS_ORIGIN: 'https://a.example' + ',*' }), ConfigError)
})

test('HOST 默认只监听 127.0.0.1', () => {
  assert.equal(loadConfig({ ...BASE }).host, '127.0.0.1')
})

test('非法整数与未知 STORE / LOG_LEVEL 都被拦下', () => {
  assert.throws(() => loadConfig({ ...BASE, PORT: 'abc' }), ConfigError)
  assert.throws(() => loadConfig({ ...BASE, MAX_BODY_BYTES: '12' }), ConfigError)
  assert.throws(() => loadConfig({ ...BASE, STORE: 'sqlite' }), ConfigError)
  assert.throws(() => loadConfig({ ...BASE, LOG_LEVEL: 'chatty' }), ConfigError)
})

// ---------------------------------------------------------------------------
// CORS 行为（默认关闭是安全默认值，所以要有测试盯着）

test('默认不返回任何 CORS 头', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await server.authorized('/v1/todos', {
    headers: { Authorization: `Bearer ${TEST_TOKEN}`, Origin: 'https://evil.example' },
  })

  assert.equal(res.status, 200)
  assert.equal(res.headers.get('access-control-allow-origin'), null)
})

test('默认关闭时 OPTIONS 预检 -> 405', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const res = await server.request('/v1/todos', {
    method: 'OPTIONS',
    headers: { Origin: 'https://app.example', 'Access-Control-Request-Method': 'GET' },
  })

  assert.equal(res.status, 405)
})

test('显式配置白名单后只回显白名单来源，且永不返回 *', async (t) => {
  const server = await startTestServer({ CORS_ORIGIN: 'https://app.example' })
  t.after(() => server.close())

  const allowed = await server.authorized('/v1/todos', {
    headers: { Authorization: `Bearer ${TEST_TOKEN}`, Origin: 'https://app.example' },
  })
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://app.example')
  assert.equal(allowed.headers.get('vary'), 'Origin')

  const denied = await server.authorized('/v1/todos', {
    headers: { Authorization: `Bearer ${TEST_TOKEN}`, Origin: 'https://evil.example' },
  })
  assert.equal(denied.headers.get('access-control-allow-origin'), null)

  const preflight = await server.request('/v1/todos', {
    method: 'OPTIONS',
    headers: { Origin: 'https://app.example', 'Access-Control-Request-Method': 'GET' },
  })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://app.example')
  assert.notEqual(preflight.headers.get('access-control-allow-origin'), '*')
})
