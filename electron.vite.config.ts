import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'node:path'

/**
 * electron-vite 只外置 package.json 的 dependencies。这些包在 devDependencies，
 * 不写进 include 就会打进 out/main；dsh-llm 顶层 createRequire(../package.json)
 * 会去找不存在的 out/package.json。
 * 不要在 main 再挂空的 externalizeDepsPlugin()：同名插件会挡住 include。
 */
const DSH_RUNTIME_PACKAGES = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-app-boot',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-llm',
]

export default defineConfig({
  main: {
    build: {
      externalizeDeps: { include: DSH_RUNTIME_PACKAGES },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: resolve('src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
        },
      },
    },
  },
})
