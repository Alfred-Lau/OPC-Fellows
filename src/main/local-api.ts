import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { join } from 'node:path'
import { app } from 'electron'
import type { TodoItem } from '../shared/todo'
import {
  composeLocalApiTask,
  formatAgentTaskJob,
  localApiTaskSessionId,
} from '../kernel/shared/dsh-task'
import { broadcastTodosChanged } from './todo-broadcast'
import { cancelTodoSchedule, scheduleTodo } from './todo-notify'
import { addTodos, listTodos, updateTodo } from './todo-store'

export const LOCAL_API_PORT = 18755

const HOST = '127.0.0.1'
const APP_ID = 'ownworkbuddy'
const MAX_BODY_BYTES = 1024 * 1024
const MAX_JOBS = 20
const MAX_STREAM_BYTES = 64 * 1024

export interface LocalApiRuntime {
  prompt: (input: { sessionId: string; text: string; cwd: string }) => Promise<{ text: string }>
}

type JobStatus = 'running' | 'done' | 'error'

interface AgentJob {
  id: string
  status: JobStatus
  exitCode: number | null
  stdout: string
  stderr: string
}

interface DiscoveryFile {
  version: number
  app: string
  port: number
  token: string
  pid: number
  startedAt: string
}

let server: ReturnType<typeof createServer> | null = null
let token = ''
let startedAtMs = 0
let closed = false
let runtime: LocalApiRuntime | null = null
const jobs = new Map<string, AgentJob>()

export function startLocalApi(next: LocalApiRuntime): void {
  runtime = next
  closed = false
  if (server) {
    return
  }
  try {
    token = randomBytes(32).toString('hex')
    startedAtMs = Date.now()
    server = createServer((req, res) => {
      void handleRequest(req, res)
    })
    server.on('error', (error) => {
      console.error('[LocalAPI]', error instanceof Error ? error.message : error)
      server = null
    })
    server.listen(LOCAL_API_PORT, HOST, () => {
      writeDiscovery()
    })
  } catch (error) {
    console.error('[LocalAPI]', error instanceof Error ? error.message : error)
    server = null
  }
}

export function stopLocalApi(): void {
  closed = true
  runtime = null
  for (const job of jobs.values()) {
    if (job.status === 'running') {
      job.status = 'error'
      job.exitCode = 1
      job.stderr = appendCapped(job.stderr, 'server shutting down\n', MAX_STREAM_BYTES)
    }
  }
  jobs.clear()
  if (server) {
    server.close()
    server = null
  }
  removeDiscoveryIfOwn()
}

function discoveryPath(): string {
  return join(app.getPath('userData'), 'local-api.json')
}

function writeDiscovery(): void {
  const payload: DiscoveryFile = {
    version: 1,
    app: APP_ID,
    port: LOCAL_API_PORT,
    token,
    pid: process.pid,
    startedAt: new Date(startedAtMs).toISOString(),
  }
  writeFileSync(discoveryPath(), `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
}

function removeDiscoveryIfOwn(): void {
  const path = discoveryPath()
  if (!existsSync(path)) {
    return
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<DiscoveryFile>
    if (parsed.pid === process.pid) {
      unlinkSync(path)
    }
  } catch {
    // Keep a foreign or unreadable discovery file.
  }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://${HOST}:${String(LOCAL_API_PORT)}`)
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin && !isLocalOrigin(origin)) {
    sendJson(res, 403, { ok: false, error: 'forbidden origin' })
    return
  }

  const method = req.method ?? 'GET'
  const path = url.pathname

  if (method === 'GET' && path === '/health') {
    sendJson(res, 200, {
      ok: true,
      app: APP_ID,
      pid: process.pid,
      uptimeMs: Date.now() - startedAtMs,
      version: app.getVersion(),
    })
    return
  }

  if (!authorize(req)) {
    sendJson(res, 401, { ok: false, error: 'unauthorized' })
    return
  }

  try {
    if (method === 'GET' && path === '/todos') {
      sendJson(res, 200, { ok: true, items: listTodos().map(toApiTodo) })
      return
    }

    if (method === 'POST' && path === '/todos') {
      const body = await readJsonBody(req)
      const text = asNonEmptyString(body.text)
      if (!text) {
        sendJson(res, 400, { ok: false, error: 'text required', code: 'invalid_body' })
        return
      }
      const created = addTodos([{ title: text, notifyAt: null }], 'local-api')
      if (created.length === 0) {
        sendJson(res, 400, { ok: false, error: 'todo not created', code: 'invalid_body' })
        return
      }
      for (const todo of created) {
        scheduleTodo(todo)
      }
      broadcastTodosChanged()
      sendJson(res, 200, { ok: true, item: toApiTodo(created[0]!) })
      return
    }

    if (method === 'POST' && path === '/todos/done') {
      const body = await readJsonBody(req)
      const id = asNonEmptyString(body.id)
      if (!id) {
        sendJson(res, 400, {
          ok: false,
          error: 'id required; todo numbering (n) is not implemented in this app',
          code: 'id_only',
        })
        return
      }
      const next = updateTodo(id, { done: true })
      if (!next) {
        sendJson(res, 404, { ok: false, error: 'todo not found', code: 'not_found' })
        return
      }
      cancelTodoSchedule(next.id)
      broadcastTodosChanged()
      sendJson(res, 200, { ok: true, item: toApiTodo(next) })
      return
    }

    if (method === 'POST' && path === '/agent/task') {
      const body = await readJsonBody(req)
      const prompt = asNonEmptyString(body.prompt)
      if (!prompt) {
        sendJson(res, 400, { ok: false, error: 'prompt required', code: 'invalid_body' })
        return
      }
      sendJson(res, 200, { ok: true, jobId: startAgentJob(prompt) })
      return
    }

    const taskMatch = /^\/agent\/task\/([^/]+)$/.exec(path)
    if (method === 'GET' && taskMatch) {
      const job = jobs.get(decodeURIComponent(taskMatch[1] ?? ''))
      if (!job) {
        sendJson(res, 404, { ok: false, error: 'job not found', code: 'not_found' })
        return
      }
      sendJson(res, 200, {
        ok: true,
        status: job.status,
        exitCode: job.exitCode,
        stdout: job.stdout,
        stderr: job.stderr,
      })
      return
    }

    sendJson(res, 404, { ok: false, error: 'not found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'invalid json' || message === 'body too large') {
      sendJson(res, message === 'body too large' ? 413 : 400, {
        ok: false,
        error: message,
        code: 'invalid_body',
      })
      return
    }
    sendJson(res, 500, { ok: false, error: message, code: 'internal' })
  }
}

function startAgentJob(prompt: string): string {
  const id = randomBytes(16).toString('hex')
  const job: AgentJob = {
    id,
    status: 'running',
    exitCode: null,
    stdout: '',
    stderr: '',
  }
  jobs.set(id, job)
  trimJobs()
  void runAgentJob(job, prompt)
  return id
}

async function runAgentJob(job: AgentJob, prompt: string): Promise<void> {
  const current = runtime
  if (!current) {
    applyJobResult(job, formatAgentTaskJob({ error: '内核未就绪。' }))
    return
  }
  try {
    const turn = await current.prompt({
      sessionId: localApiTaskSessionId(job.id),
      text: composeLocalApiTask(prompt),
      cwd: process.cwd(),
    })
    applyJobResult(job, formatAgentTaskJob({ text: turn.text }))
  } catch (error) {
    applyJobResult(job, formatAgentTaskJob({ error: error instanceof Error ? error.message : String(error) }))
  }
}

function applyJobResult(job: AgentJob, result: ReturnType<typeof formatAgentTaskJob>): void {
  if (closed || job.status !== 'running' || !jobs.has(job.id)) {
    return
  }
  job.stdout = appendCapped('', result.stdout, MAX_STREAM_BYTES)
  job.stderr = appendCapped('', result.stderr, MAX_STREAM_BYTES)
  job.exitCode = result.exitCode
  job.status = result.status
}

function trimJobs(): void {
  while (jobs.size > MAX_JOBS) {
    const oldest = jobs.keys().next().value
    if (oldest === undefined) {
      break
    }
    jobs.delete(oldest)
  }
}

function toApiTodo(item: TodoItem): Record<string, unknown> {
  return {
    id: item.id,
    text: item.title,
    title: item.title,
    status: item.done ? 'done' : 'open',
    done: item.done,
    note: item.note,
    notifyAt: item.notifyAt,
    notifiedAt: item.notifiedAt,
    createdAt: item.createdAt,
    source: item.source,
    tags: item.tags,
    origin: item.origin,
    agentId: item.agentId,
    dedupeKey: item.dedupeKey,
  }
}

function authorize(req: IncomingMessage): boolean {
  const header = req.headers.authorization
  if (typeof header !== 'string') {
    return false
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return Boolean(match && match[1] === token)
}

function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
  } catch {
    return false
  }
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    const fail = (error: Error): void => {
      if (settled) {
        return
      }
      settled = true
      reject(error)
    }
    req.on('data', (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buf.length
      if (size > MAX_BODY_BYTES) {
        req.destroy()
        fail(new Error('body too large'))
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
        settled = true
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(raw) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          fail(new Error('invalid json'))
          return
        }
        settled = true
        resolve(parsed as Record<string, unknown>)
      } catch {
        fail(new Error('invalid json'))
      }
    })
    req.on('error', (error) => fail(error instanceof Error ? error : new Error(String(error))))
  })
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function appendCapped(current: string, chunk: string, max: number): string {
  if (current.length >= max) {
    return current
  }
  const next = current + chunk
  return next.length > max ? next.slice(0, max) : next
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
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
