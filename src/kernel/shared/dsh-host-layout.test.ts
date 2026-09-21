import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  canBootDshInProcess,
  dshDesktopProfileDir,
  inProcessHostBlockReason,
} from './dsh-host-layout.ts'
import { hostFastPathInvokeGate, type HostFastPathInvokeGate } from './opc-tool-bridge.ts'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')

test('asar 里不能 in-process boot dsh', () => {
  assert.equal(canBootDshInProcess('/App/Contents/Resources/app.asar'), false)
  assert.equal(inProcessHostBlockReason('/App/Contents/Resources/app.asar'), 'asar 不能动态解析 dsh 插件')
  assert.equal(canBootDshInProcess('/tmp/opc-fellows/app'), true)
})

test('Electron 独占 desktop profile', () => {
  assert.equal(dshDesktopProfileDir('/tmp/.dsh'), '/tmp/.dsh/profiles/desktop')
})

test('内置职业模块 inject opcTools，不挂官方 ctx.tools', () => {
  const modulesDir = join(repoRoot, 'src/modules')
  const files = ['social-ammo.ts']
  for (const file of files) {
    const src = readFileSync(join(modulesDir, file), 'utf8')
    assert.match(src, /inject: \[[^\]]*opcTools/, `${file} 应 inject opcTools`)
    assert.doesNotMatch(src, /inject: \[[^\]]*'tools'/, `${file} 不应 inject 官方 tools`)
  }
})

test('opc-kernel 审批桥缺 session / 缺凭据时 fail-closed', () => {
  const plugin = readFileSync(join(repoRoot, 'packages/opc-kernel/dsh-plugin.js'), 'utf8')
  assert.match(plugin, /if \(!toolName \|\| !sessionId\)/)
  assert.match(plugin, /if \(!auth\) \{\s*return 'unavailable'/)
  assert.match(plugin, /return 'unavailable'/)
  assert.match(plugin, /tools\/pre-execute/)
  assert.match(plugin, /systemPrompt\.context/)
  assert.match(plugin, /opc:turn-context/)
  assert.match(plugin, /isOccupationOwnedTool/)
  assert.match(plugin, /ctx.on\('approval\/request', \(request\) => answerApproval\(request\)\)/)
  const approval = plugin.match(/async function answerApproval\(request\) \{[\s\S]*?\n\}/)?.[0] ?? ''
  assert.match(approval, /return 'unavailable'/)
  assert.doesNotMatch(approval, /next/)
})

test('让出 dsh 已占用的服务名，同树才能挂上 dsh-base', () => {
  const agents = readFileSync(join(repoRoot, 'src/kernel/main/services/agents.ts'), 'utf8')
  const llm = readFileSync(join(repoRoot, 'src/kernel/main/services/llm.ts'), 'utf8')
  const tools = readFileSync(join(repoRoot, 'src/kernel/main/services/tools.ts'), 'utf8')
  const storage = readFileSync(join(repoRoot, 'src/kernel/main/services/storage.ts'), 'utf8')
  assert.match(agents, /super\(ctx, 'roster'\)/)
  assert.match(llm, /super\(ctx, 'completions'\)/)
  assert.match(tools, /super\(ctx, 'opcTools'\)/)
  assert.match(storage, /super\(ctx, 'moduleStore'\)/)
})

test('主进程外置 dsh runtime，不把 dsh-llm 打进 asar', () => {
  const cfg = readFileSync(join(repoRoot, 'electron.vite.config.ts'), 'utf8')
  assert.match(cfg, /externalizeDeps:\s*\{\s*include:\s*DSH_RUNTIME_PACKAGES/)
  assert.match(cfg, /@deepseek-ai\/dsh-app-boot/)
  assert.match(cfg, /@deepseek-ai\/dsh-llm/)
  assert.doesNotMatch(cfg, /main:\s*\{[^}]*plugins:\s*\[\s*externalizeDepsPlugin\(\s*\)/)
})

test('安装包带上 opc-kernel extraResources；签名身份不进仓库', () => {
  const yml = readFileSync(join(repoRoot, 'electron-builder.yml'), 'utf8')
  const brand = readFileSync(join(repoRoot, 'src/shared/brand.ts'), 'utf8')
  const main = readFileSync(join(repoRoot, 'src/main/index.ts'), 'utf8')
  const afterPack = readFileSync(join(repoRoot, 'scripts/after-pack.cjs'), 'utf8')
  const kernelPkg = readFileSync(join(repoRoot, 'packages/opc-kernel/package.json'), 'utf8')
  const hello = readFileSync(join(repoRoot, 'examples/hello-module/dsh-plugin.js'), 'utf8')
  const plugin = readFileSync(join(repoRoot, 'packages/opc-kernel/dsh-plugin.js'), 'utf8')
  assert.match(yml, /from:\s*packages\/opc-kernel/)
  assert.match(yml, /to:\s*opc-kernel/)
  assert.match(yml, /from:\s*packages\/occupation-social-ammo/)
  assert.match(yml, /to:\s*packages\/occupation-social-ammo/)
  assert.match(yml, /from:\s*packages\/occupation-kernel-work/)
  assert.match(yml, /to:\s*packages\/occupation-kernel-work/)
  assert.match(afterPack, /安装包必须带 extraResources\/dsh-host/)
  assert.match(afterPack, /occupation-\*/)
  assert.match(kernelPkg, /"peerDependencies"/)
  assert.doesNotMatch(kernelPkg, /"dependencies"\s*:\s*\{\s*"@deepseek-ai\/dsh-tools"/)
  assert.match(hello, /defineTool/)
  assert.match(hello, /hello_ping/)
  assert.match(plugin, /tools\/pre-execute/)
  const boot = readFileSync(join(repoRoot, 'src/kernel/main/boot.ts'), 'utf8')
  assert.match(boot, /executeOfficialToolIfPossible/)
  assert.match(yml, /notarize:\s*false/)
  assert.match(yml, /appId:\s*tech\.bitou\.ownworkbuddy/)
  assert.match(yml, /稳定安装身份/)
  assert.match(brand, /INSTALL_APP_ID = 'tech\.bitou\.ownworkbuddy'/)
  assert.match(main, /setAppUserModelId\(INSTALL_APP_ID\)/)
  assert.doesNotMatch(yml, /CSC_NAME|CSC_LINK/)
})

/** 拒绝分支的收窄助手：不是 reject 就直接判失败。 */
function rejectGateOf(gate: HostFastPathInvokeGate): { status: number; code: string } {
  if (gate.action !== 'reject') {
    assert.fail(`没有回合时应当 409 拒绝，实际 ${gate.action}`)
  }
  return gate
}

test('主进程快路径没有回合时只放行只读本职工具，写类一律 409', () => {
  // 接线：local-api 的快路径必须把 gate 的结论透下去，不能自己写 writeAllowed: true。
  // 只切出快路径那段，函数名搬家/换实现不会像旧断言那样平白失效。
  const localApi = readFileSync(join(repoRoot, 'src/main/local-api.ts'), 'utf8')
  const from = localApi.indexOf('if (!turn) {')
  const to = localApi.indexOf('sendJson(res, 200, { ok: true, text: result.text })', from)
  assert.ok(from >= 0 && to > from, 'local-api 里应还有「没有回合」的快路径分支')
  const fastPath = localApi.slice(from, to)
  assert.match(fastPath, /hostFastPathInvokeGate\(\{/)
  assert.match(fastPath, /writeAllowed:\s*gate\.writeAllowed/)
  assert.doesNotMatch(fastPath, /writeAllowed:\s*true/)

  const ingest = rejectGateOf(
    hostFastPathInvokeGate({
      name: 'todos_ingest',
      sessionId: '',
      turnFound: false,
      inCatalog: true,
      effect: 'write',
    }),
  )
  assert.equal(ingest.status, 409)
  assert.equal(ingest.code, 'no_turn')

  const publish = rejectGateOf(
    hostFastPathInvokeGate({
      name: 'social_publish',
      sessionId: '',
      turnFound: false,
      inCatalog: true,
      effect: 'write',
    }),
  )
  assert.equal(publish.status, 409)

  assert.deepEqual(
    hostFastPathInvokeGate({
      name: 'todos_list',
      sessionId: '',
      turnFound: false,
      inCatalog: true,
      effect: 'read',
    }),
    { action: 'read', writeAllowed: false },
  )
})
