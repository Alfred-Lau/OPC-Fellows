import type { Context } from '@deepseek-ai/cordis'
import type { ModuleDefinition } from '../kernel/main/services/modules'
import { registerXPushIpc } from '../main/x-push'
import { registerXBridgeIpc, stopXBridge } from '../main/x-bridge'

export const xPushModule: ModuleDefinition = {
  source: 'builtin',
  manifest: {
    id: 'x-push',
    title: 'X 推送',
    mark: 'X',
    description: '通过浏览器插件把草稿 DM 给自己或发成推文，本地桥监听 127.0.0.1:18753。',
    kind: 'background',
    version: '1.0.0',
    group: '内容',
    order: 80,
    inject: ['bridge'],
    optional: ['social-ammo', 'accounts'],
    // 监听本地端口是高危能力，单列出来而不是混在 net: 里。
    capabilities: ['net:listen:18753', 'todos:read'],
    namespaces: ['xpush', 'xbridge'],
    removable: false,
  },
  plugin(ctx: Context) {
    const handle = (channel: string, listener: Parameters<typeof ctx.bridge.handle>[1]): void => {
      ctx.bridge.handle(channel, listener)
    }
    registerXPushIpc(handle)
    registerXBridgeIpc(handle)
    // 停用时关掉本地 HTTP 桥，端口随之释放。
    ctx.effect(() => () => {
      stopXBridge()
    }, 'x-push.bridge')
  },
}
