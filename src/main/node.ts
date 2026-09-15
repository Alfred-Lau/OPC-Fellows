import { resolveBinary } from './cli-path'

export function resolveNodeBinary(): string {
  const found = resolveBinary('node', ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node'])
  if (found) {
    return found
  }
  throw new Error(
    '未找到 Node.js。DeepSeek Harness 需要 Node.js ^22.19.0 或 >=24.0.0，请安装后从终端启动，或设置 OWNWORKBUDDY_NODE。',
  )
}
