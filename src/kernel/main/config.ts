import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { dump, load } from 'js-yaml'
import { PRODUCT_NAME } from '../../shared/brand'
import type { WorkbenchConfig } from '../shared/module'
import { CONFIG_VERSION, normalizeWorkbenchConfig } from '../shared/workbench-config'

/**
 * 用户的模块配置树。桌面 Panel 启停仍写在这里。
 * 声明了 `dsh.bundle` 的包进 `$DSH_HOME/profiles/opc` 的层栈，不靠这份 YAML 组合 Agent 运行时。
 */
export function configPath(): string {
  return join(app.getPath('userData'), 'workbench.yml')
}

export function readConfig(): WorkbenchConfig {
  const path = configPath()
  if (!existsSync(path)) {
    return { version: CONFIG_VERSION, entries: [] }
  }
  try {
    const parsed = load(readFileSync(path, 'utf8')) as unknown
    return normalizeWorkbenchConfig(parsed)
  } catch (error) {
    // 配置坏了不能让整个工作台起不来：备份后从空配置重建，
    // 模块会按内置默认值全部启用。
    backupBroken(path, error)
    return { version: CONFIG_VERSION, entries: [] }
  }
}

export function writeConfig(config: WorkbenchConfig): void {
  const path = configPath()
  mkdirSync(dirname(path), { recursive: true })
  const body = dump(
    { version: CONFIG_VERSION, entries: config.entries },
    { lineWidth: 120, noRefs: true, sortKeys: false },
  )
  const tmp = `${path}.tmp`
  writeFileSync(tmp, `# ${PRODUCT_NAME} 模块配置。可以手改，改完重启生效。\n${body}`)
  renameSync(tmp, path)
}

function backupBroken(path: string, error: unknown): void {
  try {
    renameSync(path, `${path}.broken-${Date.now()}`)
    console.error('workbench.yml 解析失败，已备份并重建:', error)
  } catch {
    // 备份失败也要继续启动。
  }
}

