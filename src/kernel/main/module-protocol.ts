import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, net, protocol } from 'electron'
import { MODULE_PROTOCOL, parseModuleAssetUrl, resolveModuleAsset } from '../shared/module-protocol'

/**
 * 必须在 app ready 之前调用，否则渲染层 import() 这个协议会被当成不安全。
 */
export function privilegeModuleProtocol(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MODULE_PROTOCOL,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
    },
  ])
}

export function installModuleProtocol(): void {
  protocol.handle(MODULE_PROTOCOL, async (request) => {
    const parsed = parseModuleAssetUrl(request.url)
    if (!parsed) {
      return new Response('bad url', { status: 400 })
    }
    const root = join(app.getPath('userData'), 'modules', parsed.moduleId)
    const file = resolveModuleAsset(root, parsed.file)
    if (!file || !existsSync(file)) {
      return new Response('not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(file).href)
  })
}
