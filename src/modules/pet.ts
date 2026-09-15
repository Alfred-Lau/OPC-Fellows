import type { Context } from '@deepseek-ai/cordis'
import type { ModuleDefinition } from '../kernel/main/services/modules'
import { closePetWindow, dismissPet, showPetWindow } from '../main/pet-window'
import { showWorkbench } from '../main/workbench-window'

export const petModule: ModuleDefinition = {
  source: 'builtin',
  manifest: {
    id: 'pet',
    title: '台伴',
    mark: '鹿',
    description: '桌面角落的小鹿，待办到点会跳到屏幕中间提醒。',
    kind: 'window',
    version: '1.0.0',
    group: '核心',
    order: 30,
    inject: ['bridge', 'workbench', 'todos'],
    capabilities: ['window', 'notify', 'todos:read'],
    removable: false,
  },
  plugin(ctx: Context) {
    showPetWindow()
    ctx.bridge.handle('pet:dismiss', () => {
      dismissPet()
    })
    ctx.bridge.handle('pet:open-todo', (_event, id: string) => {
      dismissPet()
      showWorkbench('todos', id)
    })
    ctx.bridge.handle('pet:open-home', () => {
      dismissPet()
      showWorkbench('home')
    })
    ctx.workbench.nav({
      id: 'pet',
      title: '台伴',
      mark: '鹿',
      kind: 'window',
      order: 30,
      open: () => {
        showPetWindow()
      },
    })
    // 停用时把小鹿收回去，否则窗口会留在桌面上。
    ctx.effect(() => () => {
      closePetWindow()
    }, 'pet.window')
  },
}
