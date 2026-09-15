import { BUILTIN_TEMPLATES } from './templates.ts'

export interface AgentPortrait {
  id: string
  file: string
}

/** 内置身份对应的《西游记》卡通人物。头像文件仍按模板 id。 */
export const JOURNEY_WEST_CAST: Readonly<Record<string, string>> = {
  blank: '菩提祖师',
  host: '唐僧',
  engineer: '孙悟空',
  monitor: '二郎神',
  micro: '观音菩萨',
  growth: '哪吒',
  payments: '牛魔王',
  creator: '猪八戒',
  wxdraft: '嫦娥',
  wxhub: '铁扇公主',
  mail: '太白金星',
  notes: '沙僧',
  'social-ammo': '白骨精',
  accounts: '女儿国国王',
  pet: '小白龙',
  harness: '如来佛祖',
  'x-push': '蜘蛛精',
}

const PORTRAIT_IDS = new Set(BUILTIN_TEMPLATES.map((template) => template.id))

/** Agent 身份对应的西游记卡通头像。未知身份落到空白助手，不用名字首字。 */
export function agentPortrait(templateId: string): AgentPortrait {
  const id = PORTRAIT_IDS.has(templateId) ? templateId : 'blank'
  return { id, file: `avatars/${id}.png` }
}
