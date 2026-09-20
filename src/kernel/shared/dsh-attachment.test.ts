import assert from 'node:assert/strict'
import test from 'node:test'
import {
  attachmentImageMime,
  citeAttachments,
  composeAttachmentCiteText,
  composeDshPromptContentBlocks,
} from './dsh-attachment.ts'

test('引用文件只列路径，不把正文写进 prompt', () => {
  const cites = citeAttachments('/Users/me/notes', [
    { path: '/Users/me/notes/readme.md', name: 'readme.md' },
    { path: '/Users/me/notes/shot.png', name: 'shot.png' },
    { path: '/etc/passwd', name: 'passwd' },
  ])
  assert.deepEqual(
    cites.map((cite) => ({ shown: cite.shown, omitted: cite.omitted, imageMime: cite.imageMime })),
    [
      { shown: 'readme.md', omitted: undefined, imageMime: undefined },
      { shown: 'shot.png', omitted: undefined, imageMime: 'image/png' },
      { shown: 'passwd', omitted: '不在项目文件夹里', imageMime: undefined },
    ],
  )
  const text = composeAttachmentCiteText(cites)
  assert.match(text, /dsh-fs/)
  assert.match(text, /readme\.md/)
  assert.match(text, /shot\.png/)
  assert.match(text, /passwd（不在项目文件夹里）/)
  assert.doesNotMatch(text, /\/etc\/passwd/)
  assert.doesNotMatch(text, /\/Users\//)
  assert.doesNotMatch(text, /# hi/)
  assert.doesNotMatch(text, /```/)
})

test('没有项目文件夹时引用也只写文件名', () => {
  const cites = citeAttachments(undefined, [{ path: '/Users/me/notes/readme.md', name: 'readme.md' }])
  assert.deepEqual(cites.map((cite) => cite.shown), ['readme.md'])
  assert.doesNotMatch(composeAttachmentCiteText(cites), /\/Users\//)
})

test('prompt 块先路径指针，再图片，再用户话', () => {
  const cites = citeAttachments('/Users/me/notes', [{ path: '/Users/me/notes/shot.png', name: 'shot.png' }])
  const blocks = composeDshPromptContentBlocks({
    text: '看这张图',
    cites,
    images: [{ data: 'YWJj', mimeType: 'image/png' }],
  })
  assert.deepEqual(blocks, [
    {
      type: 'text',
      text: '用户引用了这些文件。路径相对当前工作目录，用 dsh-fs 读取正文，不要凭记忆编造。\n- shot.png',
    },
    { type: 'image', data: 'YWJj', mimeType: 'image/png' },
    { type: 'text', text: '看这张图' },
  ])
  assert.equal(attachmentImageMime('ref.JPEG'), 'image/jpeg')
  assert.equal(attachmentImageMime('notes.md'), undefined)
})
