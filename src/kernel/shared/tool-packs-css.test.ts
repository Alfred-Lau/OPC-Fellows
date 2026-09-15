import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const studioCss = readFileSync(join(here, '../../renderer/src/studio.css'), 'utf8')
const studioHtml = readFileSync(join(here, '../../renderer/index.html'), 'utf8')
const studioTs = readFileSync(join(here, '../../renderer/src/studio.ts'), 'utf8')

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = studioCss.match(new RegExp(`${escaped}[^{]*\\{([^}]+)\\}`))
  assert.ok(match, `missing CSS rule ${selector}`)
  return match[1]
}

test('工具包弹窗是单列，不走雇成员的左右栅格', () => {
  assert.match(studioHtml, /id="configure-agent"[^>]*packs-dialog/)
  assert.match(rule('.packs-dialog .agent-dialog-body'), /display:\s*block/)
  assert.match(rule('.packs-dialog form'), /height:\s*auto/)
})

test('工具包勾选行是左右排布，不被表单 label 的竖排盖掉', () => {
  assert.match(rule('.agent-dialog-form label'), /flex-direction:\s*column/)
  assert.match(rule('.agent-dialog-form .agent-pack-row'), /flex-direction:\s*row/)
  assert.match(rule('.agent-dialog-form .agent-plan-row'), /flex-direction:\s*row/)
})

test('雇成员表单保留工具包图例，配置弹窗不再套一层标题', () => {
  assert.match(studioTs, /paintPackFieldset\(fieldset, selected, '工具包'\)/)
  assert.match(
    studioTs,
    /paintPackFieldset\(required\('#configure-agent-packs', HTMLElement\), selected\)/,
  )
})
