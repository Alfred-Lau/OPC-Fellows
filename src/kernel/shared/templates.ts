import { HOST_AGENT_ID, HOST_TEMPLATE_ID, type AgentTemplate } from './agent.ts'

/**
 * 开源花名册只留主理人和社媒弹药手。
 */
export const BUILTIN_TEMPLATES: readonly AgentTemplate[] = [
  {
    id: HOST_TEMPLATE_ID,
    role: '主理人',
    description: '默认出现在每个项目里：读改工作区、跑命令、查网页和 GitHub，先出计划再动手。',
    persona:
      '项目默认主成员。先看工作区再动手；改代码先对齐、红绿测试、最小补丁，改完对照验收和两轴审查。职业专项请 @ 对应成员。',
    mark: '主',
    hue: 4,
    agentKind: 'conversational',
    singleton: true,
    moduleIds: [],
    defaultAgentId: HOST_AGENT_ID,
    workspaceName: '工作台',
    group: '核心',
    suggestedCapabilities: ['kernel', 'workspace', 'mcp-github'],
    toolPacks: ['kernel', 'workspace', 'mcp-github'],
    planMode: true,
    inCatalog: false,
  },
  {
    id: 'social-ammo',
    role: '社媒弹药手',
    description: '按产品目录生成六平台文案草稿，记录发布与互动数据。',
    persona: '按产品能力写出六平台文案，记下发布和互动。',
    mark: '弹',
    hue: 7,
    agentKind: 'dashboard',
    singleton: true,
    moduleIds: ['social-ammo'],
    viewId: 'social-ammo',
    defaultAgentId: 'social-ammo',
    workspaceName: '弹药',
    group: '内容',
    suggestedCapabilities: ['todos:write'],
  },
]

export const OPENSOURCE_ROSTER_TEMPLATE_IDS = ['host', 'social-ammo'] as const

export const OPENSOURCE_DEFAULT_MODULE_IDS = ['social-ammo'] as const

export function isOpensourceRosterTemplate(id: string): boolean {
  return id === 'host' || id === 'social-ammo'
}

export function isOpensourceDefaultModule(id: string): boolean {
  return id === 'social-ammo'
}

const TEMPLATE_BY_ID = new Map(BUILTIN_TEMPLATES.map((template) => [template.id, template]))

export function templateById(id: string): AgentTemplate | undefined {
  return TEMPLATE_BY_ID.get(id)
}

/** 模块 id → 用于幂等创建默认实例的模板。 */
export function templateForModule(moduleId: string): AgentTemplate | undefined {
  return BUILTIN_TEMPLATES.find(
    (template) => template.defaultAgentId !== '' && template.moduleIds.length === 1 && template.moduleIds[0] === moduleId,
  )
}

export function listedTemplates(): AgentTemplate[] {
  return BUILTIN_TEMPLATES.filter(
    (template) =>
      isOpensourceRosterTemplate(template.id) &&
      template.agentKind !== 'background' &&
      template.inRoster !== false &&
      template.inCatalog !== false,
  )
}
