import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const cssDir = path.join(import.meta.dirname, '../../renderer/src')

function occupationCssFiles(): string[] {
  return fs.readdirSync(cssDir).filter((name) => name.endsWith('.css'))
}

test('工具栏 CSS 不用 anywhere 把中文拆成单字', () => {
  for (const name of occupationCssFiles()) {
    const text = fs.readFileSync(path.join(cssDir, name), 'utf8')
    assert.equal(/overflow-wrap:\s*anywhere/.test(text), false, name)
  }
})

test('中文族名写在 -apple-system 前面，避免 Electron 落到日文 Hiragino', () => {
  const cjk = /PingFang SC|Hiragino Sans GB|Microsoft YaHei/
  const system = /-apple-system|BlinkMacSystemFont/
  for (const name of occupationCssFiles()) {
    const text = fs.readFileSync(path.join(cssDir, name), 'utf8')
    const stacks = text.match(/(?:font-family|--font-sans|font):[^;{]+/g) ?? []
    for (const stack of stacks) {
      if (!cjk.test(stack) || !system.test(stack)) {
        continue
      }
      assert.ok(stack.search(cjk) < stack.search(system), `${name}: ${stack.trim()}`)
    }
  }
})

