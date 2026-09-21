import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { bootKernelTree } from './dsh-desktop-profile.ts'
import { DshTurnCollector } from './dsh-rpc.ts'
import {
  contentBlocksToUserMessage,
  dshTreeHasAgentFactory,
  promptDshInProcess,
} from './dsh-in-process.ts'

const repoRoot = join(import.meta.dirname, '../../..')

test('asar 自建树没有 dsh agent 工厂', async () => {
  const asar = await bootKernelTree({
    hostRoot: '/App/Contents/Resources/app.asar',
    dshHome: mkdtempSync(join(tmpdir(), 'opc-in-process-asar-')),
    applyHost: async () => undefined,
  })
  assert.equal(dshTreeHasAgentFactory(asar), false)
  await asar.fiber.dispose()
})

test('contentBlocksToUserMessage 只把正文编成 user 消息', () => {
  const message = contentBlocksToUserMessage([{ type: 'text', text: '你好' }])
  assert.equal(message.role, 'user')
  assert.equal(message.source.kind, 'user')
  assert.deepEqual(message.content, [{ type: 'text', text: '你好' }])
  assert.equal(
    contentBlocksToUserMessage([
      { type: 'image', data: 'abc', mimeType: 'image/png' },
      { type: 'text', text: '看这张图' },
    ]).content.length,
    1,
  )
})

test('promptDshInProcess 走 create/followup/whenIdle，不 spawn', async () => {
  const created: Array<{ sessionId: string; agentOptions?: { provider: string; model: string } }> = []
  const followups: unknown[] = []
  const agent = {
    id: 's1',
    options: { provider: '', model: '' },
    followup(message: unknown) {
      followups.push(message)
    },
    async whenIdle() {
      return undefined
    },
  }
  const ctx = {
    get(name: string) {
      if (name !== 'agents') {
        return undefined
      }
      return {
        create: async (options: {
          sessionId: string
          agentOptions?: { provider: string; model: string }
        }) => {
          created.push(options)
          agent.options = options.agentOptions ?? agent.options
          return { agent, dispose: async () => undefined }
        },
        resume: async () => ({ agent, dispose: async () => undefined }),
        get: () => undefined,
      }
    },
    on(event: string, listener: (...args: unknown[]) => void) {
      if (event === 'session/event') {
        listener(
          { id: 's1' },
          {
            type: 'assistant/message',
            data: { message: { role: 'assistant', content: [{ type: 'text', text: '好' }] } },
          },
        )
        listener({ id: 's1' }, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
      }
      return () => undefined
    },
  }
  const collector = new DshTurnCollector('s1')
  const agentOptions = { provider: 'deepseek', model: 'deepseek-flash' }
  const result = await promptDshInProcess({
    ctx,
    sessionId: 's1',
    cwd: '/tmp',
    blocks: [{ type: 'text', text: 'hi' }],
    collector,
    timeoutMs: 1000,
    handles: new Map(),
    agentOptions,
  })
  assert.deepEqual(created, [{ sessionId: 's1', meta: { cwd: '/tmp' }, agentOptions }])
  assert.equal(followups.length, 1)
  assert.equal(result.text, '好')
})

test('已有会话走 resume 时同样带上 provider/model', async () => {
  const resumed: Array<{ resumeSessionId: string; agentOptions?: { provider: string; model: string } }> = []
  const agent = {
    id: 's2',
    options: { provider: 'deepseek', model: 'deepseek-flash' },
    followup() {
      return undefined
    },
    async whenIdle() {
      return undefined
    },
  }
  const ctx = {
    get(name: string) {
      if (name !== 'agents') {
        return undefined
      }
      return {
        create: async () => {
          throw new Error('session "s2" already exists')
        },
        resume: async (options: {
          resumeSessionId: string
          agentOptions?: { provider: string; model: string }
        }) => {
          resumed.push(options)
          return { agent, dispose: async () => undefined }
        },
        get: () => undefined,
      }
    },
    on() {
      return () => undefined
    },
  }
  const collector = new DshTurnCollector('s2')
  collector.pushEvent({
    type: 'assistant/message',
    data: { message: { role: 'assistant', content: [{ type: 'text', text: '续' }] } },
  })
  collector.pushEvent({ type: 'turn/end', data: { reason: { kind: 'completed' } } })
  const agentOptions = { provider: 'deepseek', model: 'deepseek-flash' }
  const result = await promptDshInProcess({
    ctx,
    sessionId: 's2',
    cwd: '/tmp',
    blocks: [{ type: 'text', text: 'hi' }],
    collector,
    timeoutMs: 1000,
    handles: new Map(),
    agentOptions,
  })
  assert.deepEqual(resumed, [{ resumeSessionId: 's2', agentOptions }])
  assert.equal(result.text, '续')
})

test('能 in-process 时对话走 ctx.agents，asar 仍可 spawn opc', () => {
  const runtime = readFileSync(join(repoRoot, 'src/kernel/main/services/dsh-runtime.ts'), 'utf8')
  assert.match(runtime, /dshTreeHasAgentFactory/)
  assert.match(runtime, /promptDshInProcess/)
  assert.match(runtime, /ensureInProcessOccupationTools/)
  assert.match(runtime, /--profile['", ]+OPC_PROFILE_NAME/)
})

test('花名册和职业工具不再占用官方 ctx.agents / ctx.tools / ctx.llm', () => {
  const agents = readFileSync(join(repoRoot, 'src/kernel/main/services/agents.ts'), 'utf8')
  const tools = readFileSync(join(repoRoot, 'src/kernel/main/services/tools.ts'), 'utf8')
  const llm = readFileSync(join(repoRoot, 'src/kernel/main/services/llm.ts'), 'utf8')
  assert.match(agents, /super\(ctx, 'roster'\)/)
  assert.match(tools, /super\(ctx, 'opcTools'\)/)
  assert.match(llm, /super\(ctx, 'completions'\)/)
  assert.match(llm, /completeViaOfficialLlm/)
  assert.doesNotMatch(agents, /super\(ctx, 'agents'\)/)
  assert.doesNotMatch(tools, /super\(ctx, 'tools'\)/)
  assert.doesNotMatch(llm, /super\(ctx, 'llm'\)/)
})
