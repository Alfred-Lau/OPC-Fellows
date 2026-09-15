import { app, Menu, Tray, nativeImage } from 'electron'
import type { Context } from '@deepseek-ai/cordis'
import { PRODUCT_NAME } from '../../shared/brand'
import { getWorkbenchWindow, showWorkbench } from '../../main/workbench-window'

let tray: Tray | null = null

function trayIcon(): Electron.NativeImage {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGD4z0A6YIIwGmG4gYGB4T8DAwMjugJ0RQyjYDQMBg0DRjQXY7iB7AYAm38FAf1r0REAAAAASUVORK5CYII=',
    'base64',
  )
  const image = nativeImage.createFromBuffer(png)
  image.setTemplateImage(process.platform === 'darwin')
  return image
}

function sendWorkbench(channel: string): void {
  const existing = getWorkbenchWindow()
  if (existing) {
    existing.show()
    existing.focus()
    existing.webContents.send(channel)
    return
  }
  const window = showWorkbench('home')
  window.webContents.once('did-finish-load', () => {
    window.webContents.send(channel)
  })
}

/**
 * 托盘与应用菜单按当前启用的模块重建。
 * 之前这里是两份硬编码清单，加一个模块要改三处；现在只读导航贡献点。
 */
export function installShell(ctx: Context, quit: () => Promise<void>): void {
  const rebuild = (): void => {
    const entries = ctx.workbench.entries()
    Menu.setApplicationMenu(buildAppMenu(ctx, entries))
    buildTray(ctx, entries, quit)
  }
  rebuild()
  ctx.workbench.onChanged(rebuild)
}

type Entries = ReturnType<Context['workbench']['entries']>

function buildTray(ctx: Context, entries: Entries, quit: () => Promise<void>): void {
  if (!tray) {
    tray = new Tray(trayIcon())
    tray.setToolTip(PRODUCT_NAME)
    tray.on('click', () => {
      showWorkbench('home')
    })
  }
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开工作台', click: () => showWorkbench('home') },
      ...entries.map((entry) => ({
        label: entry.title,
        click: () => void ctx.workbench.open(entry.id),
      })),
      { type: 'separator' as const },
      { label: '退出', click: () => void quit() },
    ]),
  )
}

function buildAppMenu(ctx: Context, entries: Entries): Electron.Menu {
  const isMac = process.platform === 'darwin'
  return Menu.buildFromTemplate([
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { label: '工作台首页', click: () => showWorkbench('home') },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '功能',
      submenu: [
        { label: '工作台首页', accelerator: 'CommandOrControl+1', click: () => showWorkbench('home') },
        ...entries.map((entry) => ({
          label: entry.title,
          ...(entry.accelerator ? { accelerator: entry.accelerator } : {}),
          click: () => void ctx.workbench.open(entry.id),
        })),
        { type: 'separator' },
        { label: '切换侧栏', accelerator: 'CommandOrControl+B', click: () => sendWorkbench('workbench:toggle-rail') },
      ],
    },
  ])
}
