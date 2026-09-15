export default function apply(ctx) {
  ctx.workbench.nav({
    id: 'hello',
    title: '你好',
    mark: '你',
    kind: 'view',
    order: 200,
  })
  ctx.bridge.handle('hello:ping', () => ({
    ok: true,
    at: new Date().toISOString(),
  }))
}
