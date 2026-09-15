import { getWorkbenchWindow } from './workbench-window'

export function broadcastTodosChanged(): void {
  getWorkbenchWindow()?.webContents.send('todos:changed')
}
