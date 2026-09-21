import assert from 'node:assert/strict'
import test from 'node:test'
import {
  OCCUPATION_TOOL_BUNDLES,
  occupationDirsToAdd,
  occupationInsertPatchYaml,
  occupationNativeToolNames,
  occupationPackageDirs,
  occupationPackageDirsFromRoots,
  occupationPluginAddArgv,
  occupationPluginId,
  occupationSearchRoots,
} from './occupation-bundles.ts'
import { OPC_PROFILE_NAME } from './opc-profile.ts'

const repoRoot = import.meta.dirname + '/../../..'

test('开源职业包可被 dsh plugin add', () => {
  assert.deepEqual(
    OCCUPATION_TOOL_BUNDLES.map((row) => row.id),
    ['social-ammo', 'kernel-work'],
  )
  const refs = occupationPackageDirs(repoRoot)
  assert.deepEqual(refs.map((ref) => ref.id), ['social-ammo', 'kernel-work'])
  assert.deepEqual(occupationPackageDirsFromRoots([repoRoot]).map((ref) => ref.id), [
    'social-ammo',
    'kernel-work',
  ])
  assert.equal(occupationNativeToolNames().includes('todos_list'), true)
  assert.equal(occupationNativeToolNames().includes('github_status'), true)
})

test('occupationDirsToAdd 在空表上是空结果', () => {
  assert.deepEqual(occupationDirsToAdd({ dependencies: {} }, []), [])
})

test('dsh plugin add 参数走 opc profile', () => {
  assert.deepEqual(occupationPluginAddArgv(['/tmp/opc-kernel']), [
    'plugin',
    '--profile',
    OPC_PROFILE_NAME,
    'add',
    '/tmp/opc-kernel',
  ])
})

test('打包后仍从 extraResources 找 opc-kernel', () => {
  assert.deepEqual(occupationSearchRoots('/app.asar', '/Resources'), ['/app.asar', '/Resources'])
})

test('desktop 用户层 insert 用绝对入口', () => {
  assert.equal(occupationPluginId('social-ammo'), 'opc-social-ammo')
  assert.match(
    occupationInsertPatchYaml([{ id: 'social-ammo', pluginPath: '/app/packages/occupation-social-ammo/dsh-plugin.js' }]),
    /name: "\/app\/packages\/occupation-social-ammo\/dsh-plugin.js"/,
  )
})
