import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { load } from 'js-yaml'
import { parseDshBundle } from './dsh-manifest.ts'
import {
  assertKernelInserts,
  KERNEL_PLUGIN_IDS,
  KERNEL_PLUGINS,
  parseKernelInserts,
} from './kernel-bundle.ts'

const repoRoot = join(import.meta.dirname, '../../..')

test('内核 patch 与 KERNEL_PLUGINS 顺序一致', () => {
  const parsed = load(readFileSync(join(repoRoot, 'src/kernel/cordis.patch.yml'), 'utf8'))
  const rows = parseKernelInserts(parsed)
  assertKernelInserts(rows)
  assert.deepEqual(
    rows.map((row) => row.id),
    [...KERNEL_PLUGIN_IDS],
  )
  assert.equal(KERNEL_PLUGINS[0]?.id, 'opc-bridge')
  assert.equal(KERNEL_PLUGINS.at(-1)?.id, 'opc-agents')
})

test('内核标记包是 dsh.bundle', () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'packages/opc-kernel/package.json'), 'utf8')) as unknown
  assert.deepEqual(parseDshBundle(pkg), { patch: './cordis.patch.yml' })
  const patch = load(readFileSync(join(repoRoot, 'packages/opc-kernel/cordis.patch.yml'), 'utf8'))
  assert.deepEqual(parseKernelInserts(patch), [{ id: 'opc-kernel', name: 'ownworkbuddy-kernel' }])
})

test('内核 patch 不是数组就抛', () => {
  assert.throws(() => parseKernelInserts({}), /YAML 数组/)
})
