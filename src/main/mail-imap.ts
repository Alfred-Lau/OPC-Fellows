import tls from 'node:tls'
import { parseImapFetchBlocks, parseImapSearchIds, quoteImapString } from '../shared/mail'

export interface ImapHeader {
  uid: string
  flags: string[]
  headers: Record<string, string>
}

const TIMEOUT_MS = 20_000
const FETCH_LIMIT = 40

export async function fetchImapInbox(input: {
  host: string
  port: number
  user: string
  password: string
  limit?: number
}): Promise<ImapHeader[]> {
  const limit = input.limit ?? FETCH_LIMIT
  const session = await ImapSession.connect(input.host, input.port)
  try {
    await session.command(`LOGIN ${quoteImapString(input.user)} ${quoteImapString(input.password)}`)
    await session.command('SELECT INBOX')
    const search = await session.command('SEARCH ALL')
    const ids = parseImapSearchIds(search).slice(-limit)
    if (ids.length === 0) {
      return []
    }
    const fetched = await session.command(
      `FETCH ${ids[0]}:${ids[ids.length - 1]} (FLAGS BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)])`,
    )
    return parseImapFetchBlocks(fetched)
  } finally {
    await session.close()
  }
}

class ImapSession {
  private tag = 0
  private buffer = ''
  private readonly socket: tls.TLSSocket

  private constructor(socket: tls.TLSSocket) {
    this.socket = socket
  }

  static connect(host: string, port: number): Promise<ImapSession> {
    return new Promise((resolve, reject) => {
      const socket = tls.connect({ host, port, servername: host }, () => undefined)
      const session = new ImapSession(socket)
      const timer = setTimeout(() => {
        socket.destroy()
        reject(new Error('连接邮箱超时'))
      }, TIMEOUT_MS)
      const onData = (chunk: Buffer) => {
        session.buffer += chunk.toString('utf8')
        if (/\* OK /i.test(session.buffer)) {
          clearTimeout(timer)
          socket.off('data', onData)
          socket.on('data', (next) => {
            session.buffer += next.toString('utf8')
          })
          resolve(session)
        }
      }
      socket.on('data', onData)
      socket.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
    })
  }

  async command(body: string): Promise<string> {
    this.tag += 1
    const tag = `A${String(this.tag)}`
    this.socket.write(`${tag} ${body}\r\n`)
    const started = Date.now()
    while (Date.now() - started < TIMEOUT_MS) {
      const done = taggedResponse(this.buffer, tag)
      if (done) {
        this.buffer = done.rest
        if (!done.ok) {
          throw new Error(done.text || '邮箱命令失败')
        }
        return done.body
      }
      await sleep(40)
    }
    throw new Error('邮箱响应超时')
  }

  async close(): Promise<void> {
    try {
      await this.command('LOGOUT')
    } catch {
      // 退出失败也关掉套接字
    }
    this.socket.destroy()
  }
}

function taggedResponse(
  buffer: string,
  tag: string,
): { ok: boolean; text: string; body: string; rest: string } | null {
  const marker = `\n${tag} `
  const alt = buffer.startsWith(`${tag} `) ? 0 : buffer.indexOf(marker)
  if (alt < 0) {
    return null
  }
  const lineStart = alt === 0 && buffer.startsWith(`${tag} `) ? 0 : alt + 1
  const lineEnd = buffer.indexOf('\n', lineStart)
  if (lineEnd < 0) {
    return null
  }
  const line = buffer.slice(lineStart, lineEnd).trim()
  const ok = new RegExp(`^${tag} OK`, 'i').test(line)
  return {
    ok,
    text: line.replace(new RegExp(`^${tag}\\s+(OK|NO|BAD)\\s*`, 'i'), '').trim(),
    body: buffer.slice(0, lineStart),
    rest: buffer.slice(lineEnd + 1),
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
