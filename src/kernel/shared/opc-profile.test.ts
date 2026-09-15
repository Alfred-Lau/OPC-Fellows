import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { parseDshBundle, parseDshProfile } from './dsh-manifest.ts'
import { parseModulePackage } from './manifest.ts'
import {
  dshPluginId,
  ensureOpcInboxBundles,
  ensureOpcProfile,
  healOpcProfileManifest,
  isOpcProfileManifest,
  OPC_BASE_BUNDLE,
  OPC_PROFILE_BUNDLES,
  OPC_PROFILE_NAME,
  OPC_PROFILE_PACKAGE_NAME,
  OPC_PROFILE_PATCH,
  OPC_SDK_BUNDLE,
  opcProfileManifest,
  PROFILE_PATCH_FILENAME,
  readCordisPatchList,
  syncOpcUserPatch,
  writeOpcWorkbenchPatch,
} from './opc-profile.ts'

const repoRoot = join(import.meta.dirname, '../../..')

test('仓库里的 opc profile 模板是官方形状', () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'profiles/opc/package.json'), 'utf8')) as unknown
  assert.equal((pkg as { name?: string }).name, OPC_PROFILE_PACKAGE_NAME)
  assert.equal(isOpcProfileManifest(pkg), true)
  assert.deepEqual(parseDshProfile(pkg)?.bundles, [...OPC_PROFILE_BUNDLES])
  const patch = readFileSync(join(repoRoot, 'profiles/opc/cordis.patch.yml'), 'utf8')
  assert.equal(patch.trim().endsWith('[]'), true)
  assert.equal(opcProfileManifest().dsh.profile.bundles[0], OPC_BASE_BUNDLE)
  assert.equal(opcProfileManifest().dsh.profile.bundles[1], OPC_SDK_BUNDLE)
  assert.equal(OPC_PROFILE_NAME, 'opc')
  assert.match(OPC_PROFILE_PATCH, /^[\s\S]*\n\[\]\n$/)
})

test('hello-module 双写 ownworkbuddy 与 dsh.bundle', () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'examples/hello-module/package.json'), 'utf8')) as Record<
    string,
    unknown
  >
  const manifest = parseModulePackage(pkg)
  assert.ok(manifest)
  assert.equal(manifest.id, 'hello')
  assert.equal(manifest.kind, 'view')
  assert.equal(manifest.main, 'index.js')
  assert.equal(manifest.ui, 'ui.js')
  assert.deepEqual(manifest.dshBundle, { patch: './cordis.patch.yml' })
  assert.equal(parseDshBundle(pkg)?.patch, './cordis.patch.yml')
  assert.equal((pkg as { main?: string }).main, 'dsh-plugin.js')
})

test('ensureOpcProfile 空目录落下模板，已有文件只愈合 in-box 层', () => {
  const home = mkdtempSync(join(tmpdir(), 'opc-profile-'))
  const dir = ensureOpcProfile(home)
  assert.equal(dir, join(home, 'profiles', 'opc'))
  const written = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name: string }
  assert.equal(written.name, OPC_PROFILE_PACKAGE_NAME)
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'keep-me',
        dependencies: { 'ownworkbuddy-hello': 'file:/tmp/hello' },
        dsh: { profile: { bundles: ['ownworkbuddy-hello'] } },
      },
      null,
      2,
    )}\n`,
  )
  ensureOpcProfile(home)
  const again = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    name: string
    dependencies: Record<string, string>
    dsh: { profile: { bundles: string[] } }
  }
  assert.equal(again.name, 'keep-me')
  assert.deepEqual(again.dependencies, { 'ownworkbuddy-hello': 'file:/tmp/hello' })
  assert.deepEqual(again.dsh.profile.bundles, [OPC_BASE_BUNDLE, OPC_SDK_BUNDLE, 'ownworkbuddy-hello'])
})

test('ensureOpcInboxBundles 把 sdk-app 插到 base 后面', () => {
  assert.deepEqual(ensureOpcInboxBundles(['@deepseek-ai/dsh-base', 'ownworkbuddy-hello']), [
    OPC_BASE_BUNDLE,
    OPC_SDK_BUNDLE,
    'ownworkbuddy-hello',
  ])
  assert.deepEqual(ensureOpcInboxBundles([...OPC_PROFILE_BUNDLES, 'ownworkbuddy-notes']), [
    OPC_BASE_BUNDLE,
    OPC_SDK_BUNDLE,
    'ownworkbuddy-notes',
  ])
  const healed = healOpcProfileManifest({ name: 'x', dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } })
  assert.equal(healed.changed, true)
  assert.deepEqual(parseDshProfile(healed.pkg)?.bundles, [...OPC_PROFILE_BUNDLES])
})

test('hello-module 的 dsh 插件 id 是 opc-hello', () => {
  assert.equal(dshPluginId('hello'), 'opc-hello')
  const patch = readFileSync(join(repoRoot, 'examples/hello-module/cordis.patch.yml'), 'utf8')
  assert.match(patch, /id:\s*opc-hello/)
})

test('syncOpcUserPatch 只给 dsh.bundle 模块写光杆 disabled', () => {
  const current = [
    { insert: [{ id: 'keep', name: 'x' }] },
    { id: 'opc-hello', disabled: true },
    { id: 'opc-hello', config: { a: 1 } },
  ]
  const disabled = syncOpcUserPatch(current, [
    { id: 'notes', disabled: true },
    { id: 'hello', disabled: true, dshBundle: { patch: './cordis.patch.yml' } },
  ])
  assert.deepEqual(disabled, [
    { insert: [{ id: 'keep', name: 'x' }] },
    { id: 'opc-hello', config: { a: 1 } },
    { id: 'opc-hello', disabled: true },
  ])
  const enabled = syncOpcUserPatch(disabled, [
    { id: 'hello', disabled: false, dshBundle: { patch: './cordis.patch.yml' } },
  ])
  assert.deepEqual(enabled, [{ insert: [{ id: 'keep', name: 'x' }] }, { id: 'opc-hello', config: { a: 1 } }])
})

test('writeOpcWorkbenchPatch 把停用写进 opc 用户层', () => {
  const home = mkdtempSync(join(tmpdir(), 'opc-patch-'))
  writeOpcWorkbenchPatch(home, [{ id: 'hello', disabled: true, dshBundle: { patch: './cordis.patch.yml' } }])
  const text = readFileSync(join(home, 'profiles', 'opc', PROFILE_PATCH_FILENAME), 'utf8')
  assert.deepEqual(readCordisPatchList(text), [{ id: 'opc-hello', disabled: true }])
  writeOpcWorkbenchPatch(home, [{ id: 'hello', disabled: false, dshBundle: { patch: './cordis.patch.yml' } }])
  assert.deepEqual(
    readCordisPatchList(readFileSync(join(home, 'profiles', 'opc', PROFILE_PATCH_FILENAME), 'utf8')),
    [],
  )
})
