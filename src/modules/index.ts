import type { ModuleDefinition } from '../kernel/main/services/modules'
import { accountsModule } from './accounts'
import { growthModule } from './growth'
import { harnessModule } from './harness'
import { microModule } from './micro'
import { monitorModule } from './monitor'
import { notesModule } from './notes'
import { paymentsModule } from './payments'
import { petModule } from './pet'
import { socialAmmoModule } from './social-ammo'
import { wxDraftModule } from './wx-draft'
import { mailModule } from './mail'
import { wxhubModule } from './wxhub'
import { xPushModule } from './x-push'

/**
 * 内置模块表。构建期静态引入并注册进内核，
 * 说明符为 `builtin:<id>` —— 打包后不需要动态 import，绕开 asar 的限制。
 *
 * 待办不在这里：它是内核服务，不可禁用（见 docs/module-architecture-design.md §5.1）。
 */
export const BUILTIN_MODULES: ModuleDefinition[] = [
  notesModule,
  petModule,
  monitorModule,
  socialAmmoModule,
  microModule,
  growthModule,
  accountsModule,
  wxDraftModule,
  wxhubModule,
  mailModule,
  paymentsModule,
  xPushModule,
  harnessModule,
]
