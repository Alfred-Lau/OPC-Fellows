import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { composerContextChip, contextFileFromPath, folderLabel } from './project-context-ui.ts'

const here = dirname(fileURLToPath(import.meta.url))

function source(rel: string): string {
  return readFileSync(join(here, rel), 'utf8')
}

test('海框展示层用字符串拆目录名，不依赖 node:path', () => {
  assert.equal(folderLabel('/Users/yu/申城'), '申城')
  assert.equal(folderLabel('/Users/yu/申城/'), '申城')
  assert.equal(folderLabel('C:\\work\\申城'), '申城')
  assert.deepEqual(composerContextChip({ folderPath: '/Users/yu/申城', hostName: 'opc.local' }), {
    kind: 'folder',
    label: '申城',
    title: '/Users/yu/申城',
  })
  assert.deepEqual(contextFileFromPath('/tmp/申城/readme.md'), {
    path: '/tmp/申城/readme.md',
    name: 'readme.md',
  })
})

test('渲染进程项目上下文不能 import 带 node:path 的模块', () => {
  assert.doesNotMatch(source('project-context-ui.ts'), /from ['"]node:path['"]/)
  assert.doesNotMatch(source('new-task.ts'), /project-context\.ts/)
  assert.doesNotMatch(source('agents.ts'), /project-context\.ts/)
  assert.match(source('new-task.ts'), /project-context-ui/)
  assert.match(source('agents.ts'), /project-context-ui/)
  const studio = source('../../../src/renderer/src/studio.ts')
  assert.doesNotMatch(studio, /project-context['"]/)
  assert.match(studio, /project-context-ui/)
})
