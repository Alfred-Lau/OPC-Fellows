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
  assert.match(afterPack, /安装包必须带 extraResources\/dsh-host/)
  assert.match(kernelPkg, /"peerDependencies"/)
  assert.doesNotMatch(kernelPkg, /"dependencies"\s*:\s*\{\s*"@deepseek-ai\/dsh-tools"/)
  assert.match(hello, /defineTool/)
  assert.match(hello, /hello_ping/)
  assert.match(plugin, /tools\/pre-execute/)
  assert.match(yml, /notarize:\s*false/)
  assert.match(yml, /appId:\s*tech\.bitou\.ownworkbuddy/)
  assert.match(yml, /稳定安装身份/)
  assert.match(brand, /INSTALL_APP_ID = 'tech\.bitou\.ownworkbuddy'/)
  assert.match(main, /setAppUserModelId\(INSTALL_APP_ID\)/)
  assert.doesNotMatch(yml, /CSC_NAME|CSC_LINK/)
})
