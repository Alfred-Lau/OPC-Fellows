import assert from 'node:assert/strict'
import test from 'node:test'
import { isExactSkillPhrase, isPickBestAsk, shouldPickFromData, startsWithSkillPhrase, withNamedFirst } from './read-answer.ts'

test('点中 Skill 原句才回原表，最好/哪条要从数据里点名', () => {
  assert.equal(isExactSkillPhrase('解读流量', '解读流量'), true)
  assert.equal(isExactSkillPhrase('/解读流量', '解读流量'), true)
  assert.equal(isExactSkillPhrase('解读流量。', '解读流量'), true)
  assert.equal(isExactSkillPhrase('这些项目中流量最好的是什么', '解读流量'), false)
  assert.equal(startsWithSkillPhrase('开实验 官网 CTA。假设：改按钮。', '开实验'), true)
  assert.equal(startsWithSkillPhrase('刷新态势', '刷新态势'), true)
  assert.equal(startsWithSkillPhrase('这个月流量如何', '解读流量'), false)
  assert.equal(isPickBestAsk('这些项目中流量最好的是什么'), true)
  assert.equal(isPickBestAsk('哪个 idea 最值得做'), true)
  assert.equal(isPickBestAsk('哪条最热'), true)
  assert.equal(isPickBestAsk('最紧急的是哪条'), true)
  assert.equal(isPickBestAsk('解读流量'), false)
  assert.equal(isPickBestAsk('这个月赚了多少'), false)
  assert.equal(shouldPickFromData('解读流量', '解读流量'), false)
  assert.equal(shouldPickFromData('哪个最好', '解读流量'), true)
  assert.equal(withNamedFirst('解读流量', '解读流量', '点名', '原表'), '原表')
  assert.equal(withNamedFirst('哪个最好', '解读流量', '点名', '原表'), '点名\n\n原表')
})
