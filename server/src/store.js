// 存储层。
//
// 这里是本模块唯一被允许「换实现」的边界：
// - createPgStore()  —— 生产默认，Postgres。
// - createMemoryStore() —— 进程内数组，给本地试跑和自动化测试用（不持久化）。
//
// 两者导出同一组方法，接口全部是 async：
//   migrate()
//   insertTodo({ text, device_id })      -> item
//   listTodos({ limit, device_id })       -> item[]
//   insertNote({ title, body, device_id })-> item
//   listNotes({ limit, device_id })       -> item[]
//   close()

import { randomUUID } from 'node:crypto'

// 线索一：测试和试跑都走这个内存实现，因此单元测试完全不依赖真实数据库。
export function createMemoryStore() {
  const todos = []
  const notes = []

  return {
    kind: 'memory',

    async migrate() {
      // 内存实现没有 schema 需要创建。
    },

    async insertTodo({ text, device_id }) {
      const item = {
        id: randomUUID(),
        text,
        done: false,
        status: 'open',
        device_id,
        created_at: new Date().toISOString(),
      }
      todos.push(item)
      return { ...item }
    },

    async listTodos({ limit = 50, device_id } = {}) {
      return todos
        .filter((item) => !device_id || item.device_id === device_id)
        .slice(-limit)
        .reverse()
        .map((item) => ({ ...item }))
    },

    async insertNote({ title, body, device_id }) {
      const item = {
        id: randomUUID(),
        title,
        body,
        device_id,
        created_at: new Date().toISOString(),
      }
      notes.push(item)
      return { ...item }
    },

    async listNotes({ limit = 50, device_id } = {}) {
      return notes
        .filter((item) => !device_id || item.device_id === device_id)
        .slice(-limit)
        .reverse()
        .map((item) => ({ ...item }))
    },

    async close() {
      todos.length = 0
      notes.length = 0
    },
  }
}

// Postgres 客户端只在真的用到时才加载：跑测试、或者 STORE=memory 试跑时
// 完全不需要安装 pg。
export async function createStore(config, options = {}) {
  if (config.store === 'memory') {
    return createMemoryStore()
  }
  const { createPgStore } = await import('./pg-store.js')
  return createPgStore({ databaseUrl: config.databaseUrl, logger: options.logger })
}
