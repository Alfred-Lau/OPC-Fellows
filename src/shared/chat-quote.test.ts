import assert from 'node:assert/strict'
import test from 'node:test'
import { quoteComposerDraft } from './chat-quote.ts'

test('引用带说话人，空行也保 >', () => {
  assert.equal(
    quoteComposerDraft({ text: '第一行\n\n第二行', speaker: '主理人' }),
    '> 主理人\n> 第一行\n>\n> 第二行\n\n',
  )
  assert.equal(quoteComposerDraft({ text: '', speaker: '' }), '')
  assert.equal(
    quoteComposerDraft({ text: '新', existing: '已有草稿' }),
    '> 新\n\n已有草稿',
  )
})
