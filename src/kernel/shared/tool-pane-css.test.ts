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

test('成员工具栏目录在窄栏里横滑而不是折行', () => {
  for (const name of occupationCssFiles()) {
    const text = fs.readFileSync(path.join(cssDir, name), 'utf8')
    assert.equal(/\.monitor-nav[^{]*\{[^}]*flex-wrap:\s*wrap;/.test(text), false, name)
  }
})
