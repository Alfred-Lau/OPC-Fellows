import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { load } from 'js-yaml'
import { parseDshBundle } from './dsh-manifest.ts'
import { parseModulePackage } from './manifest.ts'
import {
  OCCUPATION_DSH_BUNDLE,
  OCCUPATION_TOOL_BUNDLES,
  occupationDirsToAdd,
  occupationPackageDirs,
  occupationPackageDirsFromRoots,
  occupationPluginAddArgv,
  occupationSearchRoots,
} from './occupation-bundles.ts'
import { dshPluginId, OPC_PROFILE_NAME } from './opc-profile.ts'

const repoRoot = join(import.meta.dirname, '../../..')

test('四个带 ctx.tools 的职业都有可 add 进 opc 的 dsh.bundle 包', () => {
  assert.equal(OCCUPATION_TOOL_BUNDLES.length, 4)
  const refs = occupationPackageDirs(repoRoot)
  assert.equal(refs.length, 4)
  for (const row of OCCUPATION_TOOL_BUNDLES) {
    const ref = refs.find((item) => item.id === row.id)
    assert.ok(ref, row.id)
    const pkg = JSON.parse(readFileSync(join(ref.dir, 'package.json'), 'utf8')) as Record<string, unknown>
    assert.equal(pkg.name, row.packageName)
    assert.equal(pkg.main, 'dsh-plugin.js')
    assert.deepEqual(parseDshBundle(pkg), OCCUPATION_DSH_BUNDLE)
    const parsed = parseModulePackage(pkg)
    assert.ok(parsed)
    assert.equal(parsed.kind, 'background')
    assert.deepEqual(parsed.dshBundle, OCCUPATION_DSH_BUNDLE)
    const patch = load(readFileSync(join(ref.dir, 'cordis.patch.yml'), 'utf8'))
    assert.deepEqual(patch, [
      { insert: [{ id: dshPluginId(row.id), name: row.packageName }] },
    ])
    const plugin = readFileSync(join(ref.dir, 'dsh-plugin.js'), 'utf8')
    if (row.id === 'notes') {
      assert.match(plugin, /notes_add/)
      assert.match(plugin, /defineTool/)
      assert.match(plugin, /from '@deepseek-ai\/dsh-tools'/)
    } else {
      assert.match(plugin, /export default function apply/)
    }
  }
})

test('occupationDirsToAdd 跳过已经在 opc dependencies 里的包', () => {
  const refs = occupationPackageDirs(repoRoot)
  assert.deepEqual(
    occupationDirsToAdd({ dependencies: {} }, refs),
    refs.map((ref) => ref.dir),
  )
  const first = refs[0]
  assert.ok(first)
  assert.deepEqual(occupationDirsToAdd({ dependencies: { [first.name]: `file:${first.dir}` } }, refs), [
    ...refs.slice(1).map((ref) => ref.dir),
  ])
})

test('dsh plugin add 参数走 opc profile', () => {
  assert.deepEqual(occupationPluginAddArgv(['/tmp/occupation-notes']), [
    'plugin',
    '--profile',
    OPC_PROFILE_NAME,
    'add',
    '/tmp/occupation-notes',
  ])
})

test('打包后职业包从 extraResources 找，asar 根可以没有 packages/', () => {
  assert.deepEqual(occupationSearchRoots('/app.asar', '/Resources'), ['/app.asar', '/Resources'])
  const refs = occupationPackageDirsFromRoots(['/missing', repoRoot])
  assert.equal(refs.length, 4)
  assert.ok(refs.every((ref) => ref.dir.startsWith(join(repoRoot, 'packages'))))
})

test('内置职业模块声明了同一份 dsh.bundle，停用才能回写 opc', () => {
  for (const row of OCCUPATION_TOOL_BUNDLES) {
    const src = readFileSync(join(repoRoot, 'src/modules', `${row.id}.ts`), 'utf8')
    assert.match(src, /OCCUPATION_DSH_BUNDLE/)
  }
})
