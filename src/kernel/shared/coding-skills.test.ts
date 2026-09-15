import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { composeRepoBrief } from './coding-context.ts'
import {
  HOST_EXECUTION_SKILL_IDS,
  codingSystemHint,
  hasWorkspaceWriteTools,
  isCodingFastPath,
  skipsPlanGate,
} from './coding-skills.ts'

test('编码口令走快路径；问清楚跳过计划门但不算改代码', () => {
  assert.equal(isCodingFastPath('改代码'), true)
  assert.equal(isCodingFastPath('先写测试'), true)
  assert.equal(isCodingFastPath('审查改动'), true)
  assert.equal(isCodingFastPath('排查登录失败'), true)
  assert.equal(isCodingFastPath('改这一处'), true)
  assert.equal(isCodingFastPath('问清楚'), false)
  assert.equal(skipsPlanGate('问清楚'), true)
  assert.equal(skipsPlanGate('先看看再说'), false)
})

test('有工作区写工具才给人设编码纪律', () => {
  assert.equal(codingSystemHint(false), '')
  assert.match(codingSystemHint(true), /红绿/)
  assert.match(codingSystemHint(true), /mattpocock\/skills/)
  assert.equal(hasWorkspaceWriteTools([{ name: 'todos_list' }]), false)
  assert.equal(hasWorkspaceWriteTools([{ name: 'apply_patch' }]), true)
  assert.deepEqual([...HOST_EXECUTION_SKILL_IDS], [
    'research-brief',
    'verify-loop',
    'grill-change',
    'ship-change',
    'tdd',
    'code-review',
    'diagnose-bug',
  ])
})

test('仓库简报读脚本名和 CONTEXT，不编不存在的文件', () => {
  const root = mkdtempSync(join(tmpdir(), 'opc-brief-'))
  mkdirSync(join(root, 'src'))
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ packageManager: 'pnpm@10.0.0', scripts: { test: 'node --test', lint: 'echo' } }),
  )
  writeFileSync(join(root, 'CONTEXT.md'), '模块是能力包，成员是身份。')
  const brief = composeRepoBrief(root)
  assert.match(brief, /pnpm/)
  assert.match(brief, /test/)
  assert.match(brief, /模块是能力包/)
  assert.match(brief, /src/)
  assert.equal(composeRepoBrief(join(root, 'missing')), '')
})
