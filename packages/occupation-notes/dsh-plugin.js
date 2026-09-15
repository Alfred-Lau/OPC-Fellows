import { resolve } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { addNote, notesPathFromEnv, OPC_USER_DATA_ENV, writeNoteDocument } from './note-file.js'

export const inject = ['tools']

/**
 * 在 dsh 树上挂 notes_add。落盘走 note-file.js + OPC_USER_DATA，不碰 Electron。
 * 右栏 Panel 仍由 src/modules/notes.ts 渲染。
 */
export function apply(ctx) {
  ctx.tools.register(
    defineTool({
      name: 'notes_add',
      description: '把一句话记到随手记',
      parameters: {
        text: { type: 'string', required: true, description: '要记下的原文' },
      },
      output: {
        schema: { type: 'string' },
        render(_args, value) {
          return [{ type: 'text', text: value }]
        },
      },
      async execute(args) {
        const item = addNote(notesPathFromEnv(), args.text ?? '')
        if (!item) {
          return '没有可记的内容。'
        }
        const cwd = process.cwd()
        const userData = process.env[OPC_USER_DATA_ENV]?.trim()
        if (userData && resolve(cwd) !== resolve(userData)) {
          const path = writeNoteDocument(cwd, item.text, item.createdAt, item.id)
          if (path) {
            return `已记到随手记，并写入项目目录：${path}`
          }
        }
        return `已记到随手记：${item.text}`
      },
    }),
  )
}

apply.inject = inject
export default apply
