import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'ownworkbuddy-hello'
export const inject = ['tools']

/**
 * 第三方模块的 dsh 树入口。只注册模型可调用的工具，不碰 workbench / bridge。
 */
export function apply(ctx) {
  ctx.tools.register(
    defineTool({
      name: 'hello_ping',
      description: '确认第三方 hello 模块已挂上 dsh 工具目录。不改文件、不读密钥。',
      parameters: {
        note: { type: 'string', description: '可选备注，原样回显', required: false },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: String(value ?? '') }],
      },
      async execute(args) {
        const note = typeof args?.note === 'string' && args.note.trim() ? ` ${args.note.trim()}` : ''
        return `hello-module 已在 dsh 树上。${note}`.trim()
      },
    }),
  )
}

apply.inject = inject

export default { name, inject, apply }
