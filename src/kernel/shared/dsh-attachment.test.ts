import assert from 'node:assert/strict'
import test from 'node:test'
import { attachmentImageMime, citeAttachments, composeAttachmentCiteText } from './dsh-attachment.ts'

test('附件只进路径指针，不把正文拼进用户话', () => {
  const cites = citeAttachments('/tmp/opc-fellows/project', [
    { path: '/tmp/opc-fellows/project/README.md', name: 'README.md' },
    { path: '/tmp/outside/secret.txt', name: 'secret.txt' },
  ])
  assert.equal(cites[0]?.shown, 'README.md')
  assert.equal(cites[1]?.omitted, '不在项目文件夹里')
  assert.match(composeAttachmentCiteText(cites), /dsh-fs/)
  assert.doesNotMatch(composeAttachmentCiteText(cites), /文件正文/)
})

test('图片扩展名映射 mime', () => {
  assert.equal(attachmentImageMime('cover.png'), 'image/png')
  assert.equal(attachmentImageMime('shot.JPEG'), 'image/jpeg')
  assert.equal(attachmentImageMime('note.md'), undefined)
})
