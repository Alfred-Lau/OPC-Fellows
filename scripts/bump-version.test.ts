import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { bumpPatch, bumpWorkspaceVersion, replaceCurrentReleaseRefs } from './bump-version.mjs'

test('bumpPatch 升小版本第三位', () => {
  assert.equal(bumpPatch('0.8.0'), '0.8.1')
  assert.equal(bumpPatch('0.8.9'), '0.8.10')
  assert.equal(bumpPatch('1.0.0'), '1.0.1')
})

test('bumpPatch 拒绝非 x.y.z', () => {
  assert.throws(() => bumpPatch('0.8'), /不支持的版本号/)
  assert.throws(() => bumpPatch('0.8.0-beta'), /不支持的版本号/)
})

test('replaceCurrentReleaseRefs 只改当前发版链接', () => {
  const src = [
    '用 [v0.8.0](https://github.com/Alfred-Lau/OPC-Fellows/releases/tag/v0.8.0)。',
    '- [dmg](https://github.com/Alfred-Lau/OPC-Fellows/releases/download/v0.8.0/OPC-Fellows-0.8.0-mac-arm64.dmg)',
    '**从 v0.7.3 升级注意：** 旧数据还在。',
  ].join('\n')

  const out = replaceCurrentReleaseRefs(src, '0.8.0', '0.8.1')
  assert.match(out, /\[v0\.8\.1\]/)
  assert.match(out, /releases\/tag\/v0\.8\.1/)
  assert.match(out, /OPC-Fellows-0\.8\.1-mac-arm64\.dmg/)
  assert.match(out, /从 v0\.7\.3 升级/)
  assert.doesNotMatch(out, /releases\/tag\/v0\.8\.0/)
})

test('bumpWorkspaceVersion 同步根包、内核包和 README', () => {
  const root = mkdtempSync(join(tmpdir(), 'opc-bump-'))
  mkdirSync(join(root, 'packages', 'opc-kernel'), { recursive: true })
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name: 'ownworkbuddy', version: '0.8.0' }, null, 2)}\n`)
  writeFileSync(
    join(root, 'packages', 'opc-kernel', 'package.json'),
    `${JSON.stringify({ name: 'ownworkbuddy-kernel', version: '0.8.0' }, null, 2)}\n`,
  )
  writeFileSync(
    join(root, 'README.md'),
    '[v0.8.0](https://github.com/Alfred-Lau/OPC-Fellows/releases/tag/v0.8.0)\n',
  )
  writeFileSync(
    join(root, 'README.zh-CN.md'),
    '下载 [v0.8.0](https://github.com/Alfred-Lau/OPC-Fellows/releases/tag/v0.8.0)\n从 v0.7.3 升级\n',
  )

  assert.deepEqual(bumpWorkspaceVersion(root), { previous: '0.8.0', next: '0.8.1' })
  assert.equal(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, '0.8.1')
  assert.equal(
    JSON.parse(readFileSync(join(root, 'packages', 'opc-kernel', 'package.json'), 'utf8')).version,
    '0.8.1',
  )
  assert.match(readFileSync(join(root, 'README.md'), 'utf8'), /v0\.8\.1/)
  assert.match(readFileSync(join(root, 'README.zh-CN.md'), 'utf8'), /v0\.8\.1/)
  assert.match(readFileSync(join(root, 'README.zh-CN.md'), 'utf8'), /v0\.7\.3/)
})

test('bumpWorkspaceVersion 在包版本不一致时失败', () => {
  const root = mkdtempSync(join(tmpdir(), 'opc-bump-mismatch-'))
  mkdirSync(join(root, 'packages', 'opc-kernel'), { recursive: true })
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ version: '0.8.0' }, null, 2)}\n`)
  writeFileSync(
    join(root, 'packages', 'opc-kernel', 'package.json'),
    `${JSON.stringify({ version: '0.7.3' }, null, 2)}\n`,
  )
  writeFileSync(join(root, 'README.md'), '')
  writeFileSync(join(root, 'README.zh-CN.md'), '')
  assert.throws(() => bumpWorkspaceVersion(root), /不一致/)
})
