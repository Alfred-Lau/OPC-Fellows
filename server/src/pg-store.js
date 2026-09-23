// Postgres 存储实现。
//
// 表结构在启动时用 CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS 幂等创建，
// 故意不引迁移工具 —— 这个模块的定位是「可读、可改的起步模板」，不是生产级迁移系统。
// 你以后改字段时，把这里的 DDL 改成自己的迁移流程即可。
//
// 每行都带 device_id，用来区分写入来源设备。

import { randomUUID } from 'node:crypto'

const TODO_COLUMNS = 'id, text, done, device_id, created_at'
const NOTE_COLUMNS = 'id, title, body, device_id, created_at'

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS todos (
  id uuid PRIMARY KEY,
  text text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  device_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS todos_created_at_idx ON todos (created_at DESC);

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY,
  title text,
  body text NOT NULL,
  device_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notes_created_at_idx ON notes (created_at DESC);
`

export async function createPgStore({ databaseUrl, logger = console, max = 10 } = {}) {
  let pg
  try {
    pg = (await import('pg')).default
  } catch (error) {
    throw new Error('缺少依赖 pg。请在 server/ 目录执行 npm install 后重试。')
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    application_name: 'opc-fellows-server',
  })

  // 连接池的偶发错误不该把进程直接带走。
  pool.on('error', (error) => {
    logger.error(`[store] idle client error: ${error instanceof Error ? error.message : String(error)}`)
  })

  return {
    kind: 'postgres',

    async migrate() {
      await pool.query(SCHEMA_SQL)
    },

    async insertTodo({ text, device_id }) {
      const { rows } = await pool.query(
        `INSERT INTO todos (id, text, done, device_id) VALUES ($1, $2, false, $3) RETURNING ${TODO_COLUMNS}`,
        [randomUUID(), text, device_id],
      )
      return toTodo(rows[0])
    },

    async listTodos({ limit = 50, device_id } = {}) {
      const { where, params } = whereDevice(device_id)
      params.push(limit)
      const { rows } = await pool.query(
        `SELECT ${TODO_COLUMNS} FROM todos ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
        params,
      )
      return rows.map(toTodo)
    },

    async insertNote({ title, body, device_id }) {
      const { rows } = await pool.query(
        `INSERT INTO notes (id, title, body, device_id) VALUES ($1, $2, $3, $4) RETURNING ${NOTE_COLUMNS}`,
        [randomUUID(), title, body, device_id],
      )
      return toNote(rows[0])
    },

    async listNotes({ limit = 50, device_id } = {}) {
      const { where, params } = whereDevice(device_id)
      params.push(limit)
      const { rows } = await pool.query(
        `SELECT ${NOTE_COLUMNS} FROM notes ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
        params,
      )
      return rows.map(toNote)
    },

    async close() {
      await pool.end()
    },
  }
}

function whereDevice(device_id) {
  if (!device_id) {
    return { where: '', params: [] }
  }
  return { where: 'WHERE device_id = $1', params: [device_id] }
}

// 统一成和内存实现完全一样的 JSON 形状，客户端不必关心后端是谁。
function toTodo(row) {
  return {
    id: row.id,
    text: row.text,
    done: Boolean(row.done),
    status: row.done ? 'done' : 'open',
    device_id: row.device_id,
    created_at: toIso(row.created_at),
  }
}

function toNote(row) {
  return {
    id: row.id,
    title: row.title ?? null,
    body: row.body,
    device_id: row.device_id,
    created_at: toIso(row.created_at),
  }
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : String(value)
}
