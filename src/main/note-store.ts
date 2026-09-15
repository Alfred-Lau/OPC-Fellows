import { join } from 'node:path'
import { app } from 'electron'
import {
  addNote as addNoteToFile,
  loadNotes as loadNotesFromFile,
  NOTES_FILENAME,
  removeNote as removeNoteFromFile,
} from '../../packages/occupation-notes/note-file.js'
import type { NoteItem } from '../shared/note'

export function noteStorePath(): string {
  return join(app.getPath('userData'), NOTES_FILENAME)
}

export function loadNotes(): NoteItem[] {
  return loadNotesFromFile(noteStorePath())
}

export function listNotes(): NoteItem[] {
  return [...loadNotes()].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
}

export function addNote(text: string): NoteItem | null {
  return addNoteToFile(noteStorePath(), text)
}

export function removeNote(id: string): boolean {
  return removeNoteFromFile(noteStorePath(), id)
}
