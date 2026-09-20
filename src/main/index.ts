import { app } from 'electron'
import type { Context } from '@deepseek-ai/cordis'
import { INSTALL_APP_ID, PRODUCT_NAME } from '../shared/brand'
import { applyDockIcon } from './app-icon'
import { ensureDesktopPath } from './cli-path'
import { initTheme, registerThemeIpc } from './theme'
import { showWorkbench, getWorkbenchWindow } from './workbench-window'
import { bootKernel, openInitialView } from '../kernel/main/boot'
import { installModuleProtocol, privilegeModuleProtocol } from '../kernel/main/module-protocol'
import { startLocalApi, stopLocalApi } from './local-api'

privilegeModuleProtocol()
app.setName(PRODUCT_NAME)

let kernel: Context | null = null
let quitting = false

/**
 * 退出时先把内核整个 dispose 掉：每个模块注册过的定时器、
 * 本地端口、子进程都挂在自己的 fiber 上，会逆序回收。
 */
async function quitApp(): Promise<void> {
  if (quitting) {
    return
  }
  quitting = true
  try {
    await kernel?.fiber.dispose()
  } catch (error) {
    console.error('停止模块时出错:', error)
  }
  app.quit()
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showWorkbench('home')
  })

  app.whenReady().then(async () => {
    ensureDesktopPath()
    applyDockIcon()
    if (process.platform === 'win32') {
      app.setAppUserModelId(INSTALL_APP_ID)
    }
    initTheme()
    registerThemeIpc()
    installModuleProtocol()

    const booted = await bootKernel(quitApp)
    kernel = booted
    openInitialView(booted)
    startLocalApi({
      prompt: (input) => booted.dshRuntime.prompt(input),
      catalog: () => booted.opcTools.catalog(),
      currentTurn: (sessionId) => booted.dshRuntime.currentTurn(sessionId),
      invoke: (name, args, meta) => booted.opcTools.invoke(name, args, meta),
      askApproval: (input) => booted.dshRuntime.askApproval(input),
    })
  })

  app.on('activate', () => {
    const existing = getWorkbenchWindow()
    if (existing) {
      existing.show()
      existing.focus()
      return
    }
    showWorkbench('home')
  })

  app.on('window-all-closed', () => {
    // Keep the process for tray and scheduled desktop notifications.
  })

  app.on('before-quit', (event) => {
    stopLocalApi()
    if (!quitting) {
      event.preventDefault()
      void quitApp()
    }
  })
}
