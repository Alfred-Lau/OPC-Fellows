import type { IpcRegistrar } from '../kernel/main/ipc'
import { addNote, listNotes, removeNote } from './note-store'

export function registerNoteIpc(handle: IpcRegistrar): void {
  handle('notes:list', () => listNotes())
  handle('notes:add', (_event, text: string) => addNote(typeof text === 'string' ? text : ''))
  handle('notes:remove', (_event, id: string) => removeNote(typeof id === 'string' ? id : ''))
}
