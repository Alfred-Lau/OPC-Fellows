import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { moduleAssetUrl, parseModuleAssetUrl, resolveModuleAsset } from './module-protocol.ts'

test('模块资源地址能来回解析', () => {
  const url = moduleAssetUrl('hello', 'ui.js')
  assert.equal(parseModuleAssetUrl(url)?.moduleId, 'hello')
  assert.equal(parseModuleAssetUrl(url)?.file, 'ui.js')
  assert.equal(parseModuleAssetUrl(moduleAssetUrl('hello', 'assets/x.png'))?.file, 'assets/x.png')
})

test('坏地址返回 null', () => {
  assert.equal(parseModuleAssetUrl('https://example.com/x'), null)
  assert.equal(parseModuleAssetUrl('owb-module://mod/only-id'), null)
})

test('模块资源不能逃出自己的目录', () => {
  const root = resolve('/tmp/modules/hello')
  assert.equal(resolveModuleAsset(root, 'ui.js'), resolve(root, 'ui.js'))
  assert.equal(resolveModuleAsset(root, '../other/secret.js'), null)
  assert.equal(resolveModuleAsset(root, '..'), null)
  assert.equal(resolveModuleAsset(root, ''), null)
})
