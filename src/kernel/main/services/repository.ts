import { execFile } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { app } from 'electron'
import { Service, type Context } from '@deepseek-ai/cordis'
import type { ModuleManifest } from '../../shared/module'
import { denyService, allowedServices } from '../../shared/guard'
import { parseModulePackage, type PackageManifest } from '../../shared/manifest'
import type { AvailableModule, InstallResult, ModuleSourceRef, SourceKind } from '../../shared/repository'
import type { ModuleDefinition } from './modules'
import { readJson, writeJson } from './storage'

const run = promisify(execFile)

/**
 * 模块仓库：本地目录与 Git 源。
 *
 * 首版不做官方索引 —— 没有索引就没有需要信任的中心，
 * 用户加什么源就只看得到什么源（设计文档 §18.3）。
 */
export class RepositoryService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'repository')
  }

  sources(): ModuleSourceRef[] {
    return readJson<ModuleSourceRef[]>(this.sourcesFile(), [])
  }

  addSource(kind: string, location: string): ModuleSourceRef[] {
    if (kind !== 'local' && kind !== 'git') {
      throw new Error(`不支持的源类型: ${kind}`)
    }
    if (!location.trim()) {
      throw new Error('源地址不能为空')
    }
    const sources = this.sources()
    const id = `${kind}-${Date.now().toString(36)}`
    sources.push({ id, kind, location: location.trim(), label: label(kind, location.trim()) })
    writeJson(this.sourcesFile(), sources)
    return sources
  }

  removeSource(id: string): ModuleSourceRef[] {
    const sources = this.sources().filter((source) => source.id !== id)
    writeJson(this.sourcesFile(), sources)
    rmSync(join(this.cacheDir(), id), { recursive: true, force: true })
    return sources
  }

  /** 扫描所有源，列出可安装的模块。Git 源会先拉一次。 */
  async available(): Promise<AvailableModule[]> {
    const found: AvailableModule[] = []
    for (const source of this.sources()) {
      try {
        const root = await this.materialize(source)
        for (const dir of moduleDirs(root)) {
          const manifest = readManifest(dir)
          if (!manifest) {
            continue
          }
          const installedManifest = readManifest(this.moduleDir(manifest.id))
          found.push({
            sourceId: source.id,
            manifest,
            installed: Boolean(installedManifest),
            upgradable: Boolean(installedManifest) && installedManifest!.version !== manifest.version,
          })
        }
      } catch (error) {
        this.ctx.modules.log('repository', 'error', `读取源 ${source.label} 失败: ${message(error)}`)
      }
    }
    return found
  }

  async install(sourceId: string, moduleId: string): Promise<InstallResult> {
    const source = this.sources().find((item) => item.id === sourceId)
    if (!source) {
      return { ok: false, error: '源已不存在' }
    }
    try {
      const root = await this.materialize(source)
      const dir = moduleDirs(root).find((candidate) => readManifest(candidate)?.id === moduleId)
      const manifest = dir ? readManifest(dir) : null
      if (!dir || !manifest) {
        return { ok: false, error: `源里找不到模块 ${moduleId}` }
      }
      const target = this.moduleDir(moduleId)
      rmSync(target, { recursive: true, force: true })
      mkdirSync(target, { recursive: true })
      cpSync(dir, target, { recursive: true })
      const definition = definitionFrom(target)
      if (definition) {
        await this.ctx.modules.adopt(definition)
      }
      this.ctx.modules.log('repository', 'info', `已安装 ${manifest.title} ${manifest.version}`)
      return { ok: true, manifest }
    } catch (error) {
      return { ok: false, error: message(error) }
    }
  }

  async uninstall(moduleId: string): Promise<{ ok: boolean; error?: string }> {
    const info = this.ctx.modules.info(moduleId)
    if (info && !info.manifest.removable) {
      return { ok: false, error: '内置模块只能停用，不能卸载' }
    }
    try {
      await this.ctx.modules.drop(moduleId)
      rmSync(this.moduleDir(moduleId), { recursive: true, force: true })
      this.ctx.modules.log('repository', 'info', `已卸载 ${moduleId}`)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: message(error) }
    }
  }

  /** 已安装的第三方模块，启动时交给注册表。 */
  async installed(): Promise<ModuleDefinition[]> {
    const root = this.modulesRoot()
    if (!existsSync(root)) {
      return []
    }
    const definitions: ModuleDefinition[] = []
    for (const dir of moduleDirs(root)) {
      const definition = definitionFrom(dir)
      if (definition) {
        definitions.push(definition)
      }
    }
    return definitions
  }

  /** 把源变成本地可读目录：本地源直接返回，Git 源拉到缓存目录。 */
  private async materialize(source: ModuleSourceRef): Promise<string> {
    if (source.kind === 'local') {
      if (!existsSync(source.location)) {
        throw new Error(`目录不存在: ${source.location}`)
      }
      return source.location
    }
    const cache = join(this.cacheDir(), source.id)
    if (existsSync(join(cache, '.git'))) {
      await run('git', ['-C', cache, 'pull', '--ff-only', '--depth', '1'])
    } else {
      rmSync(cache, { recursive: true, force: true })
      mkdirSync(cache, { recursive: true })
      await run('git', ['clone', '--depth', '1', source.location, cache])
    }
    return cache
  }

  private sourcesFile(): string {
    return join(app.getPath('userData'), 'module-sources.json')
  }

  private cacheDir(): string {
    return join(app.getPath('userData'), 'module-cache')
  }

  private modulesRoot(): string {
    return join(app.getPath('userData'), 'modules')
  }

  private moduleDir(moduleId: string): string {
    return join(this.modulesRoot(), moduleId)
  }
}

/**
 * 能力闸门。第三方模块拿到的是这个代理，不是真的 Context ——
 * manifest 里没声明的服务一律取不到，报错里直接说清缺哪条能力。
 */
function guard(ctx: Context, manifest: ModuleManifest): Context {
  const allowed = allowedServices(manifest.capabilities)
  return new Proxy(ctx, {
    get(target, property, receiver) {
      if (typeof property === 'string') {
        const denied = denyService(manifest.id, property, allowed)
        if (denied) {
          throw new Error(denied)
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
}

/**
 * 真·动态 import。第三方模块装在 asar 外面，必须运行时按路径加载；
 * 包成 Function 是为了不让打包器把它编译成 require。
 */
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<unknown>

function moduleDirs(root: string): string[] {
  if (!existsSync(root)) {
    return []
  }
  // 源仓库既可能是「一个目录一个模块」，也可能根目录自己就是模块。
  if (existsSync(join(root, 'package.json'))) {
    return [root]
  }
  return readdirSync(root)
    .map((name) => join(root, name))
    .filter((path) => statSync(path).isDirectory() && existsSync(join(path, 'package.json')))
}

function readManifest(dir: string): PackageManifest | null {
  return parseModulePackage(readJson(join(dir, 'package.json'), null))
}

function definitionFrom(dir: string): ModuleDefinition | null {
  const manifest = readManifest(dir)
  if (!manifest) {
    return null
  }
  return {
    source: 'local',
    path: dir,
    manifest: { ...manifest, removable: true },
    plugin: async (moduleCtx, config) => {
      const entry = `${pathToFileURL(join(dir, manifest.main ?? 'index.js')).href}?t=${Date.now()}`
      const loaded = (await dynamicImport(entry)) as {
        default?: (ctx: Context, config: Record<string, unknown>) => unknown
      }
      const apply = loaded.default
      if (typeof apply !== 'function') {
        throw new Error(`模块 ${manifest.id} 的入口没有默认导出函数`)
      }
      await apply(guard(moduleCtx, manifest), config)
    },
  }
}

function label(kind: SourceKind, location: string): string {
  return kind === 'local' ? location.split(/[\\/]/).filter(Boolean).pop() || location : location
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    repository: RepositoryService
  }
}
