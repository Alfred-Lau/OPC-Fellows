import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readMemberContext, readMemberPreset, writeMemberContext, writeMemberPreset } from './member-preset.ts'

test('人设和回合上下文分文件写', () => {
  const dir = mkdtempSync(join(tmpdir(), 'opc-preset-'))
  try {
    writeMemberPreset(dir, 'opc:inbox:ammo', '你是弹药手。')
    writeMemberContext(dir, 'opc:inbox:ammo', '当前项目工作目录是 /tmp/site。')
    assert.equal(readMemberPreset(dir, 'opc:inbox:ammo'), '你是弹药手。')
    assert.equal(readMemberContext(dir, 'opc:inbox:ammo'), '当前项目工作目录是 /tmp/site。')
    writeMemberContext(dir, 'opc:inbox:ammo', '')
    assert.equal(readMemberContext(dir, 'opc:inbox:ammo'), '')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
