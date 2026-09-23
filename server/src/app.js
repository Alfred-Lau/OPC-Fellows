// HTTP 接口层。零框架：只用 node:http —— 依赖越少，用户越好读、越好改。
//
// 路由（和桌面端本机 API 保持命名一致，方便以后对接）：
//   GET  /health        免鉴权，返回 { ok: true, ... }
//   GET  /v1/todos      -> { ok: true, items: [...] }
//   POST /v1/todos      body { text, device_id? }  -> { ok: true, item: {...} }
//   GET  /v1/notes      -> { ok: true, items: [...] }
//   POST /v1/notes      body { title?, body, device_id? } -> { ok: true, item: {...} }
//
// 除 /health 外全部要求 Authorization: Bearer <SERVER_TOKEN>，缺失或错误 -> 401。
//
// 本文件不发起任何出站请求：没有 fetch、没有 http(s) 客户端、没有遥测。

import { timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'

const SERVICE = 'opc-fellows-server'
const DEFAULT_LIST_LIMIT = 50
const MAX_LIST_LIMIT = 200
const MAX_DEVICE_ID_LENGTH = 200
// 客户端没带 device_id 时落库的占位值，保证每行都有来源标记。
const UNSPECIFIED_DEVICE = 'unspecified'

class HttpError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

export function createApp({ store, token, config, logger = console, now = () => Date.now() }) {
  const startedAtMs = now()
  const corsOrigins = splitList(config.corsOrigin)

  const server = createServer((req, res) => {
    const startedNs = process.hrtime.bigint()
    let logged = false
    const writeAccessLog = () => {
      if (logged) {
        return
      }
      logged = true
      const durationMs = Number(process.hrtime.bigint() - startedNs) / 1e6
      // 只记录方法、路径（不含查询串）、状态码、耗时、响应字节数。
      // 这里刻意不碰 req.headers —— Authorization / Cookie 一个字都不许进日志。
      logger.info(
        `[http] ${(req.method ?? 'GET').toUpperCase()} ${pathOnly(req)} ${res.statusCode} ` +
          `${durationMs.toFixed(1)}ms ${res.getHeader('Content-Length') ?? 0}b`,
      )
    }
    res.on('finish', writeAccessLog)
    res.on('close', writeAccessLog)

    handleRequest(req, res).catch((error) => {
      // 兜底，不让异常逃逸成未处理的 promise rejection。
      logger.error(`[http] 未捕获异常: ${error instanceof Error ? error.message : String(error)}`)
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: 'internal error', code: 'internal' })
      } else {
        res.destroy()
      }
    })
  })

  // 超时：慢连接不允许无限占住 worker。Node 默认 requestTimeout 是 300s，这里收紧。
  server.requestTimeout = config.requestTimeoutMs
  server.headersTimeout = config.headersTimeoutMs
  server.keepAliveTimeout = config.keepAliveTimeoutMs

  async function handleRequest(req, res) {
    try {
      const path = pathOnly(req)
      const method = (req.method ?? 'GET').toUpperCase()

      // 所有响应统一加安全头。
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Cache-Control', 'no-store')

      // CORS 默认关闭：corsOrigins 为空时一个 CORS 头都不发，浏览器自然拦住跨站调用。
      // 开启时也只回显白名单里完全相等的来源，永不返回 "*"。
      const allowedOrigin = resolveCors(req, corsOrigins)
      if (allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
        res.setHeader('Vary', 'Origin')
      }

      if (method === 'OPTIONS') {
        if (!allowedOrigin) {
          throw new HttpError(405, 'method_not_allowed', 'preflight is not enabled')
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        res.setHeader('Access-Control-Max-Age', '600')
        res.writeHead(204)
        res.end()
        return
      }

      // 免鉴权探针：只回运行状态。不含业务数据、不含配置、不泄露任何秘密。
      if (path === '/health') {
        if (method !== 'GET') {
          throw new HttpError(405, 'method_not_allowed', 'only GET is allowed on /health')
        }
        sendJson(res, 200, {
          ok: true,
          service: SERVICE,
          uptimeMs: now() - startedAtMs,
          time: new Date(now()).toISOString(),
        })
        return
      }

      // 唯一的凭证来源是 Authorization 头。查询串里的 token 一律不认（避免 token 进访问日志）。
      if (!isAuthorized(req, token)) {
        throw new HttpError(401, 'unauthorized', 'missing or invalid bearer token')
      }

      if (path === '/v1/todos') {
        if (method === 'GET') {
          const items = await store.listTodos(parseListQuery(req))
          sendJson(res, 200, { ok: true, items })
          return
        }
        if (method === 'POST') {
          const body = await readJsonBody(req, config.maxBodyBytes)
          const text = requireNonEmptyString(body, 'text')
          const item = await store.insertTodo({ text, device_id: readDeviceId(body) })
          sendJson(res, 200, { ok: true, item })
          return
        }
        throw new HttpError(405, 'method_not_allowed', 'only GET and POST are allowed on /v1/todos')
      }

      if (path === '/v1/notes') {
        if (method === 'GET') {
          const items = await store.listNotes(parseListQuery(req))
          sendJson(res, 200, { ok: true, items })
          return
        }
        if (method === 'POST') {
          const body = await readJsonBody(req, config.maxBodyBytes)
          const noteBody = requireNonEmptyString(body, 'body')
          const item = await store.insertNote({
            title: readOptionalTitle(body),
            body: noteBody,
            device_id: readDeviceId(body),
          })
          sendJson(res, 200, { ok: true, item })
          return
        }
        throw new HttpError(405, 'method_not_allowed', 'only GET and POST are allowed on /v1/notes')
      }

      throw new HttpError(404, 'not_found', 'no such route')
    } catch (error) {
      if (res.headersSent) {
        res.destroy()
        return
      }
      if (error instanceof HttpError) {
        sendJson(res, error.status, { ok: false, error: error.message, code: error.code })
        return
      }
      // 不回显内部错误（消息 / 堆栈 / SQL）给客户端；细节只写服务端日志。
      logger.error(`[http] 请求处理失败: ${error instanceof Error ? error.message : String(error)}`)
      sendJson(res, 500, { ok: false, error: 'internal error', code: 'internal' })
    }
  }

  return server
}

// ---------------------------------------------------------------------------
// 鉴权

function isAuthorized(req, token) {
  const header = req.headers.authorization
  if (typeof header !== 'string') {
    return false
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  if (!match) {
    return false
  }
  return safeEqual(match[1], token)
}

// 定长比较，避免用 === 逐字节短路带来的时序侧信道。
function safeEqual(candidate, expected) {
  const a = Buffer.from(String(candidate), 'utf8')
  const b = Buffer.from(String(expected), 'utf8')
  if (a.length !== b.length) {
    return false
  }
  return timingSafeEqual(a, b)
}

// ---------------------------------------------------------------------------
// 请求解析与校验

function pathOnly(req) {
  try {
    return new URL(req.url ?? '/', 'http://localhost').pathname
  } catch {
    return '/'
  }
}

function parseListQuery(req) {
  let url
  try {
    url = new URL(req.url ?? '/', 'http://localhost')
  } catch {
    throw new HttpError(400, 'invalid_query', 'malformed query string')
  }

  const result = { limit: DEFAULT_LIST_LIMIT }

  const rawLimit = url.searchParams.get('limit')
  if (rawLimit !== null) {
    const value = Number(rawLimit)
    if (!Number.isInteger(value) || value < 1 || value > MAX_LIST_LIMIT) {
      throw new HttpError(400, 'invalid_query', `limit must be an integer between 1 and ${MAX_LIST_LIMIT}`)
    }
    result.limit = value
  }

  const deviceId = url.searchParams.get('device_id')
  if (deviceId !== null) {
    const trimmed = deviceId.trim()
    if (!trimmed) {
      throw new HttpError(400, 'invalid_query', 'device_id must not be empty')
    }
    result.device_id = trimmed
  }

  return result
}

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    const fail = (error) => {
      if (settled) {
        return
      }
      settled = true
      reject(error)
    }

    req.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buf.length
      // 请求体上限：超出后立刻拒绝，并停止把数据留在内存里。
      // 注意这里不 destroy socket —— 直接断开会让客户端只看到 ECONNRESET，
      // 拿不到 413 的 JSON 错误体。已经挂上 'data' 监听，剩余字节会被自然读掉丢弃。
      if (size > maxBytes) {
        fail(new HttpError(413, 'body_too_large', `request body exceeds ${maxBytes} bytes`))
        return
      }
      chunks.push(buf)
    })

    req.on('end', () => {
      if (settled) {
        return
      }
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) {
        // 空 body 视作 {}，交给字段校验按统一的 400 invalid_body 处理。
        settled = true
        resolve({})
        return
      }
      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch {
        fail(new HttpError(400, 'invalid_body', 'request body must be valid JSON'))
        return
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        fail(new HttpError(400, 'invalid_body', 'request body must be a JSON object'))
        return
      }
      settled = true
      resolve(parsed)
    })

    req.on('error', (error) => fail(error instanceof Error ? error : new Error(String(error))))
  })
}

function requireNonEmptyString(body, field) {
  const value = body[field]
  if (value === undefined || value === null) {
    throw new HttpError(400, 'invalid_body', `field "${field}" is required`)
  }
  if (typeof value !== 'string') {
    throw new HttpError(400, 'invalid_body', `field "${field}" must be a string`)
  }
  const trimmed = value.trim()
  if (!trimmed) {
    throw new HttpError(400, 'invalid_body', `field "${field}" must not be empty`)
  }
  return trimmed
}

function readOptionalTitle(body) {
  const value = body.title
  if (value === undefined || value === null) {
    return null
  }
  if (typeof value !== 'string') {
    throw new HttpError(400, 'invalid_body', 'field "title" must be a string')
  }
  return value.trim() || null
}

function readDeviceId(body) {
  const value = body.device_id
  if (value === undefined || value === null) {
    return UNSPECIFIED_DEVICE
  }
  if (typeof value !== 'string') {
    throw new HttpError(400, 'invalid_body', 'field "device_id" must be a string')
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return UNSPECIFIED_DEVICE
  }
  if (trimmed.length > MAX_DEVICE_ID_LENGTH) {
    throw new HttpError(400, 'invalid_body', `field "device_id" must be at most ${MAX_DEVICE_ID_LENGTH} characters`)
  }
  return trimmed
}

// ---------------------------------------------------------------------------
// CORS

function splitList(raw) {
  return String(raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function resolveCors(req, corsOrigins) {
  if (corsOrigins.length === 0) {
    return ''
  }
  const origin = req.headers.origin
  if (typeof origin !== 'string' || !origin) {
    return ''
  }
  return corsOrigins.includes(origin) ? origin : ''
}

// ---------------------------------------------------------------------------
// 响应

function sendJson(res, status, body) {
  if (res.headersSent) {
    return
  }
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}
