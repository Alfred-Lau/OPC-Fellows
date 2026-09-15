import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  addNote,
  loadNotes,
  notesPathFromEnv,
  OPC_USER_DATA_ENV,
  removeNote,
  writeNoteDocument,
} from '../../../packages/occupation-notes/note-file.js'
import { OPC_USER_DATA_ENV as hostEnv } from './opc-profile.ts'

test('OPC_USER_DATA 环境名和 occupation-notes 包一致', () => {
  assert.equal(OPC_USER_DATA_ENV, hostEnv)
  assert.equal(notesPathFromEnv({ [OPC_USER_DATA_ENV]: '/tmp/opc-data' }), join('/tmp/opc-data', 'notes.json'))
  assert.throws(() => notesPathFromEnv({}), /OPC_USER_DATA/)
})

test('occupation-notes 插件能 resolve 官方 defineTool', async () => {
  const plugin = await import('../../../packages/occupation-notes/dsh-plugin.js')
  assert.equal(typeof plugin.apply, 'function')
  assert.deepEqual(plugin.inject, ['tools'])
})

test('随手记 JSON 增删不依赖 Electron', () => {
  const dir = mkdtempSync(join(tmpdir(), 'opc-notes-'))
  const path = join(dir, 'notes.json')
  assert.deepEqual(loadNotes(path), [])
  assert.equal(addNote(path, '   '), null)
  const item = addNote(path, ' 买牛奶 ')
  assert.ok(item)
  assert.equal(item.text, '买牛奶')
  const listed = loadNotes(path)
  assert.equal(listed.length, 1)
  assert.equal(listed[0]?.text, '买牛奶')
  const written = JSON.parse(readFileSync(path, 'utf8')) as unknown[]
  assert.equal(written.length, 1)
  assert.equal(removeNote(path, item.id), true)
  assert.deepEqual(loadNotes(path), [])
  assert.equal(removeNote(path, item.id), false)
})

test('项目文件夹里会落下随手记文档副本', () => {
  const dir = mkdtempSync(join(tmpdir(), 'opc-notes-doc-'))
  const path = writeNoteDocument(dir, '买牛奶', '2026-09-15T03:00:00.000Z', 'ab-cd-ef')
  assert.ok(path)
  assert.match(path, /notes\/2026-09-15T03-00-00-000-abcdef\.md$/)
  const body = readFileSync(path, 'utf8')
  assert.match(body, /买牛奶/)
  assert.equal(writeNoteDocument(dir, '  ', '2026-09-15T03:00:00.000Z', 'x'), null)
})
