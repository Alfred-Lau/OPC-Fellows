import { join } from 'node:path'
import { app } from 'electron'
import { Service, type Context } from '@deepseek-ai/cordis'
import { applyCatalog, defaultCatalog, normalizeCatalog, type WorkbenchCatalog } from '../../shared/catalog'
import { readJson, writeJson } from './storage'
import { unlinkSync, existsSync } from 'node:fs'

/**
 * 用户的工作情况：监控哪些产品、待办默认标签、社媒签名。
 * 没改过就是空目录；个人站点不要焊进代码。
 */
export class CatalogService extends Service {
  static inject = ['bridge']

  private data: WorkbenchCatalog

  constructor(ctx: Context) {
    super(ctx, 'catalog')
    this.data = this.load()
    applyCatalog(this.data)

    ctx.bridge.handle('workbench:catalog', () => this.get())
    ctx.bridge.handle('workbench:save-catalog', (_event, raw: unknown) => this.save(raw))
    ctx.bridge.handle('workbench:reset-catalog', () => this.reset())
  }

  get(): WorkbenchCatalog {
    return clone(this.data)
  }

  save(raw: unknown): WorkbenchCatalog {
    this.data = normalizeCatalog(raw)
    writeJson(this.path(), this.data)
    applyCatalog(this.data)
    this.ctx.bridge.send('workbench:catalog-changed', this.get())
    return this.get()
  }

  reset(): WorkbenchCatalog {
    this.data = defaultCatalog()
    if (existsSync(this.path())) {
      unlinkSync(this.path())
    }
    applyCatalog(this.data)
    this.ctx.bridge.send('workbench:catalog-changed', this.get())
    return this.get()
  }

  private load(): WorkbenchCatalog {
    if (!existsSync(this.path())) {
      return defaultCatalog()
    }
    return normalizeCatalog(readJson(this.path(), null))
  }

  private path(): string {
    return join(app.getPath('userData'), 'catalog.json')
  }
}

function clone(catalog: WorkbenchCatalog): WorkbenchCatalog {
  return structuredClone(catalog)
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    catalog: CatalogService
  }
}
