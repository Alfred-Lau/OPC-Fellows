import type { ipcMain } from 'electron'

/**
 * 与 `ipcMain.handle` 完全同签名的注册函数。
 *
 * 模块拿到的是内核发的这个函数而不是 `ipcMain` 本身：注册被记账，
 * 模块卸载时通道自动注销，模块也无从注册到别人的命名空间。
 */
export type IpcListener = Parameters<typeof ipcMain.handle>[1]

export type IpcRegistrar = (channel: string, listener: IpcListener) => void
