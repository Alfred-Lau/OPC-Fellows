import type { Context } from '@deepseek-ai/cordis'
import type { ModuleDefinition } from '../kernel/main/services/modules'
import { OCCUPATION_DSH_BUNDLE } from '../kernel/shared/occupation-bundles'
import { registerNoteIpc } from '../main/note-ipc'
import { addNote, listNotes, loadNotes } from '../main/note-store'
import { firstLine } from '../shared/search'
import { formatNotesFind, pickNoteToPromote } from '../shared/skill-route'
import { parsePinnedArg } from '../kernel/shared/occupation-tools'

export const notesModule: ModuleDefinition = {
  source: 'builtin',
  manifest: {
    id: 'notes',
    title: '随手记',
    mark: '记',
    description: '想到什么先记下来，不打断手里的事。',
    kind: 'view',
    version: '1.0.0',
    group: '核心',
    order: 20,
    accelerator: 'CommandOrControl+2',
    inject: ['bridge', 'workbench', 'tools', 'todos'],
    capabilities: ['storage', 'search'],
    removable: false,
    dshBundle: OCCUPATION_DSH_BUNDLE,
  },
  plugin(ctx: Context) {
    loadNotes()
    registerNoteIpc((channel, listener) => {
      ctx.bridge.handle(channel, listener)
    })
    // JSON 点名仍留给模型不用 native tool 的时候；dsh 树上 occupation-notes 也挂了同名工具。
    ctx.tools.register({
      name: 'notes_add',
      description: '把一句话记到随手记',
      moduleId: 'notes',
      parameters: { text: { type: 'string', description: '要记下的原文' } },
      execute: async (args) => {
        const item = addNote(args.text ?? '')
        if (!item) {
          return '没有可记的内容。'
        }
        return `已记到随手记：${item.text}`
      },
    })
    ctx.tools.register({
      name: 'notes_find',
      description: '按关键词找回随手记。没有命中就说没有，不要编造笔记。',
      moduleId: 'notes',
      effect: 'read',
      parameters: { text: { type: 'string', description: '找回的关键词或用户原话' } },
      execute: async (args) => {
        const notes = listNotes()
        const text = args.text || '找回'
        const query = text.replace(/找回|找一下|找/g, ' ').replace(/\s+/g, ' ').trim()
        const hits = query ? notes.filter((note) => note.text.includes(query)).slice(0, 8) : []
        return {
          text: formatNotesFind(notes, text),
          listing: hits.length > 0 ? { kind: 'note', ids: hits.map((note) => note.id) } : undefined,
        }
      },
    })
    ctx.tools.register({
      name: 'notes_promote',
      description: '把一条随手记的指针交给内核待办。正文仍在随手记。',
      moduleId: 'notes',
      effect: 'write',
      parameters: {
        text: { type: 'string', description: '用户原话，可含第几条', required: false },
        pinned: { type: 'string', description: '钉死的笔记 id，逗号分隔', required: false },
      },
      execute: async (args) => {
        const notes = listNotes()
        if (notes.length === 0) {
          return '随手记是空的，没有可升格的指针。'
        }
        const note = pickNoteToPromote(notes, args.text || '', parsePinnedArg(args.pinned))
        if (!note) {
          return `最近一条是「${firstLine(notes[0]?.text ?? '')}」。要升格这一条就说「升格待办 第一条」。`
        }
        ctx.todos.ingest({
          agentId: 'notes',
          source: '随手记',
          tags: ['随手记'],
          items: [
            {
              title: firstLine(note.text),
              note: `note:${note.id}`,
              dedupeKey: `note:${note.id}`,
            },
          ],
        })
        return `已把「${firstLine(note.text)}」的指针交给待办。正文仍在随手记。`
      },
    })
    ctx.workbench.nav({
      id: 'notes',
      title: '随手记',
      mark: '记',
      kind: 'view',
      order: 20,
      accelerator: 'CommandOrControl+2',
    })
  },
}
