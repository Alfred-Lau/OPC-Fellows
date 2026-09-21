import assert from 'node:assert/strict'
import test from 'node:test'
import { chmodSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  MEMBER_CONTEXT_DIR,
  memberContextPath,
  readMemberContext,
  readMemberPreset,
  writeMemberContext,
  writeMemberPreset,
} from './member-preset.ts'

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

test('回合上下文写 0600；内容没变也要把过宽权限收回来', () => {
  const dir = mkdtempSync(join(tmpdir(), 'opc-preset-mode-'))
  try {
    writeMemberContext(dir, 'opc:inbox:ammo', '当前项目工作目录是 /tmp/site。')
    const path = memberContextPath(dir, 'opc:inbox:ammo')
    assert.equal(statSync(path).mode & 0o777, 0o600)
    const contexts = statSync(join(dir, MEMBER_CONTEXT_DIR))
    assert.equal(contexts.mode & 0o077, 0, 'kernel/contexts 不能给 group / other 任何权限')

    // 内容相同走提前返回的分支：也必须 chmod 回来。
    chmodSync(path, 0o644)
    assert.equal(statSync(path).mode & 0o777, 0o644)
    writeMemberContext(dir, 'opc:inbox:ammo', '当前项目工作目录是 /tmp/site。')
    assert.equal(statSync(path).mode & 0o777, 0o600)
    assert.equal(readMemberContext(dir, 'opc:inbox:ammo'), '当前项目工作目录是 /tmp/site。')

    // 覆盖已有文件的分支同样 0600。
    writeMemberContext(dir, 'opc:inbox:ammo', '换了上下文。')
    assert.equal(statSync(path).mode & 0o777, 0o600)
    assert.equal(readMemberContext(dir, 'opc:inbox:ammo'), '换了上下文。')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
