import assert from 'node:assert/strict'
import test from 'node:test'
import { parseModulePackage } from './manifest.ts'

test('没有 ownworkbuddy.id 的包不是模块', () => {
  assert.equal(parseModulePackage(null), null)
  assert.equal(parseModulePackage({}), null)
  assert.equal(parseModulePackage({ ownworkbuddy: { title: '无 id' } }), null)
})

test('只有 dsh.bundle 的包按后台模块收下', () => {
  const manifest = parseModulePackage({
    name: '@example/ownworkbuddy-radar',
    version: '0.4.0',
    main: 'dsh-plugin.js',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  })
  assert.ok(manifest)
  assert.equal(manifest.id, 'radar')
  assert.equal(manifest.kind, 'background')
  assert.equal(manifest.main, 'dsh-plugin.js')
  assert.equal(manifest.removable, true)
  assert.deepEqual(manifest.dshBundle, { patch: './cordis.patch.yml' })
})

test('缺省字段按约定补齐', () => {
  const manifest = parseModulePackage({
    version: '2.1.0',
    main: 'dist/index.js',
    ownworkbuddy: {
      id: 'weather',
      title: '天气',
      capabilities: ['net:wttr.in', 'storage'],
      ui: 'ui.js',
    },
  })
  assert.ok(manifest)
  assert.equal(manifest!.mark, 'w')
  assert.equal(manifest!.kind, 'view')
  assert.equal(manifest!.version, '2.1.0')
  assert.equal(manifest!.group, '第三方')
  assert.equal(manifest!.order, 500)
  assert.equal(manifest!.removable, true)
  assert.equal(manifest!.main, 'dist/index.js')
  assert.deepEqual(manifest!.inject, ['bridge', 'workbench'])
  assert.deepEqual(manifest!.namespaces, ['weather'])
  assert.equal(manifest!.ui, 'ui.js')
  assert.equal(manifest!.dshBundle, undefined)
})

test('window 形态与自定义命名空间保留', () => {
  const manifest = parseModulePackage({
    ownworkbuddy: {
      id: 'x-tools',
      kind: 'window',
      mark: 'X',
      namespaces: ['xpush', 'xbridge'],
      version: '0.3.0',
    },
  })
  assert.equal(manifest?.kind, 'window')
  assert.equal(manifest?.mark, 'X')
  assert.deepEqual(manifest?.namespaces, ['xpush', 'xbridge'])
  assert.equal(manifest?.version, '0.3.0')
})

test('双写时 ownworkbuddy 决定 Panel，dsh.bundle 只当层栈声明', () => {
  const manifest = parseModulePackage({
    name: 'ownworkbuddy-hello',
    main: 'dsh-plugin.js',
    ownworkbuddy: {
      id: 'hello',
      kind: 'view',
      main: 'index.js',
      ui: 'ui.js',
    },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  })
  assert.equal(manifest?.kind, 'view')
  assert.equal(manifest?.main, 'index.js')
  assert.equal(manifest?.ui, 'ui.js')
  assert.deepEqual(manifest?.dshBundle, { patch: './cordis.patch.yml' })
})
