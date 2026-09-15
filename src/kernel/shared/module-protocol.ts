import { resolve, sep } from 'node:path'

export const MODULE_PROTOCOL = 'owb-module'

/** 渲染进程用来加载第三方模块资源的地址。 */
export function moduleAssetUrl(moduleId: string, relative: string): string {
  const file = relative.replace(/^\/+/, '')
  return `${MODULE_PROTOCOL}://mod/${encodeURIComponent(moduleId)}/${file}`
}

export function parseModuleAssetUrl(url: string): { moduleId: string; file: string } | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== `${MODULE_PROTOCOL}:`) {
      return null
    }
    const parts = parsed.pathname.split('/').filter(Boolean)
    const moduleId = decodeURIComponent(parts[0] ?? '')
    const file = parts.slice(1).map((part) => decodeURIComponent(part)).join('/')
    if (!moduleId || !file) {
      return null
    }
    return { moduleId, file }
  } catch {
    return null
  }
}

/**
 * 把模块内相对路径收成绝对路径。逃出模块根目录的请求一律拒绝。
 */
export function resolveModuleAsset(root: string, file: string): string | null {
  if (!file || file.includes('\0')) {
    return null
  }
  const base = resolve(root)
  const resolved = resolve(base, file)
  if (resolved !== base && !resolved.startsWith(base + sep)) {
    return null
  }
  return resolved
}
