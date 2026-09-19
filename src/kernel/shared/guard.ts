/**
 * 第三方模块能碰到的内核服务。没在这里的属性原样放过（effect / on / emit 等）。
 * 在这里的服务必须有对应能力，否则代理直接拒绝。
 */
export const PROTECTED_SERVICES = ['storage', 'moduleStore', 'todos', 'modules', 'repository'] as const

const ALWAYS_ALLOWED = ['bridge', 'workbench', 'effect', 'fiber', 'on', 'emit', 'plugin', 'scope'] as const

/** 能力 → 服务名。manifest 的 storage 打开模块库，不开放 dsh 的 ctx.storage。 */
export const CAPABILITY_GRANTS: Record<string, string> = {
  storage: 'moduleStore',
  'todos:read': 'todos',
  'todos:write': 'todos',
}

export function allowedServices(capabilities: readonly string[]): Set<string> {
  const allowed = new Set<string>(ALWAYS_ALLOWED)
  for (const capability of capabilities) {
    const service = CAPABILITY_GRANTS[capability]
    if (service) {
      allowed.add(service)
    }
  }
  return allowed
}

/**
 * 访问某个属性该不该拦。返回人话错误，或 null 表示放行。
 *
 * 注意不要写成 `property in grants === false` —— `in` 优先级高于 `===`，
 * 会变成 `property in false`，访问任何字符串属性都会 TypeError。
 */
export function denyService(moduleId: string, property: string, allowed: Set<string>): string | null {
  if (!(PROTECTED_SERVICES as readonly string[]).includes(property)) {
    return null
  }
  if (allowed.has(property)) {
    return null
  }
  return `模块 ${moduleId} 未声明使用 ${property} 所需的能力`
}
