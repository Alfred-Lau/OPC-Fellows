import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Service, type Context } from '@deepseek-ai/cordis'
import { app } from 'electron'
import { readDeepSeekApiKey, withDeepSeekApiKey } from '../../../main/credentials'
import { resolveDshBin } from '../../../main/host'
import { resolveNodeBinary } from '../../../main/node'
import { DEEPSEEK_MODEL, MISSING_LLM_KEY_HINT } from '../../../shared/deepseek'
import {
  DshTurnCollector,
  dshRuntimeSessionId,
  encodeJsonRpcRequest,
  isDshSessionExistsError,
  JsonRpcLineBuffer,
  type DshJsonRpcFrame,
  type DshPromptResult,
} from '../../shared/dsh-rpc'
import {
  occupationDirsToAdd,
  occupationPackageDirsFromRoots,
  occupationPluginAddArgv,
  occupationSearchRoots,
} from '../../shared/occupation-bundles'
import { shouldRestartDsh } from '../../shared/project-context'
import { dshHome, ensureOpcProfile, OPC_PROFILE_NAME, OPC_USER_DATA_ENV, opcProfileDir } from '../../shared/opc-profile'
import { readJson, writeJson } from './storage'

const INIT_TIMEOUT_MS = 180_000
const TURN_TIMEOUT_MS = 120_000

export interface DshPromptInput {
  sessionId: string
  text: string
  cwd: string
}

/**
 * 用 opc profile 跑一轮对话。stdout 是 JSON-RPC（in-box 含 `@deepseek-ai/dsh-sdk-app`）。
 * 中栏闲聊、Local API `/agent/task`、occupation / 第三方 `dsh.bundle` 共用这一棵进程。
 * 随手记 `notes_add` 在 occupation-notes 里挂上 dsh `ctx.tools`；项目选了文件夹时文档副本落在 cwd。
 * cwd 变了会重启 SDK：dsh-fs 在 initialize 时绑死工作目录。
 * session id 带稳定 runtime 后缀，同进程内续聊；撞上磁盘旧 session 时先 load 再 prompt。
 */
export class DshRuntimeService extends Service {
  private child: ChildProcess | null = null
  private ready: Promise<void> | null = null
  private nextId = 1
  private readonly pending = new Map<number, { resolve: (frame: DshJsonRpcFrame) => void; reject: (error: Error) => void }>()
  private readonly buffer = new JsonRpcLineBuffer()
  private stderr = ''
  private queue: Promise<unknown> = Promise.resolve()
  private occupationsSeeded = false
  private runtimeId = ''
  private bootCwd = ''
  private readonly knownSessions = new Set<string>()

  constructor(ctx: Context) {
    super(ctx, 'dshRuntime')
    try {
      ensureOpcProfile(dshHome())
    } catch {
      // opc 未落下时先跳过；第一次 prompt 还会再 ensure 一次。
    }
    ctx.effect(() => async () => {
      await this.stop()
    }, 'dshRuntime.stop')
  }

  hasKey(): boolean {
    return Boolean(readDeepSeekApiKey())
  }

  async prompt(input: DshPromptInput): Promise<DshPromptResult> {
    const text = input.text.trim()
    if (!text) {
      throw new Error('没有可发送的对话内容。')
    }
    if (!this.hasKey()) {
      throw new Error(`未找到 DeepSeek API Key。${MISSING_LLM_KEY_HINT}`)
    }
    const run = this.queue.then(() => this.promptNow(input.sessionId, text, input.cwd))
    this.queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async stop(): Promise<void> {
    const child = this.child
    this.child = null
    this.ready = null
    this.bootCwd = ''
    for (const [, pending] of this.pending) {
      pending.reject(new Error('DeepSeek Harness 已停止。'))
    }
    this.pending.clear()
    if (!child || child.exitCode !== null || child.signalCode) {
      return
    }
    await new Promise<void>((resolve) => {
      const finish = (): void => resolve()
      child.once('exit', finish)
      try {
        child.stdin?.write(encodeJsonRpcRequest(this.nextId++, 'shutdown'))
      } catch {
        // Process may already be gone.
      }
      child.kill('SIGTERM')
      setTimeout(() => {
        if (child.exitCode === null && !child.signalCode) {
          child.kill('SIGKILL')
        }
      }, 3000)
    })
  }

  private async promptNow(sessionId: string, text: string, cwd: string): Promise<DshPromptResult> {
    await this.ensure(cwd)
    const bound = this.bindSession(sessionId)
    try {
      const result = await this.promptTurn(bound, text, cwd)
      this.knownSessions.add(bound)
      return result
    } catch (error) {
      if (!isDshSessionExistsError(error)) {
        throw error
      }
      this.knownSessions.add(bound)
      try {
        await this.request('session/load', { sessionId: bound, cwd }, TURN_TIMEOUT_MS)
      } catch {
        // SDK 若没有 load，下一刀 prompt 仍带同一 id。
      }
      try {
        return await this.promptTurn(bound, text, cwd)
      } catch (again) {
        if (!isDshSessionExistsError(again)) {
          throw again
        }
        this.runtimeId = randomUUID()
        this.persistRuntimeId()
        this.knownSessions.clear()
        const fresh = this.bindSession(sessionId)
        const result = await this.promptTurn(fresh, text, cwd)
        this.knownSessions.add(fresh)
        return result
      }
    }
  }

  private bindSession(sessionId: string): string {
    return dshRuntimeSessionId(sessionId, this.runtimeId)
  }

  private async promptTurn(sessionId: string, text: string, cwd: string): Promise<DshPromptResult> {
    const collector = new DshTurnCollector(sessionId)
    const watching = (frame: DshJsonRpcFrame): void => {
      collector.push(frame)
    }
    this.watchers.add(watching)
    try {
      const accepted = await this.request(
        'session/prompt',
        {
          sessionId,
          cwd,
          contentBlocks: [{ type: 'text', text }],
        },
        TURN_TIMEOUT_MS,
      )
      const result = asRecord(accepted.result)
      if (!result || typeof result.messageId !== 'string') {
        throw new Error('Harness 没有收下这条消息。')
      }
      await waitUntil(() => collector.finished, TURN_TIMEOUT_MS, () => this.stderr)
      if (collector.failure) {
        throw new Error(collector.failure)
      }
      const reply = collector.result()
      if (!reply.text) {
        throw new Error('模型没有返回内容。')
      }
      return reply
    } finally {
      this.watchers.delete(watching)
    }
  }

  private readonly watchers = new Set<(frame: DshJsonRpcFrame) => void>()

  private async ensure(cwd: string): Promise<void> {
    const next = cwd.trim()
    if (this.child && this.ready) {
      if (!shouldRestartDsh(this.bootCwd, next)) {
        await this.ready
        return
      }
      await this.stop()
    }
    this.bootCwd = next
    this.ready = this.boot(next)
    try {
      await this.ready
    } catch (error) {
      this.ready = null
      this.bootCwd = ''
      throw error
    }
  }

  private seedOpcOccupations(): void {
    if (this.occupationsSeeded) {
      return
    }
    this.occupationsSeeded = true
    try {
      const home = dshHome()
      ensureOpcProfile(home)
      const refs = occupationPackageDirsFromRoots(
        occupationSearchRoots(app.getAppPath(), process.resourcesPath),
      )
      if (refs.length === 0) {
        return
      }
      const manifestPath = join(opcProfileDir(home), 'package.json')
      if (!existsSync(manifestPath)) {
        return
      }
      const profilePkg = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown
      const dirs = occupationDirsToAdd(profilePkg, refs)
      if (dirs.length === 0) {
        return
      }
      spawnSync(resolveNodeBinary(), [resolveDshBin(), ...occupationPluginAddArgv(dirs)], {
        env: {
          ...process.env,
          DSH_HOME: home,
          DSH_TELEMETRY_DISABLED: '1',
        },
        encoding: 'utf8',
        timeout: 60_000,
        stdio: 'pipe',
      })
      // `dsh plugin add` 会按无名模板 init，可能只留下 dsh-base；装完再补 sdk-app。
      ensureOpcProfile(home)
    } catch {
      // 职业包进 opc 失败不挡对话：记下 / 刷新态势仍走 Electron ctx.tools。
    }
  }

  private async boot(cwd: string): Promise<void> {
    if (!this.runtimeId) {
      this.runtimeId = this.loadRuntimeId()
      this.persistRuntimeId()
    }
    this.seedOpcOccupations()
    const node = resolveNodeBinary()
    const bin = resolveDshBin()
    const child = spawn(node, [bin, '--profile', OPC_PROFILE_NAME], {
      cwd,
      env: {
        ...withDeepSeekApiKey(),
        [OPC_USER_DATA_ENV]: app.getPath('userData'),
        DSH_TELEMETRY_DISABLED: '1',
        DSH_PERMISSION_MODE: 'danger-full-access',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child = child
    this.stderr = ''

    child.stdout?.on('data', (chunk: Buffer | string) => {
      const frames = this.buffer.push(chunk.toString())
      for (const frame of frames) {
        this.dispatch(frame)
      }
    })
    child.stderr?.on('data', (chunk: Buffer | string) => {
      this.stderr = `${this.stderr}${chunk.toString()}`.slice(-4000)
    })
    child.once('exit', (code, signal) => {
      const error = new Error(
        `DeepSeek Harness SDK 退出（code=${String(code)}, signal=${String(signal)}）。\n${this.stderr.slice(-2000)}`,
      )
      for (const [, pending] of this.pending) {
        pending.reject(error)
      }
      this.pending.clear()
      if (this.child === child) {
        this.child = null
        this.ready = null
      }
    })

    const initialized = await this.request(
      'initialize',
      {
        cwd,
        provider: 'deepseek-official',
        model: DEEPSEEK_MODEL,
      },
      INIT_TIMEOUT_MS,
    )
    const result = asRecord(initialized.result)
    const serverInfo = asRecord(result?.serverInfo)
    if (serverInfo?.name !== 'deepseek-harness-sdk-runtime') {
      throw new Error(`Harness SDK 握手失败。\n${this.stderr.slice(-2000)}`)
    }
  }

  private runtimePath(): string {
    return join(app.getPath('userData'), 'kernel', 'dsh-runtime.json')
  }

  private loadRuntimeId(): string {
    const stored = readJson<{ runtimeId?: string }>(this.runtimePath(), {})
    if (typeof stored.runtimeId === 'string' && stored.runtimeId.trim()) {
      return stored.runtimeId.trim()
    }
    return randomUUID()
  }

  private persistRuntimeId(): void {
    writeJson(this.runtimePath(), { runtimeId: this.runtimeId })
  }

  private request(method: string, params: unknown, timeoutMs: number): Promise<DshJsonRpcFrame> {
    const child = this.child
    const stdin = child?.stdin
    if (!child || !stdin) {
      return Promise.reject(new Error('DeepSeek Harness 还没启动。'))
    }
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`等待 Harness ${method} 超过 ${Math.round(timeoutMs / 1000)} 秒。\n${this.stderr.slice(-2000)}`))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (frame) => {
          clearTimeout(timer)
          resolve(frame)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
      stdin.write(encodeJsonRpcRequest(id, method, params), (error) => {
        if (error) {
          this.pending.delete(id)
          clearTimeout(timer)
          reject(error)
        }
      })
    })
  }

  private dispatch(frame: DshJsonRpcFrame): void {
    for (const watch of this.watchers) {
      watch(frame)
    }
    if (frame.id === undefined || frame.method) {
      return
    }
    const id = typeof frame.id === 'number' ? frame.id : Number(frame.id)
    const pending = this.pending.get(id)
    if (!pending) {
      return
    }
    this.pending.delete(id)
    if (frame.error) {
      const message = typeof frame.error.message === 'string' ? frame.error.message : 'Harness 返回错误。'
      pending.reject(new Error(message))
      return
    }
    pending.resolve(frame)
  }
}

function waitUntil(done: () => boolean, timeoutMs: number, stderr: () => string): Promise<void> {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const poll = (): void => {
      if (done()) {
        resolve()
        return
      }
      if (Date.now() - started >= timeoutMs) {
        reject(new Error(`等待 Harness 回合结束超时。\n${stderr().slice(-2000)}`))
        return
      }
      setTimeout(poll, 40)
    }
    poll()
  })
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  return value as Record<string, unknown>
}

export function defaultDshCwd(): string {
  return app.getPath('userData')
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshRuntime: DshRuntimeService
  }
}
