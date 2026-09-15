import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import {
  defaultProfile,
  normalizeProfile,
  profileHasIdentity,
  profileLabel,
  profileLegacyRoots,
  shouldAdoptProfile,
} from './profile.ts'

test('空输入回落到默认档案', () => {
  assert.deepEqual(normalizeProfile(null), defaultProfile())
})

test('显示名会去空白并截断', () => {
  const next = normalizeProfile({ displayName: `  阿宁${'啊'.repeat(50)}  `, avatarPath: '/tmp/a.png' })
  assert.equal(next.displayName.length, 40)
  assert.equal(next.displayName.startsWith('阿宁'), true)
  assert.equal(next.avatarPath, '/tmp/a.png')
})

test('没有显示名时用机器名', () => {
  assert.equal(profileLabel(defaultProfile(), 'opc.local'), 'opc.local')
  assert.equal(profileLabel({ displayName: '阿宁', avatarPath: '' }, 'opc.local'), '阿宁')
})

test('当前档案是空的才认领旧目录里的称呼和头像', () => {
  const empty = defaultProfile()
  const saved = { displayName: '硬核老 K', avatarPath: '/tmp/a.png' }
  assert.equal(profileHasIdentity(empty), false)
  assert.equal(shouldAdoptProfile(empty, saved), true)
  assert.equal(shouldAdoptProfile(saved, { displayName: '别人', avatarPath: '' }), false)
})

test('旧 userData 目录不含当前目录自己', () => {
  const appData = '/Users/me/Library/Application Support'
  const current = join(appData, 'OPC Agent Team - Solokit')
  assert.deepEqual(profileLegacyRoots(appData, current, ['ownworkbuddy', 'OPC Agent Team - Solokit']), [
    join(appData, 'ownworkbuddy'),
  ])
})
