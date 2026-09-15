import assert from 'node:assert/strict'
import test from 'node:test'
import { petWindowStacking } from './pet.ts'

test('闲置台伴不置顶、不跨桌面，避免整个应用钉在其他程序前面', () => {
  const stacking = petWindowStacking('idle')
  assert.equal(stacking.alwaysOnTop, false)
  assert.equal(stacking.visibleOnAllWorkspaces, false)
  assert.equal(stacking.visibleOnFullScreen, false)
  assert.equal(stacking.raise, false)
})

test('待办提醒只一次性抢前台，仍然不钉在所有程序之上', () => {
  const stacking = petWindowStacking('alert')
  assert.equal(stacking.alwaysOnTop, false)
  assert.equal(stacking.visibleOnAllWorkspaces, false)
  assert.equal(stacking.visibleOnFullScreen, false)
  assert.equal(stacking.raise, true)
})
