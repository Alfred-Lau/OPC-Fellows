export interface NoteItem {
  id: string
  text: string
  createdAt: string
}

export const NOTES_FILENAME: string
export const OPC_USER_DATA_ENV: 'OPC_USER_DATA'

export function notesPathFromEnv(env?: NodeJS.ProcessEnv): string
export function loadNotes(path: string): NoteItem[]
export function addNote(path: string, text: string): NoteItem | null
export function removeNote(path: string, id: string): boolean
export function writeNoteDocument(folder: string, text: string, createdAt: string, id: string): string | null
