// 把「不采集遥测、不向外部发请求」这条公开承诺钉成可执行的回归测试。
//
// 做法很朴素：扫 server/src 下的源码，禁止出现任何出站 HTTP 客户端或遥测 SDK。
// 唯一被允许的出站连接是 pg 连到部署者自己的 DATABASE_URL（在 pg-store.js 里）。
//
// 注意：测试文件自己用 fetch 当客户端是允许的 —— 只扫 src/。

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url))

const FORBIDDEN = [
  // 出站 HTTP 客户端
  { pattern: /\bfetch\s*\(/, label: 'fetch()' },
  { pattern: /from\s+['"]node:https['"]/, label: "import 'node:https'" },
  { pattern: /from\s+['"]node:net['"]/, label: "import 'node:net'" },
  { pattern: /from\s+['"]node:dns/, label: "import 'node:dns'" },
  { pattern: /\bhttps?\.(get|request)\s*\(/, label: 'http(s).get/request()' },
  { pattern: /\bnet\.connect\s*\(/, label: 'net.connect()' },
  { pattern: /\b(axios|undici|node-fetch|got|superagent|request)\s*[(.]/, label: '第三方 HTTP 客户端' },
  // 遥测 / 埋点 SDK
  { pattern: /opentelemetry|@sentry|\bsentry\b|posthog|mixpanel|amplitude|datadog|newrelic/i, label: '遥测 SDK' },
]

function sourceFiles() {
  return readdirSync(SRC_DIR)
    .filter((name) => name.endsWith('.js'))
    .map((name) => ({ name, path: join(SRC_DIR, name) }))
}

test('server/src 下不出现任何出站 HTTP 客户端或遥测 SDK', () => {
  const files = sourceFiles()

  assert.ok(files.length >= 5, `应当扫到 5 个以上的源文件，实际 ${files.length} 个`)

  const hits = []
  for (const file of files) {
    const lines = readFileSync(file.path, 'utf8').split('\n')
    lines.forEach((line, index) => {
      // 纯注释行不参与（例如本文件风格的「没有 fetch」说明），只盯真实的调用/导入。
      const code = line.replace(/\/\/.*$/, '')
      for (const { pattern, label } of FORBIDDEN) {
        if (pattern.test(code)) {
          hits.push(`${file.name}:${index + 1} ${label} -> ${code.trim()}`)
        }
      }
    })
  }

  assert.deepEqual(hits, [], `发现出站/遥测代码，违反公开承诺：\n${hits.join('\n')}`)
})

test('src 里没有读取 SERVER_TOKEN 之外的环境变量泄露到响应里', () => {
  // 轻量护栏：app.js 不应该出现 process.env —— 配置一律由 config.js 注入。
  const appSource = readFileSync(join(SRC_DIR, 'app.js'), 'utf8')
  assert.ok(!appSource.includes('process.env'), 'app.js 不应直接读 process.env（配置应通过 createApp 注入）')
})
