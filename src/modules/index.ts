import type { ModuleDefinition } from '../kernel/main/services/modules'
import { socialAmmoModule } from './social-ammo'

/**
 * 开源内置模块只留社媒弹药。主理人是内核身份，不走模块表。
 */
export const BUILTIN_MODULES: ModuleDefinition[] = [socialAmmoModule]
