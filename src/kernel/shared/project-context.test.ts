import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import type { ThreadRecord } from './agent.ts'
import {
  canBindProjectFolder,
  commonParentFolder,
  composeAttachedFilesPrompt,
  composeWorkspaceSystemHint,
  composerContextChip,
  composerContextMenuItems,
  contextFileFromPath,
  filterFilesInsideFolder,
  folderLabel,
  isPathInside,
  noteDocumentBody,
  noteDocumentFileName,
  planAttachProjectFiles,
  planClearProjectFolder,
  planDetachProjectFile,
  planSetProjectFolder,
  relativeToFolder,
  resolveProjectCwd,
  shouldRestartDsh,
  shouldWriteWorkspaceDocument,
} from './project-context.ts'

const clock = '2026-09-15T03:00:00.000Z'

function project(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
  return {
    id: 'thread:user:poem',
    title: '古诗图文素材',
    kind: 'user',
    agentIds: ['rumi'],
    workspaceAgentId: 'rumi',
    createdAt: clock,
    updatedAt: clock,
    ...overrides,
  }
}

test('海框芯片：有文件夹显示目录名，否则显示本机名', () => {
  assert.equal(folderLabel('/Users/yu/申城'), '申城')
  assert.deepEqual(composerContextChip({ folderPath: '/Users/yu/申城', hostName: 'example-mac.local' }), {
    kind: 'folder',
    label: '申城',
    title: '/Users/yu/申城',
  })
  assert.equal(composerContextChip({ hostName: '申城' }).kind, 'host')
  assert.equal(composerContextChip({ hostName: '申城' }).label, '申城')
})

test('海框下拉：文件夹、文件、引用技能；绑了目录才出现清除', () => {
  const idle = composerContextMenuItems({ allowWorkspace: true })
  assert.deepEqual(
    idle.map((item) => item.action),
    ['pick-folder', 'pick-files', 'cite-skill'],
  )
  assert.match(idle[0]?.hint ?? '', /dsh/)
  const bound = composerContextMenuItems({
    allowWorkspace: true,
    folderPath: '/tmp/申城',
    files: [{ path: '/tmp/申城/readme.md', name: 'readme.md' }],
  })
  assert.equal(bound.some((item) => item.action === 'clear-folder'), true)
  assert.equal(bound.some((item) => item.action === 'detach-file' && item.path?.endsWith('readme.md')), true)
  const inbox = composerContextMenuItems({ allowWorkspace: false })
  assert.match(inbox[0]?.hint ?? '', /今日不是项目/)
})

test('路径必须落在项目文件夹内', () => {
  const root = '/tmp/opc-project'
  assert.equal(isPathInside(root, '/tmp/opc-project/src/app.ts'), true)
  assert.equal(isPathInside(root, '/tmp/opc-project'), true)
  assert.equal(isPathInside(root, '/tmp/other/app.ts'), false)
  assert.equal(isPathInside(root, '/tmp/opc-project/../secret'), false)
  assert.equal(relativeToFolder(root, '/tmp/opc-project/docs/a.md'), 'docs/a.md')
  assert.equal(relativeToFolder(root, '/etc/passwd'), null)
})

test('选文件夹只改项目 / 主对话，今日不行', () => {
  const inbox: ThreadRecord = {
    id: 'thread:inbox',
    title: '今日',
    kind: 'inbox',
    agentIds: [],
    createdAt: clock,
    updatedAt: clock,
  }
  assert.equal(canBindProjectFolder(inbox), false)
  const denied = planSetProjectFolder([inbox], inbox.id, '/tmp/申城')
  assert.equal(denied.ok, false)
  if (!denied.ok) {
    assert.match(denied.error, /今日不是项目/)
  }

  const set = planSetProjectFolder([project()], 'thread:user:poem', '/tmp/申城/ ')
  assert.equal(set.ok, true)
  if (set.ok) {
    assert.equal(set.thread.folderPath, resolve('/tmp/申城'))
  }

  const cleared = planClearProjectFolder([project({ folderPath: '/tmp/申城' })], 'thread:user:poem')
  assert.equal(cleared.ok, true)
  if (cleared.ok) {
    assert.equal(cleared.thread.folderPath, undefined)
    assert.equal(cleared.thread.attachedFiles, undefined)
  }
})

test('选文件会绑到共同父目录，并丢掉目录外的引用', () => {
  const dir = mkdtempSync(join(tmpdir(), 'opc-ctx-'))
  const inside = join(dir, 'a.md')
  const nested = join(dir, 'docs', 'b.md')
  const attached = planAttachProjectFiles([project()], 'thread:user:poem', [inside, nested])
  assert.equal(attached.ok, true)
  if (attached.ok) {
    assert.equal(attached.thread.folderPath, dir)
    assert.equal(attached.thread.attachedFiles?.length, 2)
  }

  const outside = planAttachProjectFiles(
    [project({ folderPath: dir, attachedFiles: [{ path: inside, name: 'a.md' }] })],
    'thread:user:poem',
    ['/tmp/not-this/x.md'],
  )
  assert.equal(outside.ok, false)

  const kept = filterFilesInsideFolder(dir, [
    { path: inside, name: 'a.md' },
    { path: '/tmp/other.md', name: 'other.md' },
  ])
  assert.deepEqual(
    kept.map((file) => file.name),
    ['a.md'],
  )
  assert.equal(commonParentFolder([inside, nested]), dir)
  assert.equal(contextFileFromPath(inside)?.name, 'a.md')

  const detached = planDetachProjectFile(
    [project({ folderPath: dir, attachedFiles: [{ path: inside, name: 'a.md' }] })],
    'thread:user:poem',
    inside,
  )
  assert.equal(detached.ok, true)
  if (detached.ok) {
    assert.equal(detached.thread.attachedFiles, undefined)
    assert.equal(detached.thread.folderPath, dir)
  }
})

test('dsh cwd：项目文件夹优先于成员工作区；换目录要重启进程', () => {
  assert.equal(
    resolveProjectCwd({
      folderPath: '/tmp/申城',
      agentWorkspace: '/tmp/userData/workspaces/rumi',
      fallback: '/tmp/userData',
    }),
    resolve('/tmp/申城'),
  )
  assert.equal(
    resolveProjectCwd({
      agentWorkspace: '/tmp/userData/workspaces/rumi',
      fallback: '/tmp/userData',
    }),
    resolve('/tmp/userData/workspaces/rumi'),
  )
  assert.equal(shouldRestartDsh('', '/tmp/a'), false)
  assert.equal(shouldRestartDsh('/tmp/a', '/tmp/a/'), false)
  assert.equal(shouldRestartDsh('/tmp/a', '/tmp/b'), true)
  assert.equal(shouldWriteWorkspaceDocument('/tmp/申城', '/tmp/userData'), true)
  assert.equal(shouldWriteWorkspaceDocument('/tmp/userData', '/tmp/userData'), false)
})

test('人设和引用文件都声明工作目录', () => {
  const hint = composeWorkspaceSystemHint('/tmp/申城')
  assert.match(hint, /\/tmp\/申城/)
  assert.match(hint, /dsh-fs/)
  const prompt = composeAttachedFilesPrompt('/tmp/申城', [
    { path: '/tmp/申城/readme.md', name: 'readme.md', text: '# hi' },
    { path: '/tmp/申城/shot.png', name: 'shot.png', omitted: '不是文本' },
  ])
  assert.match(prompt, /readme\.md/)
  assert.match(prompt, /# hi/)
  assert.match(prompt, /shot\.png/)
  assert.match(noteDocumentFileName('2026-09-15T03:00:00.000Z', 'ab-cd-ef'), /2026-09-15T03-00-00-000-abcdef/)
  assert.match(noteDocumentBody('买牛奶', clock), /买牛奶/)
})

test('输入框 HTML 有项目上下文菜单', () => {
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../renderer/index.html'), 'utf8')
  assert.match(html, /id="composer-context"/)
  assert.match(html, /id="composer-context-menu"/)
  assert.match(html, /id="task-context"/)
  assert.match(html, /id="task-context-menu"/)
  assert.match(html, /id="composer-attachments"/)
})
