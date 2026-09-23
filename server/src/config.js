// 配置只在这里读一次、校验一次。
//
// 约定：
// - 本模块不自己去读 .env 文件（由 Docker / compose / 部署者把变量注入进程环境），
//   也不加载 dotenv 之类的依赖。
// - 校验失败一律 fail fast 并给出可操作提示。
// - 报错信息里绝不回显 SERVER_TOKEN 的值（只允许出现长度等元信息）。

const DEFAULTS = {
  host: '127.0.0.1',
  port: 8787,
  maxBodyBytes: 1024 * 1024, // 1 MiB
  requestTimeoutMs: 15_000,
  headersTimeoutMs: 20_000,
  keepAliveTimeoutMs: 5_000,
  corsOrigin: '',
  store: 'postgres',
  logLevel: 'info',
}

// 低于这个长度直接拒绝启动。README 里建议 openssl rand -hex 32（64 字符）。
const MIN_TOKEN_LENGTH = 16

export class ConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ConfigError'
  }
}

export function loadConfig(env = process.env) {
  const store = readChoice(env.STORE, 'STORE', DEFAULTS.store, ['postgres', 'memory'])

  // token 是唯一的访问凭证：空 / 太短都拒绝，且不回显值。
  const token = String(env.SERVER_TOKEN ?? '').trim()
  if (!token) {
    throw new ConfigError(
      '缺少 SERVER_TOKEN（/health 之外的所有接口都要求 Authorization: Bearer）。生成一个强随机值：openssl rand -hex 32',
    )
  }
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new ConfigError(
      `SERVER_TOKEN 太短（${token.length} 字符），至少 ${MIN_TOKEN_LENGTH} 字符。请用 openssl rand -hex 32 生成。`,
    )
  }

  const databaseUrl = String(env.DATABASE_URL ?? '').trim()
  if (store === 'postgres' && !databaseUrl) {
    throw new ConfigError('STORE=postgres 时必须提供 DATABASE_URL，例如 postgres://user:password@db:5432/opc_fellows')
  }

  const host = String(env.HOST ?? DEFAULTS.host).trim() || DEFAULTS.host

  return {
    host,
    port: readInt(env.PORT, 'PORT', DEFAULTS.port, 1, 65535),
    maxBodyBytes: readInt(env.MAX_BODY_BYTES, 'MAX_BODY_BYTES', DEFAULTS.maxBodyBytes, 256, 64 * 1024 * 1024),
    requestTimeoutMs: readInt(env.REQUEST_TIMEOUT_MS, 'REQUEST_TIMEOUT_MS', DEFAULTS.requestTimeoutMs, 100, 600_000),
    headersTimeoutMs: readInt(env.HEADERS_TIMEOUT_MS, 'HEADERS_TIMEOUT_MS', DEFAULTS.headersTimeoutMs, 100, 600_000),
    keepAliveTimeoutMs: readInt(env.KEEP_ALIVE_TIMEOUT_MS, 'KEEP_ALIVE_TIMEOUT_MS', DEFAULTS.keepAliveTimeoutMs, 100, 600_000),
    corsOrigin: readCorsOrigin(env.CORS_ORIGIN),
    store,
    databaseUrl: store === 'postgres' ? databaseUrl : '',
    token,
    logLevel: readChoice(env.LOG_LEVEL, 'LOG_LEVEL', DEFAULTS.logLevel, ['error', 'warn', 'info', 'debug']),
  }
}

// CORS 默认关闭：只有显式配置了白名单才打开；"*" 一律拒绝（和 Bearer token 放一起会直接毁掉鉴权）。
function readCorsOrigin(raw) {
  const value = String(raw ?? '').trim()
  if (!value) {
    return ''
  }
  const entries = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (entries.includes('*')) {
    throw new ConfigError('CORS_ORIGIN 不允许使用通配符 "*"。请填明确的来源（如 https://app.example.com），或留空关闭 CORS。')
  }
  return entries.join(',')
}

function readChoice(raw, name, fallback, allowed) {
  const value = String(raw ?? '').trim().toLowerCase() || fallback
  if (!allowed.includes(value)) {
    throw new ConfigError(`${name} 只能是 ${allowed.join(' / ')}，收到 "${value}"`)
  }
  return value
}

function readInt(raw, name, fallback, min, max) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return fallback
  }
  const value = Number(String(raw).trim())
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${name} 必须是 ${min}..${max} 之间的整数，收到 "${String(raw)}"`)
  }
  return value
}
