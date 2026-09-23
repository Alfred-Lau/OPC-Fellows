// 极简结构化日志。
//
// 安全约定（和 README 的「不采集遥测」承诺配套）：
// - 这里只做本地 stdout/stderr 输出，不发送、不上报、不落第三方。
// - 调用方传入的字符串必须已经脱敏。特别是：请求日志只允许出现
//   方法 / 路径（不含查询串）/ 状态码 / 耗时 / 响应字节数，
//   绝不出现 Authorization、Cookie、请求体或任何 token。

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 }

export function createLogger(level = 'info', sinks = {}) {
  const out = sinks.out ?? process.stdout
  const err = sinks.err ?? process.stderr
  const threshold = LEVELS[level] ?? LEVELS.info
  const write = (name, message, target) => {
    if (LEVELS[name] > threshold) {
      return
    }
    target.write(`${new Date().toISOString()} ${name} ${message}\n`)
  }
  return {
    level,
    error: (message) => write('error', message, err),
    warn: (message) => write('warn', message, out),
    info: (message) => write('info', message, out),
    debug: (message) => write('debug', message, out),
  }
}

// 测试用：不产生任何输出，避免污染 node --test 的 TAP 流。
export const silentLogger = {
  level: 'error',
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
}
