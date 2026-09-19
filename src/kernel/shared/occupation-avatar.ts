import { BUILTIN_TEMPLATES } from './templates.ts'

export interface AgentPortrait {
  id: string
  file: string
}

/** 内置身份对应的《西游记》卡通人物。头像文件仍按模板 id。 */
export const JOURNEY_WEST_CAST: Readonly<Record<string, string>> = {
  host: '唐僧',
  'social-ammo': '白骨精',
}

const PORTRAIT_IDS = new Set(BUILTIN_TEMPLATES.map((template) => template.id))

/** Agent 身份对应的西游记卡通头像。未知身份落到主理人，不用名字首字。 */
export function agentPortrait(templateId: string): AgentPortrait {
  const id = PORTRAIT_IDS.has(templateId) ? templateId : 'host'
  return { id, file: `avatars/${id}.png` }
}
