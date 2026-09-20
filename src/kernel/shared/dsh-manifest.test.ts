import assert from 'node:assert/strict'
import test from 'node:test'
import {
  moduleIdFromPackageName,
  modulePackageShape,
  parseDshBundle,
  parseDshProfile,
  reconcileProfileBundles,
} from './dsh-manifest.ts'

test('dsh.bundle 只认非空 patch 路径', () => {
  assert.equal(parseDshBundle(null), null)
  assert.equal(parseDshBundle({}), null)
  assert.equal(parseDshBundle({ dsh: { bundle: {} } }), null)
  assert.deepEqual(parseDshBundle({ dsh: { bundle: { patch: ' ./cordis.patch.yml ' } } }), {
    patch: './cordis.patch.yml',
  })
})

test('dsh.profile.bundles 丢掉空名', () => {
  assert.equal(parseDshProfile({}), null)
  assert.deepEqual(
    parseDshProfile({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '', 'ownworkbuddy-hello'] } } }),
    { bundles: ['@deepseek-ai/dsh-base', 'ownworkbuddy-hello'] },
  )
})

test('模块形状：ownworkbuddy、dsh.bundle、双写', () => {
  assert.equal(modulePackageShape({}), 'none')
  assert.equal(modulePackageShape({ ownworkbuddy: { id: 'hello' } }), 'ownworkbuddy')
  assert.equal(modulePackageShape({ dsh: { bundle: { patch: './cordis.patch.yml' } } }), 'dsh-bundle')
  assert.equal(
    modulePackageShape({
      ownworkbuddy: { id: 'hello' },
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }),
    'both',
  )
})

test('从包名收模块 id', () => {
  assert.equal(moduleIdFromPackageName(undefined), null)
  assert.equal(moduleIdFromPackageName('@example/ownworkbuddy-hello'), 'hello')
  assert.equal(moduleIdFromPackageName('opc-notes'), 'notes')
  assert.equal(moduleIdFromPackageName('weather'), 'weather')
})

test('reconcile：新 bundle 依赖进层栈，卸掉的离开，in-box 层不动', () => {
  const added = reconcileProfileBundles({
    bundles: ['@deepseek-ai/dsh-base'],
    dependencies: ['ownworkbuddy-hello'],
    beforeDeps: [],
    isBundle: (name) => name === 'ownworkbuddy-hello',
  })
  assert.deepEqual(added.bundles, ['@deepseek-ai/dsh-base', 'ownworkbuddy-hello'])
  assert.equal(added.changed, true)

  const removed = reconcileProfileBundles({
    bundles: ['@deepseek-ai/dsh-base', 'ownworkbuddy-hello'],
    dependencies: [],
    beforeDeps: ['ownworkbuddy-hello'],
    isBundle: () => false,
  })
  assert.deepEqual(removed.bundles, ['@deepseek-ai/dsh-base'])
  assert.equal(removed.changed, true)

  const untouched = reconcileProfileBundles({
    bundles: ['@deepseek-ai/dsh-base'],
    dependencies: ['left-pad'],
    beforeDeps: [],
    isBundle: () => false,
  })
  assert.deepEqual(untouched.bundles, ['@deepseek-ai/dsh-base'])
  assert.equal(untouched.changed, false)
})
