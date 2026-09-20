import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { Service, type Context } from '@deepseek-ai/cordis'
import { dshAppInstallAnchor } from './dsh-host-layout.ts'
import {
  bootKernelTree,
  composeDesktopProfile,
  desktopBootPatches,
  parseDesktopOverlayYaml,
  rewriteOpcKernelPluginName,
} from './dsh-desktop-profile.ts'
import { openaiCompatOverlayYaml } from '../../shared/llm-overlay.ts'

class HostRoster extends Service {
  constructor(ctx: Context) {
    super(ctx, 'roster')
  }
}

class HostCompletions extends Service {
  constructor(ctx: Context) {
    super(ctx, 'completions')
  }
}

class HostOpcTools extends Service {
  constructor(ctx: Context) {
    super(ctx, 'opcTools')
  }
}

class HostModuleStore extends Service {
  constructor(ctx: Context) {
    super(ctx, 'moduleStore')
  }
}

const repoRoot = join(import.meta.dirname, '../../..')

test('Electron 独占 desktop profile：官方 loadProfileDirectory 收下 dsh-base', () => {
  const home = mkdtempSync(join(tmpdir(), 'opc-desktop-'))
  const composed = composeDesktopProfile({
    home,
    installAnchor: dshAppInstallAnchor(repoRoot),
  })
  assert.equal(composed.profile.name, 'desktop')
  assert.equal(composed.profile.dir, join(home, 'profiles', 'desktop'))
  assert.deepEqual(
    composed.profile.layers.map((layer) => layer.packageName),
    ['@deepseek-ai/dsh-base'],
  )
  const root = readFileSync(composed.configPath, 'utf8')
  assert.match(root, /^# dsh profile root[\s\S]*\n\[\]\n$/)
  const manifest = JSON.parse(readFileSync(join(composed.profile.dir, 'package.json'), 'utf8')) as {
    name?: string
    dsh?: { profile?: { bundles?: string[] } }
  }
  assert.equal(manifest.name, 'dsh-profile-desktop')
  assert.deepEqual(manifest.dsh?.profile?.bundles, ['@deepseek-ai/dsh-base'])
})

test('desktop 用户层收下 opc-kernel 补丁', () => {
  const home = mkdtempSync(join(tmpdir(), 'opc-desktop-kernel-'))
  const kernelDir = join(repoRoot, 'packages/opc-kernel')
  const composed = composeDesktopProfile({
    home,
    installAnchor: dshAppInstallAnchor(repoRoot),
    kernelDir,
  })
  const pluginPath = join(kernelDir, 'dsh-plugin.js')
  const patch = readFileSync(join(composed.profile.dir, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /id: opc-kernel/)
  assert.match(patch, new RegExp(`name: ${JSON.stringify(pluginPath)}`))
  assert.doesNotMatch(patch, /^(\s*)name:\s*ownworkbuddy-kernel\s*$/m)
  const inserted = composed.profile.patches.some((row) => {
    const insert = (row as { insert?: readonly { id?: string; name?: string }[] }).insert
    return Array.isArray(insert) && insert.some((item) => item.id === 'opc-kernel' && item.name === pathToFileURL(pluginPath).href)
  })
  assert.equal(inserted, true)
})

test('rewriteOpcKernelPluginName 把包名改成绝对入口，Electron 无 internals 也能 import', () => {
  const yaml = `- insert:\n    - id: opc-kernel\n      name: ownworkbuddy-kernel\n`
  const next = rewriteOpcKernelPluginName(yaml, '/app/packages/opc-kernel/dsh-plugin.js')
  assert.match(next, /name: "\/app\/packages\/opc-kernel\/dsh-plugin.js"/)
  assert.doesNotMatch(next, /name: ownworkbuddy-kernel/)
})

test('能 in-process 时官方 boot，宿主插件在 prepare 里挂上', async () => {
  const home = mkdtempSync(join(tmpdir(), 'opc-desktop-boot-'))
  let prepared = false
  const ctx = await bootKernelTree({
    hostRoot: repoRoot,
    dshHome: home,
    applyHost: async () => {
      prepared = true
    },
  })
  assert.equal(prepared, true)
  assert.ok(ctx.get('loader'))
  await ctx.fiber.dispose()
})

test('能 in-process 时官方 boot 挂上 dsh-base 的 llm、agents、tools', async () => {
  const home = mkdtempSync(join(tmpdir(), 'opc-desktop-base-'))
  const ctx = await bootKernelTree({
    hostRoot: repoRoot,
    dshHome: home,
    applyHost: async () => undefined,
  })
  assert.ok(ctx.get('llm'))
  assert.ok(ctx.get('tools'))
  const agents = ctx.get('agents') as { create?: unknown } | undefined
  assert.equal(typeof agents?.create, 'function')
  await ctx.fiber.dispose()
})

test('asar 不能 in-process 时仍自建 Context，宿主插件照挂', async () => {
  const home = mkdtempSync(join(tmpdir(), 'opc-desktop-asar-'))
  let prepared = false
  const ctx = await bootKernelTree({
    hostRoot: '/App/Contents/Resources/app.asar',
    dshHome: home,
    applyHost: async () => {
      prepared = true
    },
  })
  assert.equal(prepared, true)
  assert.equal(ctx.get('loader'), undefined)
  await ctx.fiber.dispose()
})

test('asar 旁 extraResources/dsh-host 仍官方 boot，不自建 Context', async () => {
  const root = mkdtempSync(join(tmpdir(), 'opc-asar-extra-'))
  const resources = join(root, 'Resources')
  mkdirSync(resources, { recursive: true })
  symlinkSync(repoRoot, join(resources, 'dsh-host'))
  const home = mkdtempSync(join(tmpdir(), 'opc-desktop-extra-'))
  const ctx = await bootKernelTree({
    hostRoot: join(resources, 'app.asar'),
    dshHome: home,
    applyHost: async () => undefined,
  })
  assert.ok(ctx.get('loader'))
  const agents = ctx.get('agents') as { create?: unknown } | undefined
  assert.equal(typeof agents?.create, 'function')
  await ctx.fiber.dispose()
})

test('bootKernel 开发态走官方 boot 树，窗托盘待办仍是宿主插件', () => {
  const boot = readFileSync(join(repoRoot, 'src/kernel/main/boot.ts'), 'utf8')
  assert.match(boot, /bootKernelTree/)
  assert.match(boot, /applyOpcKernel/)
  assert.match(boot, /installShell/)
  assert.match(boot, /resourcesPath/)
  assert.match(boot, /appPath/)
  assert.match(boot, /overlayYaml/)
  assert.match(boot, /llmOverlayYaml/)
  assert.match(boot, /DSH_PERMISSION_MODE/)
  assert.doesNotMatch(boot, /resolveDshHostRoot/)
})

test('desktop 层栈能叠上 OpenAI 兼容 overlay', () => {
  const home = mkdtempSync(join(tmpdir(), 'opc-desktop-overlay-'))
  const composed = composeDesktopProfile({
    home,
    installAnchor: dshAppInstallAnchor(repoRoot),
  })
  const overlay = openaiCompatOverlayYaml({
    apiUrl: 'https://llm.example.com/v1',
    model: 'custom-flash',
    modelLabel: 'custom-flash',
  })
  const patches = desktopBootPatches(composed.profile, home, parseDesktopOverlayYaml(overlay))
  const dumped = JSON.stringify(patches)
  assert.match(dumped, /DEEPSEEK_API_KEY/)
  assert.match(dumped, /agent-default-model/)
  assert.match(dumped, /llm\.example\.com/)
  assert.doesNotMatch(dumped, /dashscope/)
})

test('Electron 打包主进程把 desktop profile 交给官方 bareModuleBaseUrl', () => {
  const desktop = readFileSync(join(repoRoot, 'src/kernel/shared/dsh-desktop-profile.ts'), 'utf8')
  assert.match(desktop, /dshBareModuleBaseUrl/)
  assert.match(desktop, /resolveDesktopHostRoot/)
  assert.match(desktop, /resolveOpcKernelDir/)
  assert.match(desktop, /boot\([\s\S]*dshBareModuleBaseUrl\(composed\.configPath\)/)
})

test('花名册让出 dsh 已占用的服务名，同树才能挂上 dsh-base', () => {
  const agents = readFileSync(join(repoRoot, 'src/kernel/main/services/agents.ts'), 'utf8')
  const llm = readFileSync(join(repoRoot, 'src/kernel/main/services/llm.ts'), 'utf8')
  const tools = readFileSync(join(repoRoot, 'src/kernel/main/services/tools.ts'), 'utf8')
  const storage = readFileSync(join(repoRoot, 'src/kernel/main/services/storage.ts'), 'utf8')
  assert.match(agents, /super\(ctx, 'roster'\)/)
  assert.match(llm, /super\(ctx, 'completions'\)/)
  assert.match(tools, /super\(ctx, 'opcTools'\)/)
  assert.match(storage, /super\(ctx, 'moduleStore'\)/)
})

test('宿主花名册与 dsh-base 同树：roster 不抢 agents', async () => {
  const home = mkdtempSync(join(tmpdir(), 'opc-desktop-roster-'))
  const ctx = await bootKernelTree({
    hostRoot: repoRoot,
    dshHome: home,
    applyHost: async (host) => {
      await host.plugin(HostRoster)
      await host.plugin(HostCompletions)
      await host.plugin(HostOpcTools)
      await host.plugin(HostModuleStore)
    },
  })
  assert.ok(ctx.get('roster'))
  assert.ok(ctx.get('completions'))
  assert.ok(ctx.get('opcTools'))
  assert.ok(ctx.get('moduleStore'))
  const agents = ctx.get('agents') as { create?: unknown } | undefined
  assert.equal(typeof agents?.create, 'function')
  await ctx.fiber.dispose()
})
