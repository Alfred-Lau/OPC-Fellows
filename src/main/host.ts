import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/** extraResources 里 hoisted 安装后的 CLI 路径，相对 `process.resourcesPath`。 */
export const VENDORED_DSH_BIN = join('dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

export function vendoredDshBin(resourcesPath: string): string {
  return join(resourcesPath, VENDORED_DSH_BIN)
}

/**
 * 解析打包进 extraResources 的 dsh CLI；开发期回落到 node_modules。
 * 唯一 spawn 点是 DshRuntimeService（`--profile opc`），不再起 `dsh web`。
 * asar 里没有 node_modules，不能靠 `require.resolve` 找 CLI。
 */
export function resolveDshBin(
  options: {
    resourcesPath?: string
    resolveModule?: (specifier: string) => string
  } = {},
): string {
  const override = process.env.OWNWORKBUDDY_DSH?.trim()
  if (override && existsSync(override)) {
    return override
  }

  const resourcesPath = options.resourcesPath ?? process.resourcesPath
  if (resourcesPath) {
    const vendored = vendoredDshBin(resourcesPath)
    if (existsSync(vendored)) {
      return vendored
    }
  }

  const resolveModule = options.resolveModule ?? defaultResolve
  try {
    return resolveModule('@deepseek-ai/dsh/lib/bin.js')
  } catch {
    try {
      const pkg = resolveModule('@deepseek-ai/dsh/package.json')
      const bin = join(dirname(pkg), 'lib', 'bin.js')
      if (existsSync(bin)) {
        return bin
      }
    } catch {
      // 打包后 asar 没有这份依赖，下面抛可读错误。
    }
  }

  throw new Error(
    '找不到 DeepSeek Harness（@deepseek-ai/dsh）。打包版应带 extraResources/dsh，开发期请先 pnpm install。',
  )
}

function defaultResolve(specifier: string): string {
  const require = createRequire(import.meta.url)
  return require.resolve(specifier)
}
