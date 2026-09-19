import assert from 'node:assert/strict'
import test from 'node:test'
import { allowedServices, denyService } from './guard.ts'

test('没声明 storage 就拿不到模块库；dsh 的 storage 始终不开放', () => {
  const bare = allowedServices([])
  assert.equal(denyService('demo', 'moduleStore', bare), '模块 demo 未声明使用 moduleStore 所需的能力')
  assert.equal(denyService('demo', 'storage', bare), '模块 demo 未声明使用 storage 所需的能力')
  assert.equal(denyService('demo', 'todos', bare), '模块 demo 未声明使用 todos 所需的能力')
  assert.equal(denyService('demo', 'modules', bare), '模块 demo 未声明使用 modules 所需的能力')

  const granted = allowedServices(['storage', 'todos:write'])
  assert.equal(denyService('demo', 'moduleStore', granted), null)
  assert.equal(denyService('demo', 'storage', granted), '模块 demo 未声明使用 storage 所需的能力')
  assert.equal(denyService('demo', 'todos', granted), null)
})

test('bridge / workbench / effect 始终放行，不在保护名单里的属性也放行', () => {
  const allowed = allowedServices([])
  assert.equal(denyService('demo', 'bridge', allowed), null)
  assert.equal(denyService('demo', 'workbench', allowed), null)
  assert.equal(denyService('demo', 'effect', allowed), null)
  assert.equal(denyService('demo', 'on', allowed), null)
  assert.equal(denyService('demo', 'somethingElse', allowed), null)
})

test('todos:read 和 todos:write 都能打开 todos 服务', () => {
  assert.equal(denyService('demo', 'todos', allowedServices(['todos:read'])), null)
  assert.equal(denyService('demo', 'todos', allowedServices(['todos:write'])), null)
})
