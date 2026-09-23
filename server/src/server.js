// 进程入口。
//
// 本文件不发起任何出站请求，也不向任何第三方上报数据 —— 这是本模块的公开承诺，
// 和 desktop 端的 SECURITY.md 一致：没有遥测、没有埋点、没有 phone-home。
// 唯一的出站连接是到你自己 DATABASE_URL 指向的 Postgres。

import { createApp } from './app.js'
import { ConfigError, loadConfig } from './config.js'
import { createLogger } from './log.js'
import { createStore } from './store.js'

const SHUTDOWN_GRACE_MS = 10_000

const logger = createLogger(process.env.LOG_LEVEL ?? 'info')

async function main() {
  let config
  try {
    config = loadConfig(process.env)
  } catch (error) {
    if (error instanceof ConfigError) {
      // 配置错误：说人话、说怎么办，然后退出。绝不回显 token 值。
      logger.error(`[server] 配置错误：${error.message}`)
      process.exit(1)
      return
    }
    throw error
  }

  // 日志级别以最终配置为准（LOG_LEVEL 也走 config 校验）。
  const log = createLogger(config.logLevel)
  const store = await createStore(config, { logger: log })

  // 幂等建表：起来就可用，不依赖外部迁移工具。
  await store.migrate()

  const server = createApp({ store, token: config.token, config, logger: log })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.port, config.host, resolve)
  })

  // 启动行只打印监听地址和存储类型 —— 永远不打印 SERVER_TOKEN。
  log.info(`[server] listening on http://${config.host}:${config.port} (store=${config.store})`)
  if (config.corsOrigin) {
    log.warn(`[server] CORS 已开启，白名单：${config.corsOrigin}`)
  }

  let shuttingDown = false
  const shutdown = async (signal) => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    log.info(`[server] 收到 ${signal}，开始优雅退出`)
    const forceExit = setTimeout(() => {
      log.error('[server] 优雅退出超时，强制结束')
      process.exit(1)
    }, SHUTDOWN_GRACE_MS)
    forceExit.unref()
    try {
      await new Promise((resolve) => server.close(resolve))
      await store.close()
      log.info('[server] 已退出')
      process.exit(0)
    } catch (error) {
      log.error(`[server] 退出时出错：${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((error) => {
  logger.error(`[server] 启动失败：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
