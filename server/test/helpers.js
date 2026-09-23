// 测试辅助。
//
// 关键设计：所有测试都通过 createApp({ store }) 注入 createMemoryStore()，
// 因此 node --test 完全不需要任何真实数据库、不需要网络、不需要 pg 依赖。
// 存储层就是那个「可替换的接缝」。

import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { silentLogger } from '../src/log.js'
import { createMemoryStore } from '../src/store.js'

// 27 字符，满足 config 的最小长度要求。
export const TEST_TOKEN = 'test-token-0123456789abcdef'

export function testConfig(overrides = {}) {
  return loadConfig({
    SERVER_TOKEN: TEST_TOKEN,
    STORE: 'memory',
    HOST: '127.0.0.1',
    ...overrides,
  })
}

export async function startTestServer(overrides = {}) {
  const config = testConfig(overrides)
  const store = createMemoryStore()
  // logger 用 silent：不打日志，避免污染 node --test 的输出。
  const app = createApp({ store, token: config.token, config, logger: silentLogger })

  await new Promise((resolve, reject) => {
    app.once('error', reject)
    app.listen(0, '127.0.0.1', resolve)
  })

  const { port } = app.address()
  const baseUrl = `http://127.0.0.1:${port}`

  return {
    baseUrl,
    token: config.token,
    config,
    store,
    request: (path, init) => request(baseUrl, path, init),
    authorized: (path, init = {}) => request(baseUrl, path, withAuth(init)),
    close: () => new Promise((resolve) => app.close(resolve)),
  }
}

export function withAuth(init = {}, token = TEST_TOKEN) {
  return {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  }
}

export async function request(baseUrl, path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init)
  const text = await response.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: response.status, headers: response.headers, body }
}

export async function postJson(server, path, payload, { token = TEST_TOKEN, raw } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token !== null) {
    headers.Authorization = `Bearer ${token}`
  }
  return server.request(path, {
    method: 'POST',
    headers,
    body: raw === undefined ? JSON.stringify(payload) : raw,
  })
}
