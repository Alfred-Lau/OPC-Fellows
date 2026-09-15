import assert from 'node:assert/strict'
import test from 'node:test'
import { currentGlobalNav } from './global-nav.ts'

const inbox = 'thread:inbox'

test('日程和新任务各自占高亮，不会把今日或技能一起点亮', () => {
  assert.equal(currentGlobalNav('task', inbox, inbox), 'task')
  assert.equal(currentGlobalNav('schedule', inbox, inbox), 'schedule')
  assert.equal(currentGlobalNav('extensions', inbox, inbox), 'extensions')
  assert.equal(currentGlobalNav('home', inbox, inbox), 'home')
  assert.equal(currentGlobalNav('prefs', inbox, inbox), undefined)
  assert.equal(currentGlobalNav('monitor', 'thread:user:poem', inbox), undefined)
})
