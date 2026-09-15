import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { agentPortrait, JOURNEY_WEST_CAST } from './occupation-avatar.ts'
import { BUILTIN_TEMPLATES, listedTemplates, templateForModule } from './templates.ts'

test('列出的每个身份都有西游记卡通头像，不用角色名或 mark 首字', () => {
  for (const template of listedTemplates()) {
    const portrait = agentPortrait(template.id)
    assert.notEqual(portrait.id, template.mark)
    assert.notEqual(portrait.id, template.role.slice(0, 1))
    assert.equal(portrait.file, `avatars/${portrait.id}.png`)
  }
})

test('内置模板都有西游记人物画像，未知身份落到空白助手而不是首字', () => {
  for (const template of BUILTIN_TEMPLATES) {
    const portrait = agentPortrait(template.id)
    assert.equal(portrait.id, template.id)
    assert.ok(JOURNEY_WEST_CAST[template.id], template.id)
  }
  const fallback = agentPortrait('unknown-agent')
  assert.equal(fallback.id, 'blank')
  assert.equal(fallback.file, 'avatars/blank.png')
})

test('一对一的内置模块都能落到自己的画像，而不是空白助手', () => {
  const moduleIds = ['monitor', 'micro', 'growth', 'payments', 'wxdraft', 'wxhub', 'mail', 'social-ammo', 'accounts', 'notes', 'pet', 'harness', 'x-push']
  for (const id of moduleIds) {
    assert.ok(templateForModule(id), id)
    assert.equal(agentPortrait(id).id, id)
  }
})

test('每个内置身份的画像文件都在仓库里', () => {
  const assets = join(fileURLToPath(new URL('../../renderer/assets', import.meta.url)))
  for (const template of BUILTIN_TEMPLATES) {
    const portrait = agentPortrait(template.id)
    const bytes = readFileSync(join(assets, portrait.file))
    assert.equal(bytes[0], 0x89)
    assert.equal(bytes[1], 0x50)
  }
})
