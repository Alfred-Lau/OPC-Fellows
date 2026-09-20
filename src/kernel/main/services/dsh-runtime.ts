import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { Service, type Context } from '@deepseek-ai/cordis'
import { app } from 'electron'
import { readDeepSeekApiKey, resolveActiveLlm, withLlmEnv } from '../../../main/credentials'
import { resolveDshBin } from '../../../main/host'
import { LOCAL_API_PORT } from '../../../main/local-api-port'
import { localApiToken } from '../../../main/local-api'
import { resolveNodeBinary } from '../../../main/node'
import { getWorkbenchWindow } from '../../../main/workbench-window'
import { MISSING_LLM_KEY_HINT } from '../../../shared/deepseek'
import { dshSdkCall, llmOverlayYaml } from '../../../shared/llm-overlay'
import type { ProjectContextFile } from '../../shared/agent'
import {
  ApprovalGate,
  nativeWriteApprovalOutcome,
  sessionIdFromApprovalAgent,
  type ApprovalOutcome,
  type ApprovalPrompt,
} from '../../shared/approval'
import {
  citeAttachments,
  composeDshPromptContentBlocks,
  type DshPromptContentBlock,
  type SdkImageMime,
} from '../../shared/dsh-attachment'
import {
  dshTreeHasAgentFactory,
  ensureInProcessOccupationTools,
  promptDshInProcess,
  type DshAgentHandle,
  type DshInProcessContext,
} from '../../shared/dsh-in-process'
import {
  DshTurnCollector,
  dshRuntimeSessionId,
  encodeJsonRpcRequest,
  isDshSessionExistsError,
  JsonRpcLineBuffer,
  type DshJsonRpcFrame,
  type DshPromptResult,
} from '../../shared/dsh-rpc'
import { writeMemberPreset } from '../../shared/member-preset'
import { identityDirectoryRoot } from '../../shared/identity-directory'
import {
  occupationDirsToAdd,
  occupationPackageDirsFromRoots,
  occupationPluginAddArgv,
  occupationSearchRoots,
} from '../../shared/occupation-bundles'
import {
  pickToolBridgeTurn,
  scrubSecretEnv,
  toolBridgeEnv,
  type OpcToolBridgeTurn,
} from '../../shared/opc-tool-bridge'
import type { ToolEvent } from '../../shared/tool-events'
import { shouldRestartDsh } from '../../shared/project-context'
import { dshHome, ensureOpcProfile, OPC_PROFILE_NAME, OPC_USER_DATA_ENV, opcProfileDir } from '../../shared/opc-profile'
import { readJson, writeJson } from './storage'

const INIT_TIMEOUT_MS = 180_000
const TURN_TIMEOUT_MS = 120_000

const MAX_PROMPT_IMAGE_BYTES = 4_000_000

export interface DshPromptInput {
  sessionId: string
  text: string
  cwd: string
  preset?: string
  folderPath?: string
  attachments?: readonly ProjectContextFile[]
  toolTurn?: OpcToolBridgeTurn
  onTool?: (event: ToolEvent) => void
}

/**
 * 能 in-process 时在同一棵树上 `ctx.agents.create` / `followup` / `whenIdle`。
 * 缺 host 才 spawn `dsh --profile opc`。人设写进 kernel/presets/<session>.md，
 * 由 opc-kernel 的 systemPrompt 段加载，不塞进用户话。
 * 引用文件只传路径指针。中栏对白从 session.event 投影。
 * 已在跑的会话不因换夹重启。
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
  private inProcessEnvStamped = false
  private occupationToolsEnsured = false
  private runtimeId = ''
  private bootCwd = ''
  private readonly turns = new Map<string, OpcToolBridgeTurn>()
  private readonly knownSessions = new Set<string>()
  private readonly sessionAliases = new Map<string, string>()
  private readonly agentHandles = new Map<string, DshAgentHandle>()
  private readonly approvals = new ApprovalGate((prompt) => this.pushApproval(prompt))

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
    ctx.on('approval/request', (request: unknown, next: () => unknown) => this.answerApprovalRequest(request, next))
  }

  /** 公开仓 agents 仍用 beginTurn/endTurn；与 prompt.toolTurn 并存。 */
  beginTurn(turn: OpcToolBridgeTurn): void {
    this.turns.set(turn.sessionId, turn)
    const bound = this.bindSession(turn.sessionId)
    if (bound !== turn.sessionId) {
      this.turns.set(bound, turn)
    }
  }

  endTurn(sessionId: string): void {
    const turn = this.turns.get(sessionId)
    if (!turn) {
      this.turns.delete(sessionId)
      return
    }
    for (const [id, row] of this.turns) {
      if (row === turn) {
        this.turns.delete(id)
      }
    }
  }

  hasKey(): boolean {
    return Boolean(readDeepSeekApiKey())
  }

  currentTurn(sessionId?: string): OpcToolBridgeTurn | null {
    return pickToolBridgeTurn(this.turns, sessionId)
  }

  async askApproval(input: {
    sessionId: string
    toolName: string
    reason?: string
    signal?: AbortSignal
  }): Promise<ApprovalOutcome> {
    const turn = this.currentTurn(input.sessionId) ?? this.currentTurn()
    const gated = nativeWriteApprovalOutcome(input.toolName, turn?.writeAllowed)
    if (gated) {
      return gated
    }
    if (!getWorkbenchWindow()) {
      return 'unavailable'
    }
    const sessionId = input.sessionId.trim() || turn?.sessionId || ''
    if (!sessionId) {
      return 'unavailable'
    }
    const prompt: ApprovalPrompt = {
      id: randomUUID(),
      sessionId,
      toolName: input.toolName.trim(),
      reason: input.reason?.trim() ?? '',
      ...(turn ? { threadId: turn.threadId, agentId: turn.agentId } : {}),
    }
    return this.approvals.ask(prompt, input.signal)
  }

  decideApproval(id: string, decision: unknown): boolean {
    return this.approvals.decide(id, decision)
  }

  private answerApprovalRequest(request: unknown, next: () => unknown): unknown {
    if (!dshTreeHasAgentFactory(this.ctx)) {
      return next()
    }
    const row = asRecord(request)
    const toolName = typeof row?.toolName === 'string' ? row.toolName.trim() : ''
    if (!toolName) {
      return next()
    }
    const sessionId = sessionIdFromApprovalAgent(row?.agent) || this.currentTurn()?.sessionId || ''
    const reason = typeof row?.reason === 'string' ? row.reason : ''
    const signal = row?.signal instanceof AbortSignal ? row.signal : undefined
    return this.askApproval({ sessionId, toolName, reason, signal })
  }

  private pushApproval(prompt: ApprovalPrompt): void {
    const window = getWorkbenchWindow()
    window?.show()
    window?.focus()
    try {
      this.ctx.bridge.send('agents:approval', prompt)
    } catch {
      // 窗还没起来时不要把主进程打崩。
    }
  }

  async prompt(input: DshPromptInput): Promise<DshPromptResult> {
    const text = input.text.trim()
    if (!text) {
      throw new Error('没有可发送的对话内容。')
    }
    if (!this.hasKey()) {
      throw new Error(`未找到 DeepSeek API Key。${MISSING_LLM_KEY_HINT}`)
    }
    const run = this.queue.then(() => this.promptNow({ ...input, text }))
    this.queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async stop(): Promise<void> {
    const handles = [...this.agentHandles.values()]
    this.agentHandles.clear()
    for (const handle of handles) {
      await handle.dispose().catch(() => undefined)
    }
    const child = this.child
    this.child = null
    this.ready = null
    this.bootCwd = ''
    this.inProcessEnvStamped = false
    this.occupationToolsEnsured = false
    this.turns.clear()
    this.knownSessions.clear()
    this.sessionAliases.clear()
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

  private async promptNow(input: DshPromptInput): Promise<DshPromptResult> {
    await this.ensure(input.cwd, this.bindSession(input.sessionId))
    const bound = this.bindSession(input.sessionId)
    this.writeMemberContext(bound, input)
    const blocks = this.promptBlocks(input)
    const releaseTurn = this.trackTurn(input.sessionId, bound, input.toolTurn)
    try {
      try {
        const result = await this.promptTurn(bound, blocks, input.cwd, input.toolTurn, input.onTool)
        this.knownSessions.add(bound)
        return result
      } catch (error) {
        if (!isDshSessionExistsError(error)) {
          throw error
        }
        this.knownSessions.add(bound)
        if (dshTreeHasAgentFactory(this.ctx)) {
          const fresh = this.aliasSession(input.sessionId)
          this.writeMemberContext(fresh, input)
          const unalias = this.trackTurn(input.sessionId, fresh, input.toolTurn)
          try {
            const result = await this.promptTurn(fresh, blocks, input.cwd, input.toolTurn, input.onTool)
            this.knownSessions.add(fresh)
            return result
          } finally {
            unalias()
          }
        }
        try {
          await this.request('session/load', { sessionId: bound, cwd: input.cwd }, TURN_TIMEOUT_MS)
        } catch {
          // SDK 若没有 load，下一刀 prompt 仍带同一 id。
        }
        try {
          return await this.promptTurn(bound, blocks, input.cwd, input.toolTurn, input.onTool)
        } catch (again) {
          if (!isDshSessionExistsError(again)) {
            throw again
          }
          this.runtimeId = randomUUID()
          this.persistRuntimeId()
          this.knownSessions.clear()
          const fresh = this.bindSession(input.sessionId)
          this.writeMemberContext(fresh, input)
          const result = await this.promptTurn(fresh, blocks, input.cwd, input.toolTurn, input.onTool)
          this.knownSessions.add(fresh)
          return result
        }
      }
    } finally {
      releaseTurn()
    }
  }

  private trackTurn(logical: string, bound: string, turn: OpcToolBridgeTurn | undefined): () => void {
    if (!turn) {
      return () => undefined
    }
    this.turns.set(bound, turn)
    if (logical !== bound) {
      this.turns.set(logical, turn)
    }
    return () => {
      if (this.turns.get(bound) === turn) {
        this.turns.delete(bound)
      }
      if (this.turns.get(logical) === turn) {
        this.turns.delete(logical)
      }
    }
  }

  private promptBlocks(input: DshPromptInput): DshPromptContentBlock[] {
    const cites = citeAttachments(input.folderPath, input.attachments ?? [])
    const images = cites.flatMap((cite) => {
      if (!cite.imageMime || cite.omitted) {
        return []
      }
      const encoded = readEncodedImage(cite.path, cite.imageMime)
      return encoded ? [encoded] : []
    })
    return composeDshPromptContentBlocks({ text: input.text, cites, images })
  }

  private writePreset(sessionId: string, preset: string | undefined): void {
    if (!preset?.trim()) {
      return
    }
    writeMemberPreset(app.getPath('userData'), sessionId, preset)
  }

  private writeMemberContext(bound: string, input: DshPromptInput): void {
    this.writePreset(bound, input.preset)
    // 公开仓尚无 member-session；roster meta 留给后续补片。
  }

  private bindSession(sessionId: string): string {
    if (dshTreeHasAgentFactory(this.ctx)) {
      return this.sessionAliases.get(sessionId) ?? sessionId
    }
    return dshRuntimeSessionId(sessionId, this.runtimeId)
  }

  private aliasSession(sessionId: string): string {
    const fresh = dshRuntimeSessionId(sessionId, randomUUID())
    this.sessionAliases.set(sessionId, fresh)
    this.knownSessions.delete(sessionId)
    return fresh
  }

  private async promptTurn(
    sessionId: string,
    contentBlocks: readonly DshPromptContentBlock[],
    cwd: string,
    _toolTurn?: OpcToolBridgeTurn,
    _onTool?: (event: ToolEvent) => void,
  ): Promise<DshPromptResult> {
    // 公开仓 dsh-rpc 的 DshTurnCollector 尚无 onTool 回调；工具事件仍走 opcTools.emit。
    const collector = new DshTurnCollector(sessionId)
    if (dshTreeHasAgentFactory(this.ctx)) {
      return promptDshInProcess({
        ctx: this.ctx as DshInProcessContext,
        sessionId,
        cwd,
        blocks: contentBlocks,
        collector,
        timeoutMs: TURN_TIMEOUT_MS,
        handles: this.agentHandles,
        agentOptions: dshSdkCall(resolveActiveLlm()),
      })
    }
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
          contentBlocks,
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

  private async ensure(cwd: string, sessionId: string): Promise<void> {
    const next = cwd.trim()
    if (dshTreeHasAgentFactory(this.ctx)) {
      await this.ensureInProcess(next)
      return
    }
    if (this.child && this.ready) {
      const live = this.knownSessions.has(sessionId)
      // 公开仓 shouldRestartDsh 尚无第三参；活会话不因换夹重启。
      if (live || !shouldRestartDsh(this.bootCwd, next)) {
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

  private async ensureInProcess(cwd: string): Promise<void> {
    this.stampInProcessEnv()
    if (!this.occupationToolsEnsured) {
      this.occupationToolsEnsured = true
      await ensureInProcessOccupationTools(this.ctx)
    }
    if (!this.bootCwd) {
      this.bootCwd = cwd
    }
  }

  private stampInProcessEnv(): void {
    if (this.inProcessEnvStamped) {
      return
    }
    this.inProcessEnvStamped = true
    Object.assign(process.env, withLlmEnv())
    process.env[OPC_USER_DATA_ENV] = app.getPath('userData')
    process.env.DSH_TELEMETRY_DISABLED = '1'
    process.env.DSH_PERMISSION_MODE = 'workspace-write'
    Object.assign(process.env, toolBridgeEnv({ token: localApiToken(), port: LOCAL_API_PORT }))
  }

  private seedOpcOccupations(): void {
    if (this.occupationsSeeded) {
      return
    }
    this.occupationsSeeded = true
    try {
      const home = dshHome()
      ensureOpcProfile(home)
      // 公开仓尚无 opcDshSeedDirs；继续用 occupationSearchRoots + kernel 补种。
      const refs = occupationPackageDirsFromRoots(
        occupationSearchRoots(app.getAppPath(), process.resourcesPath),
      )
      const manifestPath = join(opcProfileDir(home), 'package.json')
      if (!existsSync(manifestPath)) {
        return
      }
      const profilePkg = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown
      const kernelCandidates = [
        join(app.getAppPath(), 'packages', 'opc-kernel'),
        process.resourcesPath ? join(process.resourcesPath, 'opc-kernel') : '',
      ]
      const kernelDir = kernelCandidates.find((dir) => dir && existsSync(join(dir, 'dsh-plugin.js')))
      const extra = kernelDir && !profileDependencyNamesHas(profilePkg, 'ownworkbuddy-kernel') ? [kernelDir] : []
      const dirs = [...occupationDirsToAdd(profilePkg, refs), ...extra]
      if (dirs.length === 0) {
        return
      }
      spawnSync(resolveNodeBinary(), [resolveDshBin(), ...occupationPluginAddArgv(dirs)], {
        env: {
          ...scrubSecretEnv(process.env),
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
      // 包进 opc 失败不挡对话：社媒弹药仍走 Electron ctx.opcTools。
    }
  }

  private async boot(cwd: string): Promise<void> {
    if (!this.runtimeId) {
      this.runtimeId = this.loadRuntimeId()
      this.persistRuntimeId()
    }
    this.seedOpcOccupations()
    const overlay = this.writeProviderOverlay(llmOverlayYaml(resolveActiveLlm()))
    const node = resolveNodeBinary()
    const bin = resolveDshBin()
    const argv = [bin, '--profile', OPC_PROFILE_NAME]
    if (overlay) {
      argv.push('--patch', overlay)
    }
    const child = spawn(node, argv, {
      cwd,
      env: {
        ...withLlmEnv(),
        [OPC_USER_DATA_ENV]: app.getPath('userData'),
        DSH_TELEMETRY_DISABLED: '1',
        DSH_PERMISSION_MODE: 'workspace-write',
        ...toolBridgeEnv({ token: localApiToken(), port: LOCAL_API_PORT }),
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
        ...dshSdkCall(resolveActiveLlm()),
      },
      INIT_TIMEOUT_MS,
    )
    const result = asRecord(initialized.result)
    const serverInfo = asRecord(result?.serverInfo)
    if (serverInfo?.name !== 'deepseek-harness-sdk-runtime') {
      throw new Error(`Harness SDK 握手失败。\n${this.stderr.slice(-2000)}`)
    }
  }

  private writeProviderOverlay(yaml: string | null): string | null {
    const path = join(app.getPath('userData'), 'kernel', 'llm-provider.patch.yml')
    mkdirSync(dirname(path), { recursive: true })
    if (!yaml) {
      writeFileSync(path, '[]\n')
      return null
    }
    writeFileSync(path, yaml.endsWith('\n') ? yaml : `${yaml}\n`)
    return path
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

function readEncodedImage(
  path: string,
  mimeType: SdkImageMime,
): { data: string; mimeType: SdkImageMime } | undefined {
  try {
    const buf = readFileSync(path)
    if (buf.length === 0 || buf.length > MAX_PROMPT_IMAGE_BYTES) {
      return undefined
    }
    return { data: buf.toString('base64'), mimeType }
  } catch {
    return undefined
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  return value as Record<string, unknown>
}

export function defaultDshCwd(): string {
  return identityDirectoryRoot(homedir())
}

function profileDependencyNamesHas(profilePkg: unknown, name: string): boolean {
  if (!profilePkg || typeof profilePkg !== 'object') {
    return false
  }
  const dependencies = (profilePkg as { dependencies?: unknown }).dependencies
  if (!dependencies || typeof dependencies !== 'object') {
    return false
  }
  return name in (dependencies as Record<string, unknown>)
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    'approval/request'(request: unknown, next: () => unknown): unknown
  }
  interface Context {
    dshRuntime: DshRuntimeService
  }
}
