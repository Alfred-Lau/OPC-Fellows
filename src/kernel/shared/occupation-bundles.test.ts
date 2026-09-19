import assert from 'node:assert/strict'
import test from 'node:test'
import {
  OCCUPATION_TOOL_BUNDLES,
  occupationDirsToAdd,
  occupationPackageDirs,
  occupationPackageDirsFromRoots,
  occupationPluginAddArgv,
  occupationSearchRoots,
} from './occupation-bundles.ts'
import { OPC_PROFILE_NAME } from './opc-profile.ts'

const repoRoot = import.meta.dirname + '/../../..'

test('开源版不再附带 occupation 职业包', () => {
  assert.equal(OCCUPATION_TOOL_BUNDLES.length, 0)
  assert.deepEqual(occupationPackageDirs(repoRoot), [])
  assert.deepEqual(occupationPackageDirsFromRoots([repoRoot]), [])
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
