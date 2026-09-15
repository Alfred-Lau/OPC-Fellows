/**
 * 模块开关的运行时旗标。监控刷新这类老代码不在插件 apply 里，
 * 没法直接读 ctx.modules，用旗标同步一份。
 */
const flags = {
  socialAmmo: false,
}

export function setSocialAmmoEnabled(enabled: boolean): void {
  flags.socialAmmo = enabled
}

export function isSocialAmmoEnabled(): boolean {
  return flags.socialAmmo
}
