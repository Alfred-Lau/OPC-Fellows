import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { Service, type Context } from '@deepseek-ai/cordis'

export interface ModuleStore {
  /** 数据文件的绝对路径。 */
  path(file: string): string
  read<T>(file: string, fallback: T): T
  write(file: string, data: unknown): void
}

/**
 * 按模块隔离的 JSON 存储。
 *
 * 内置模块沿用各自原有的 userData 路径（见 `legacyPath`），不搬家 ——
 * 搬家对用户没有可见收益，却要冒一次数据迁移的风险。
 * 第三方模块一律落在 `userData/module-data/<id>/` 下，互相看不见。
 */
export class StorageService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'moduleStore')
  }

  open(namespace: string): ModuleStore {
    const resolve = (file: string): string => join(this.root(namespace), file)
    return {
      path: resolve,
      read: <T,>(file: string, fallback: T): T => readJson(resolve(file), fallback),
      write: (file: string, data: unknown): void => writeJson(resolve(file), data),
    }
  }

  root(namespace: string): string {
    return join(app.getPath('userData'), 'module-data', namespace)
  }
}

export function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) {
    return fallback
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

/** 先写临时文件再改名，避免写一半掉电留下半个 JSON。 */
export function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, path)
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    moduleStore: StorageService
  }
}
