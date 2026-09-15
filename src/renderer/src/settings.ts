import { describeAgentStatus, type AgentRecord } from '../../kernel/shared/agent'
import { isActiveRosterAgent } from '../../kernel/shared/agents'
import { templateForModule } from '../../kernel/shared/templates'
import { describeStatus, isHighRisk, type ModuleInfo, type ModuleLogEntry, type ModuleStatus } from '../../kernel/shared/module'
import type { AvailableModule, ModuleSourceRef } from '../../kernel/shared/repository'
import {
  agentHasSkill,
  holdersOfSkill,
  listWorkbenchSkills,
  workbenchSkillMark,
  type WorkbenchSkill,
} from '../../kernel/shared/workbench-skills'
import { agentAvatarEl, moduleAvatarEl } from './avatar'

const SETTINGS_SECTIONS = ['skills', 'installed', 'sources', 'repo', 'channels'] as const
type SettingsSection = (typeof SETTINGS_SECTIONS)[number]
const SETTINGS_SECTION_KEY = 'ownworkbuddy.settingsSection'

const view = required('#view-settings', HTMLElement)
const settingsNav = required('#settings-nav', HTMLElement)
const skillList = required('#skill-list', HTMLDivElement)
const skillHint = required('#skill-hint', HTMLParagraphElement)
const moduleList = required('#module-list', HTMLDivElement)
const moduleHint = required('#module-hint', HTMLParagraphElement)
const sourceList = required('#source-list', HTMLUListElement)
const sourceForm = required('#source-form', HTMLFormElement)
const sourceKind = required('#source-kind', HTMLSelectElement)
const sourceLocation = required('#source-location', HTMLInputElement)
const availableList = required('#available-list', HTMLDivElement)
const repoHint = required('#repo-hint', HTMLParagraphElement)
const refreshRepo = required('#repo-refresh', HTMLButtonElement)
const channelList = required('#channel-list', HTMLUListElement)
const channelHint = required('#channel-hint', HTMLParagraphElement)

const STATUS_TONE: Record<ModuleStatus, string> = {
  active: 'ok',
  loading: 'warn',
  pending: 'warn',
  'needs-config': 'warn',
  failed: 'bad',
  disabled: 'muted',
}

let bound = false
let busy = false
let lastModules: ModuleInfo[] = []
let lastLogs: ModuleLogEntry[] = []
let lastAgents: AgentRecord[] = []
let pendingSkill: WorkbenchSkill | undefined
let assignAgentId = ''

function required<T extends typeof HTMLElement>(selector: string, ctor: T): InstanceType<T> {
  const node = document.querySelector(selector)
  if (!(node instanceof ctor)) {
    throw new Error(`missing ${selector}`)
  }
  return node as InstanceType<T>
}

function isSettingsSection(value: string | undefined): value is SettingsSection {
  return SETTINGS_SECTIONS.some((section) => section === value)
}

function readSettingsSection(): SettingsSection {
  const stored = localStorage.getItem(SETTINGS_SECTION_KEY)
  return isSettingsSection(stored) ? stored : 'skills'
}

function showSettingsSection(section: SettingsSection): void {
  localStorage.setItem(SETTINGS_SECTION_KEY, section)
  for (const button of settingsNav.querySelectorAll<HTMLButtonElement>('[data-settings-section]')) {
    button.classList.toggle('is-current', button.dataset.settingsSection === section)
  }
  for (const block of view.querySelectorAll<HTMLElement>('.settings-block[data-settings-section]')) {
    block.hidden = block.dataset.settingsSection !== section
  }
}

export function activateSettings(): void {
  if (!bound) {
    bound = true
    settingsNav.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest('button[data-settings-section]') : null
      if (!(button instanceof HTMLButtonElement) || !isSettingsSection(button.dataset.settingsSection)) {
        return
      }
      showSettingsSection(button.dataset.settingsSection)
    })
    sourceForm.addEventListener('submit', (event) => {
      event.preventDefault()
      void addSource()
    })
    refreshRepo.addEventListener('click', () => {
      void renderRepository()
    })
    required('#assign-skill-form', HTMLFormElement).addEventListener('submit', (event) => {
      const submitter = 'submitter' in event ? event.submitter : null
      const value =
        submitter instanceof HTMLButtonElement ? submitter.value : ''
      if (value === 'assign') {
        event.preventDefault()
        void confirmAssignSkill()
        return
      }
      closeAssignSkill()
    })
    required('#assign-skill-revoke', HTMLButtonElement).addEventListener('click', () => {
      void revokeAssignedSkill()
    })
    required('#assign-skill', HTMLDialogElement).addEventListener('close', () => {
      pendingSkill = undefined
      assignAgentId = ''
    })
    window.ownworkbuddy.workbench.onChanged(() => {
      if (view.dataset.active === 'true') {
        void renderSkills()
        void renderModules()
        void renderChannels()
      }
    })
    document.addEventListener('click', (event) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      for (const details of view.querySelectorAll<HTMLDetailsElement>('.module-more[open]')) {
        if (!details.contains(target)) {
          details.open = false
        }
      }
    })
  }
  view.dataset.active = 'true'
  showSettingsSection(readSettingsSection())
  void renderSkills()
  void renderModules()
  void renderSources()
  void renderChannels()
}

async function renderSkills(): Promise<void> {
  const snapshot = await window.ownworkbuddy.agents.snapshot()
  lastAgents = snapshot.agents
  skillList.replaceChildren()
  const groups = new Map<string, WorkbenchSkill[]>()
  for (const skill of listWorkbenchSkills()) {
    const bucket = groups.get(skill.group) ?? []
    bucket.push(skill)
    groups.set(skill.group, bucket)
  }
  for (const [group, items] of groups) {
    const heading = document.createElement('h4')
    heading.className = 'module-group'
    heading.textContent = group
    const grid = document.createElement('div')
    grid.className = 'skill-grid'
    for (const skill of items) {
      grid.append(workbenchSkillCard(skill))
    }
    skillList.append(heading, grid)
  }
  const assigned = lastAgents.filter((agent) => (agent.skillIds?.length ?? 0) > 0).length
  skillHint.textContent =
    assigned === 0
      ? `共 ${listWorkbenchSkills().length} 条 Skill。点卡片选成员赋能；赋能后他在主对话和项目里会调用这条。`
      : `共 ${listWorkbenchSkills().length} 条 Skill，已赋能到 ${assigned} 位成员。`
}

function workbenchSkillCard(skill: WorkbenchSkill): HTMLElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'skill-mini'
  button.dataset.skill = skill.id
  const illus = moduleAvatarEl(skill.portraitId, workbenchSkillMark(skill), skill.hue)
  const copy = document.createElement('span')
  copy.className = 'skill-mini-copy'
  const name = document.createElement('span')
  name.className = 'skill-mini-name'
  name.textContent = skill.title
  const hint = document.createElement('span')
  hint.className = 'skill-mini-hint'
  const holders = holdersOfSkill(lastAgents, skill.id)
  hint.textContent = holders.length > 0 ? `已赋能 ${holders.map((agent) => agent.title).join('、')}` : skill.hint
  hint.title = hint.textContent
  copy.append(name, hint)
  button.append(illus, copy)
  button.classList.toggle('is-assigned', holders.length > 0)
  button.addEventListener('click', () => {
    openAssignSkill(skill)
  })
  return button
}

function assignableAgents(): AgentRecord[] {
  return lastAgents.filter((agent) => isActiveRosterAgent(agent) && agent.kind !== 'window')
}

function openAssignSkill(skill: WorkbenchSkill): void {
  pendingSkill = skill
  const holders = holdersOfSkill(lastAgents, skill.id)
  assignAgentId = holders[0]?.id ?? assignableAgents()[0]?.id ?? ''
  required('#assign-skill-title', HTMLElement).textContent = `赋能「${skill.title}」`
  required('#assign-skill-copy', HTMLElement).textContent = skill.hint
  setAssignHint('')
  paintAssignAgents()
  const dialog = required('#assign-skill', HTMLDialogElement)
  if (typeof dialog.showModal === 'function') {
    dialog.showModal()
  }
}

function closeAssignSkill(): void {
  pendingSkill = undefined
  assignAgentId = ''
  const dialog = document.querySelector('#assign-skill')
  if (dialog instanceof HTMLDialogElement && dialog.open) {
    dialog.close()
  }
}

function setAssignHint(text: string): void {
  const hint = required('#assign-skill-hint', HTMLElement)
  hint.textContent = text
  hint.classList.toggle('is-error', Boolean(text))
}

function paintAssignAgents(): void {
  const list = required('#assign-skill-agents', HTMLElement)
  const candidates = assignableAgents()
  list.replaceChildren()
  required('#assign-skill-meta', HTMLElement).textContent =
    candidates.length === 0 ? '还没有可赋能的成员' : '选择获得这条能力的成员'
  for (const agent of candidates) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'task-agent'
    button.classList.toggle('is-selected', agent.id === assignAgentId)
    button.classList.toggle('is-lead', agentHasSkill(agent, pendingSkill?.id ?? ''))
    button.classList.toggle('needs-module', agent.status === 'needs-module')
    const avatar = agentAvatarEl({ templateId: agent.templateId, hue: agent.hue })
    const label = document.createElement('span')
    label.textContent = agentHasSkill(agent, pendingSkill?.id ?? '')
      ? `${agent.title} · 已赋能`
      : `${agent.title} · ${describeAgentStatus(agent.status)}`
    button.append(avatar, label)
    button.addEventListener('click', () => {
      assignAgentId = agent.id
      paintAssignAgents()
    })
    list.append(button)
  }
  const selected = candidates.find((agent) => agent.id === assignAgentId)
  const already = Boolean(selected && pendingSkill && agentHasSkill(selected, pendingSkill.id))
  required('#assign-skill-submit', HTMLButtonElement).disabled = !selected
  const revoke = required('#assign-skill-revoke', HTMLButtonElement)
  revoke.hidden = !already
}

async function confirmAssignSkill(): Promise<void> {
  if (!pendingSkill || !assignAgentId) {
    setAssignHint('先选一个成员')
    return
  }
  try {
    await window.ownworkbuddy.agents.assignSkill(assignAgentId, pendingSkill.id)
    closeAssignSkill()
    await renderSkills()
  } catch (error) {
    setAssignHint(error instanceof Error ? error.message : String(error))
  }
}

async function revokeAssignedSkill(): Promise<void> {
  if (!pendingSkill || !assignAgentId) {
    return
  }
  try {
    await window.ownworkbuddy.agents.revokeSkill(assignAgentId, pendingSkill.id)
    closeAssignSkill()
    await renderSkills()
  } catch (error) {
    setAssignHint(error instanceof Error ? error.message : String(error))
  }
}

async function renderModules(): Promise<void> {
  const [modules, logs, snapshot] = await Promise.all([
    window.ownworkbuddy.workbench.modules(),
    window.ownworkbuddy.workbench.logs(),
    window.ownworkbuddy.agents.snapshot(),
  ])
  lastModules = modules
  lastLogs = logs
  lastAgents = snapshot.agents
  moduleList.replaceChildren()
  const groups = new Map<string, ModuleInfo[]>()
  for (const module of modules) {
    const bucket = groups.get(module.manifest.group) ?? []
    bucket.push(module)
    groups.set(module.manifest.group, bucket)
  }
  for (const [group, items] of groups) {
    const heading = document.createElement('h4')
    heading.className = 'module-group'
    heading.textContent = group
    const grid = document.createElement('div')
    grid.className = 'module-grid'
    for (const module of items) {
      grid.append(moduleCard(module))
    }
    moduleList.append(heading, grid)
  }
  const off = modules.filter((module) => !module.enabled).length
  moduleHint.textContent =
    off === 0
      ? `${modules.length} 个模块全部启用。待办与首页属于内核，不可停用。`
      : `${modules.length} 个模块，其中 ${off} 个已停用。停用只是收起入口，数据都还在。`
}

function moduleHue(moduleId: string): number {
  return templateForModule(moduleId)?.hue ?? 4
}

function moduleCard(module: ModuleInfo): HTMLElement {
  const template = templateForModule(module.manifest.id)
  const live = template
    ? lastAgents.find((agent) => agent.templateId === template.id && agent.origin === 'builtin-default')
    : undefined
  const extras: { label: string; danger?: boolean; run: () => void }[] = [
    { label: '上移', run: () => void moveModule(module.manifest.id, -1) },
    { label: '下移', run: () => void moveModule(module.manifest.id, 1) },
  ]
  if (module.manifest.removable) {
    extras.push({ label: '卸载', danger: true, run: () => void uninstall(module.manifest.id) })
  }
  const lastError = lastLogs.find((entry) => entry.moduleId === module.manifest.id && entry.level === 'error')
  const agentHint = live
    ? `${live.title} · ${describeAgentStatus(live.status)}`
    : template
      ? template.role
      : undefined
  const card = skillCard({
    id: module.manifest.id,
    title: module.manifest.title,
    mark: module.manifest.mark,
    hue: moduleHue(module.manifest.id),
    description: module.manifest.description,
    version: `v${module.manifest.version}${module.source === 'builtin' ? '' : ' · 第三方'}`,
    status: { text: describeStatus(module.status, module.detail), tone: STATUS_TONE[module.status] },
    statusAttr: module.status,
    extras,
    titleHint: [agentHint, lastError?.message].filter(Boolean).join('\n'),
  })
  card.querySelector('.module-illus-well')?.append(toggle(module))
  return card
}

function skillCard(input: {
  id: string
  title: string
  mark: string
  hue: number
  description: string
  version: string
  status?: { text: string; tone: string }
  statusAttr?: string
  extraClass?: string
  extras?: { label: string; danger?: boolean; run: () => void }[]
  titleHint?: string
  action?: HTMLElement
}): HTMLElement {
  const card = document.createElement('article')
  card.className = input.extraClass ? `module-card ${input.extraClass}` : 'module-card'
  if (input.statusAttr) {
    card.dataset.status = input.statusAttr
  }
  if (input.titleHint) {
    card.title = input.titleHint
  }

  const well = document.createElement('div')
  well.className = 'module-illus-well'
  well.dataset.hue = String(input.hue)
  well.append(moduleAvatarEl(input.id, input.mark, input.hue))

  const name = document.createElement('h4')
  name.className = 'module-name'
  name.textContent = input.title

  const description = document.createElement('p')
  description.className = 'module-desc'
  description.textContent = input.description
  description.title = input.description

  const foot = document.createElement('div')
  foot.className = 'module-foot'
  const meta = document.createElement('div')
  meta.className = 'module-meta'
  const version = document.createElement('span')
  version.className = 'module-version'
  version.textContent = input.version
  meta.append(version)
  if (input.status) {
    const status = document.createElement('span')
    status.className = 'module-status'
    status.dataset.tone = input.status.tone
    status.textContent = input.status.text
    status.title = input.status.text
    meta.append(status)
  }
  foot.append(meta)
  if (input.action) {
    foot.append(input.action)
  } else if (input.extras && input.extras.length > 0) {
    foot.append(moreMenu(input.extras))
  }

  card.append(well, name, description, foot)
  return card
}

function moreMenu(items: { label: string; danger?: boolean; run: () => void }[]): HTMLDetailsElement {
  const details = document.createElement('details')
  details.className = 'module-more'
  const summary = document.createElement('summary')
  summary.textContent = '···'
  summary.title = '更多'
  const menu = document.createElement('div')
  menu.className = 'module-more-menu'
  for (const item of items) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = item.danger ? 'ghost danger' : 'ghost'
    button.textContent = item.label
    button.addEventListener('click', () => {
      details.open = false
      item.run()
    })
    menu.append(button)
  }
  details.append(summary, menu)
  return details
}

async function moveModule(id: string, delta: number): Promise<void> {
  const ids = lastModules.map((module) => module.manifest.id)
  const index = ids.indexOf(id)
  const next = index + delta
  if (index < 0 || next < 0 || next >= ids.length) {
    return
  }
  const copy = [...ids]
  const [moved] = copy.splice(index, 1)
  copy.splice(next, 0, moved!)
  await window.ownworkbuddy.workbench.reorder(copy)
  await renderModules()
}

function toggle(module: ModuleInfo): HTMLElement {
  const label = document.createElement('label')
  label.className = 'module-toggle'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = module.enabled
  input.disabled = busy
  input.addEventListener('change', () => {
    void setEnabled(module.manifest.id, input.checked)
  })
  const track = document.createElement('span')
  track.className = 'toggle-track'
  label.append(input, track)
  label.title = module.enabled ? '停用' : '启用'
  return label
}

async function setEnabled(id: string, enabled: boolean): Promise<void> {
  if (busy) {
    return
  }
  busy = true
  moduleList.dataset.busy = 'true'
  try {
    if (enabled) {
      await window.ownworkbuddy.workbench.enable(id)
    } else {
      await window.ownworkbuddy.workbench.disable(id)
    }
  } finally {
    busy = false
    moduleList.dataset.busy = 'false'
    await renderModules()
  }
}

async function renderSources(): Promise<void> {
  const sources = await window.ownworkbuddy.repository.sources()
  sourceList.replaceChildren()
  if (sources.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'empty'
    empty.textContent = '还没有添加模块源'
    sourceList.append(empty)
  }
  for (const source of sources) {
    sourceList.append(sourceRow(source))
  }
  await renderRepository()
}

function sourceRow(source: ModuleSourceRef): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'source-row'
  const kind = document.createElement('span')
  kind.className = 'source-kind'
  kind.textContent = source.kind === 'git' ? 'Git' : '本地'
  const label = document.createElement('span')
  label.className = 'source-label'
  label.textContent = source.label
  label.title = source.location
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'ghost'
  remove.textContent = '移除'
  remove.addEventListener('click', () => {
    void window.ownworkbuddy.repository.removeSource(source.id).then(() => renderSources())
  })
  item.append(kind, label, remove)
  return item
}

async function addSource(): Promise<void> {
  const location = sourceLocation.value.trim()
  if (!location) {
    return
  }
  const kind = sourceKind.value === 'git' ? 'git' : 'local'
  try {
    await window.ownworkbuddy.repository.addSource(kind, location)
    sourceLocation.value = ''
    await renderSources()
  } catch (error) {
    repoHint.textContent = `添加源失败：${describeError(error)}`
  }
}

async function renderRepository(): Promise<void> {
  repoHint.textContent = '正在读取模块源…'
  availableList.replaceChildren()
  let modules: AvailableModule[] = []
  try {
    modules = await window.ownworkbuddy.repository.available()
  } catch (error) {
    repoHint.textContent = `读取失败：${describeError(error)}`
    return
  }
  if (modules.length === 0) {
    repoHint.textContent = '源里没有可安装的模块。模块需要在 package.json 里声明 ownworkbuddy 字段。'
    return
  }
  repoHint.textContent = `共 ${modules.length} 个可用模块。安装前请确认它申请的能力。`
  const grid = document.createElement('div')
  grid.className = 'module-grid'
  for (const module of modules) {
    grid.append(availableCard(module))
  }
  availableList.append(grid)
}

function availableCard(module: AvailableModule): HTMLElement {
  const action = document.createElement('button')
  action.type = 'button'
  action.className = module.installed && !module.upgradable ? 'ghost module-install' : 'primary module-install'
  action.textContent = module.upgradable ? '升级' : module.installed ? '已安装' : '安装'
  action.disabled = module.installed && !module.upgradable
  action.addEventListener('click', () => {
    void install(module)
  })
  const risky = module.manifest.capabilities.filter((capability) => isHighRisk(capability))
  return skillCard({
    id: module.manifest.id,
    title: module.manifest.title,
    mark: module.manifest.mark,
    hue: moduleHue(module.manifest.id),
    description: module.manifest.description,
    version: `v${module.manifest.version}`,
    extraClass: 'is-available',
    status: risky.length > 0 ? { text: `高危：${risky.join('、')}`, tone: 'bad' } : undefined,
    action,
  })
}

async function install(module: AvailableModule): Promise<void> {
  const risky = module.manifest.capabilities.filter((capability) => isHighRisk(capability))
  const consent = risky.length === 0
    ? window.confirm(`安装「${module.manifest.title}」？`)
    : window.confirm(
        `「${module.manifest.title}」申请了高危能力：\n${risky.join('\n')}\n\n第三方模块以你的身份运行，确认来源可信再继续。`,
      )
  if (!consent) {
    return
  }
  const result = await window.ownworkbuddy.repository.install(module.sourceId, module.manifest.id)
  repoHint.textContent = result.ok
    ? `已安装并启用 ${module.manifest.title}。`
    : `安装失败：${result.error ?? '未知错误'}`
  await renderRepository()
  await renderModules()
}

async function uninstall(moduleId: string): Promise<void> {
  if (!window.confirm(`卸载模块 ${moduleId}？它的数据目录会一并删除。`)) {
    return
  }
  const result = await window.ownworkbuddy.repository.uninstall(moduleId)
  if (!result.ok) {
    moduleHint.textContent = `卸载失败：${result.error ?? '未知错误'}`
    return
  }
  await renderModules()
  await renderRepository()
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function renderChannels(): Promise<void> {
  const channels = await window.ownworkbuddy.workbench.channels()
  channelList.replaceChildren()
  if (channels.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'empty'
    empty.textContent = '还没有模块注册通道'
    channelList.append(empty)
    channelHint.textContent = '启用模块后，这里会列出它占用的 IPC 通道。'
    return
  }
  for (const item of channels) {
    const row = document.createElement('li')
    row.className = 'channel-row'
    const channel = document.createElement('code')
    channel.textContent = item.channel
    const owner = document.createElement('span')
    owner.textContent = item.moduleId
    row.append(channel, owner)
    channelList.append(row)
  }
  channelHint.textContent = `${channels.length} 条通道。停用模块后对应通道会注销。`
}
