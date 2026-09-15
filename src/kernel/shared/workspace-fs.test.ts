import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  applyWorkspacePatch,
  globWorkspace,
  grepWorkspace,
  readWorkspaceFile,
  resolveWorkspacePath,
  runWorkspaceBash,
  writeWorkspaceFile,
} from './workspace-fs.ts'

test('工作区读写、补丁、搜索都锁在根目录里', () => {
  const root = mkdtempSync(join(tmpdir(), 'opc-ws-'))
  writeWorkspaceFile(root, 'src/hello.txt', 'alpha\n')
  assert.equal(readWorkspaceFile(root, 'src/hello.txt'), 'alpha\n')
  assert.equal(applyWorkspacePatch(root, 'src/hello.txt', 'alpha', 'beta'), '已写入 src/hello.txt')
  assert.equal(readWorkspaceFile(root, 'src/hello.txt'), 'beta\n')
  assert.deepEqual(globWorkspace(root, '**/*.txt'), ['src/hello.txt'])
  assert.equal(grepWorkspace(root, 'beta')[0]?.includes('src/hello.txt:1:beta'), true)
  assert.throws(() => resolveWorkspacePath(root, '../escape.txt'), /超出工作区/)
})

test('bash 能跑普通命令，拒绝 rm -rf 和 sudo', () => {
  const root = mkdtempSync(join(tmpdir(), 'opc-sh-'))
  writeFileSync(join(root, 'note.txt'), 'ok')
  const out = runWorkspaceBash(root, 'echo hello')
  assert.match(out, /hello/)
  assert.match(out, /exit 0/)
  assert.throws(() => runWorkspaceBash(root, 'sudo ls'), /太危险/)
  assert.throws(() => runWorkspaceBash(root, 'rm -rf /'), /太危险/)
})
