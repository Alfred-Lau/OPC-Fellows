import {
  HOST_BADGE_LABEL,
  HOST_BADGE_TITLE,
  INBOX_THREAD_ID,
  type AgentRecord,
  type AgentTemplate,
  type ProjectContextFile,
  type ThreadMessage,
  type ThreadRecord,
} from '../../kernel/shared/agent'
import {
  AGENT_TITLE_MAX,
  canCloneAgent,
  canConfigurePacks,
  canRemoveAgent,
  filterMentionAgents,
  isHostAgent,
  isSkillMissText,
  listComposerSkills,
  mentionQueryAt,
  mentionSpans,
  occupationSkillChoices,
  rosterAgentsByIds,
  inboxMissReply,
  skillMissReply,
  skillQueryAt,
  type ComposerSkill,
  type DispatchAction,
} from '../../kernel/shared/agents'
import {
  canBindProjectFolder,
  composerContextChip,
  composerContextMenuItems,
  contextFileFromPath,
  type ComposerContextAction,
} from '../../kernel/shared/project-context-ui'
import { splitAssistantPayload } from '../../kernel/shared/dsh-rpc'
import {
  composerModeOf,
  offersComposerModes,
  parseComposerMode,
  storedComposerModeOf,
  type ComposerMode,
} from '../../kernel/shared/plan-mode'
import {
  NEW_PROJECT_ID,
  PROJECT_DESC_MAX,
  PROJECT_TITLE_MAX,
  clickProjectAgent,
  defaultProjectAgentSelection,
  describeNewTaskPage,
  isProjectPinned,
  listProjects,
  shouldShowThreadFeed,
  withHostAgent,
  type NewTaskAgentChip,
} from '../../kernel/shared/new-task'
import {
  RAIL_DRAG_THRESHOLD,
  applyAgentSortOrder,
  idsAtPlaceholder,
  insertBeforeIdFromY,
  listedAgentRailIds,
  listPinnedProjects,
  listUnpinnedProjects,
  mergeProjectRailIds,
  sortAgentsForRail,
  type RailList,
} from '../../kernel/shared/rail-chrome'
import {
  agentRailActivity,
  describeRailActivity,
  isRailBusy,
  projectRailActivity,
  removeRailMark,
  upsertRailMark,
  type RailActivityKind,
  type RailActivityMark,
} from '../../kernel/shared/rail-activity'
import { currentGlobalNav } from '../../kernel/shared/global-nav'
import type { NavEntry } from '../../kernel/shared/nav'
import {
  clickToolTab,
  collapseToolPane,
  defaultToolPane,
  isToolTab,
  openSchedule,
  openSkillsPane,
  openToolTab,
  parkToolTab,
  toggleToolExpanded,
  type ToolPaneState,
  type ToolTab,
} from '../../kernel/shared/tool-pane'
import {
  TOOL_WIDTH_DEFAULT,
  clampToolWidth,
  defaultToolWidth,
  parseToolWidth,
} from '../../kernel/shared/tool-width'
import { agentAvatarEl, paintAgentAvatar, userAvatarEl } from './avatar'
import { formatCalendarTitle } from '../../shared/calendar'
import { DEEPSEEK_MODEL, DEEPSEEK_MODEL_LABEL } from '../../shared/deepseek'
import { renderChatMarkdown } from '../../shared/chat-markdown'
import { activateCalendar } from './calendar'
import { isWorkbenchAdviceInvoke } from '../../kernel/shared/workbench-skills'
import { formatToolEventLine, type ToolEvent } from '../../kernel/shared/tool-events'
import { TOOL_PACKS, defaultToolPacks, isToolPackId, toolPackTitle, type ToolPackId } from '../../kernel/shared/tool-packs'
import { runSkillInvoke } from './skill-invoke'
import { seedTodos } from './todos'
import { unmountHosted } from './module-host'

export type StudioFocus = {
  threadId: string
  agentId?: string
  view: string
}

type Activate = (view: string) => void

const VIEWS_IN_TOOL = new Set(['todos', 'social-ammo', 'extensions'])

let activateView: Activate = () => undefined
let navEntries: NavEntry[] = []
let agents: AgentRecord[] = []
let threads: ThreadRecord[] = []
let messages: ThreadMessage[] = []
let focus: StudioFocus = { threadId: INBOX_THREAD_ID, view: 'home' }
let selectedTemplateId = 'social-ammo'
let cloneFrom: string | undefined
let configureAgentId: string | undefined
let mentionIndex = 0
let mentionHits: AgentRecord[] = []
let skillHits: ComposerSkill[] = []
let chatting = false
let composerMode: ComposerMode = 'agent'
let railMarks: RailActivityMark[] = []
const railErrorTimers = new Map<string, number>()
let typingAgentId = ''
const TOOL_WIDTH_KEY = 'ownworkbuddy.toolWidth'
let hostLabel = ''
let selectedTaskIds: string[] = []
let selectedProjectId = NEW_PROJECT_ID
let leadTaskId: string | undefined
let draftProjectIds: string[] = []
let draftLeadId: string | undefined
let pendingFolderPath = ''
let pendingFiles: ProjectContextFile[] = []
let toolPane: ToolPaneState = defaultToolPane()
let renameTarget: { kind: 'project' | 'agent'; id: string } | undefined
let railDrag:
  | {
      list: RailList
      id: string
      startY: number
      offsetY: number
      pointerId: number
      active: boolean
      button: HTMLButtonElement
      placeholder?: HTMLElement
    }
  | undefined
let suppressRailClick = false
let railPointerBound = false

export function currentFocus(): StudioFocus {
  return focus
}

export function bindStudio(activate: Activate): void {
  activateView = activate
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-global]')) {
    button.addEventListener('click', () => {
      const action = button.dataset.global
      if (action === 'home') {
        focusInbox('home')
        return
      }
      if (action === 'task') {
        openNewTask()
        return
      }
      if (action === 'schedule') {
        openScheduleView()
        return
      }
      if (action === 'extensions') {
        showExtensions()
        return
      }
    })
  }
  required('#agent-create', HTMLButtonElement).addEventListener('click', () => {
    void openCreateAgent()
  })
  required('#project-create', HTMLButtonElement).addEventListener('click', () => {
    openNewTask()
    openCreateProject()
  })
  required('#task-project-label', HTMLButtonElement).addEventListener('click', (event) => {
    event.stopPropagation()
    if (selectedProjectId === NEW_PROJECT_ID) {
      openCreateProject()
      return
    }
    toggleProjectMenu()
  })
  required('#task-project-trigger', HTMLButtonElement).addEventListener('click', (event) => {
    event.stopPropagation()
    toggleProjectMenu()
  })
  required('#create-project-form', HTMLFormElement).addEventListener('submit', (event) => {
    const submitter = (event as SubmitEvent).submitter
    if (submitter instanceof HTMLButtonElement && submitter.value === 'cancel') {
      return
    }
    event.preventDefault()
    void submitCreateProject()
  })
  required('#create-project-desc', HTMLTextAreaElement).addEventListener('input', syncProjectDescCount)
  required('#rename-item-form', HTMLFormElement).addEventListener('submit', (event) => {
    const submitter = (event as SubmitEvent).submitter
    if (submitter instanceof HTMLButtonElement && submitter.value === 'cancel') {
      renameTarget = undefined
      return
    }
    event.preventDefault()
    void submitRenameItem()
  })
  required('#rail-context-menu', HTMLElement).addEventListener('click', (event) => {
    event.stopPropagation()
  })
  required('#rail-context-menu', HTMLElement).addEventListener('contextmenu', (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
  required('#thread-nav', HTMLElement).addEventListener('contextmenu', (event) => {
    event.preventDefault()
  })
  required('#agent-nav', HTMLElement).addEventListener('contextmenu', (event) => {
    event.preventDefault()
  })
  required('#task-project-menu', HTMLElement).addEventListener('click', (event) => {
    event.stopPropagation()
  })
  required('#rail-user', HTMLButtonElement).addEventListener('click', (event) => {
    event.stopPropagation()
    toggleRailUserMenu()
  })
  required('#rail-user-pop', HTMLElement).addEventListener('click', (event) => {
    event.stopPropagation()
  })
  required('#rail-settings', HTMLButtonElement).addEventListener('click', showPrefs)
  required('#prefs-back', HTMLButtonElement).addEventListener('click', () => {
    focusInbox('home')
  })
  document.addEventListener('click', () => {
    closeRailUserMenu()
    closeProjectMenu()
    closeRailMenu()
    hideContextMenus()
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeRailUserMenu()
      closeProjectMenu()
      closeRailMenu()
      hideContextMenus()
    }
  })
  document.addEventListener('scroll', () => closeRailMenu(), true)
  required('#tool-close', HTMLButtonElement).addEventListener('click', () => {
    paintToolPane(collapseToolPane(toolPane))
  })
  required('#tool-reveal', HTMLButtonElement).addEventListener('click', () => {
    paintToolPane(openToolTab(toolPane, toolPane.tab))
    if (toolPane.tab === 'calendar') {
      activateCalendar()
    }
  })
  required('#tool-expand', HTMLButtonElement).addEventListener('click', () => {
    paintToolPane(toggleToolExpanded(toolPane))
  })
  required('#composer-plus', HTMLButtonElement).addEventListener('click', (event) => {
    event.stopPropagation()
    toggleContextMenu('inbox')
  })
  required('#composer-host', HTMLButtonElement).addEventListener('click', (event) => {
    event.stopPropagation()
    toggleContextMenu('inbox')
  })
  required('#composer-context-menu', HTMLElement).addEventListener('click', (event) => {
    event.stopPropagation()
  })
  required('#task-plus', HTMLButtonElement).addEventListener('click', (event) => {
    event.stopPropagation()
    toggleContextMenu('task')
  })
  required('#task-host', HTMLButtonElement).addEventListener('click', (event) => {
    event.stopPropagation()
    toggleContextMenu('task')
  })
  required('#task-context-menu', HTMLElement).addEventListener('click', (event) => {
    event.stopPropagation()
  })
  required('#task-form', HTMLFormElement).addEventListener('submit', (event) => {
    event.preventDefault()
    void submitNewTask()
  })
  required('#task-command', HTMLTextAreaElement).addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      required('#task-form', HTMLFormElement).requestSubmit()
    }
  })
  for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-tool-tab]')) {
    tab.addEventListener('click', () => {
      const tabId = isToolTab(tab.dataset.toolTab) ? tab.dataset.toolTab : 'tool'
      const next = clickToolTab(toolPane, tabId)
      paintToolPane(next)
      if (next.tab === 'calendar' && !next.collapsed) {
        activateCalendar()
      }
    })
  }
  required('#create-agent-shuffle', HTMLButtonElement).addEventListener('click', () => {
    void shuffleName()
  })
  required('#create-agent-desc', HTMLTextAreaElement).addEventListener('input', syncDescCount)
  required('#create-agent-form', HTMLFormElement).addEventListener('submit', (event) => {
    const submitter = (event as SubmitEvent).submitter
    if (submitter instanceof HTMLButtonElement && submitter.value === 'cancel') {
      return
    }
    event.preventDefault()
    void submitCreateAgent()
  })
  required('#configure-agent-form', HTMLFormElement).addEventListener('submit', (event) => {
    const submitter = (event as SubmitEvent).submitter
    if (submitter instanceof HTMLButtonElement && submitter.value === 'cancel') {
      configureAgentId = undefined
      return
    }
    event.preventDefault()
    void submitConfigureAgent()
  })
  const command = commandEl()
  command.addEventListener('input', () => {
    renderComposerMenu()
  })
  command.addEventListener(
    'keydown',
    (event) => {
      if (handleComposerKeys(event)) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
    true,
  )
  command.addEventListener('blur', () => {
    window.setTimeout(() => hideComposerMenu(), 120)
  })
  window.ownworkbuddy.agents.onChanged(() => {
    void refreshStudio()
  })
  window.ownworkbuddy.agents.onTool((event) => {
    paintToolEvent(event)
  })
  bindRailPointer()
  bindToolResize()
  void loadHostLabel()
  void refreshStudio()
}

export function setHostLabel(name: string): void {
  hostLabel = name
  paintComposerContext()
}

async function loadHostLabel(): Promise<void> {
  const name = window.ownworkbuddy.profile
    ? (await window.ownworkbuddy.profile.get()).label
    : await window.ownworkbuddy.agents.hostName()
  setHostLabel(name)
}

export async function refreshStudio(): Promise<void> {
  if (railDrag?.active) {
    return
  }
  const snapshot = await window.ownworkbuddy.agents.snapshot()
  agents = snapshot.agents
  threads = snapshot.threads
  messages = snapshot.messages
  renderRail()
  renderThread()
}

export function setNavEntries(entries: NavEntry[]): void {
  navEntries = entries
}

export function focusInbox(view: 'home' | 'todos' = 'home'): void {
  closeCreateProject()
  focus = { threadId: INBOX_THREAD_ID, view: 'home' }
  document.body.dataset.thread = INBOX_THREAD_ID
  leaveHarness()
  activateView('home')
  paintToolPane(view === 'todos' ? openToolTab(toolPane, 'todos') : parkToolTab(toolPane, 'todos'))
  renderRail()
  renderThread()
}

export function openNewTask(): void {
  leaveHarness()
  closeCreateProject()
  selectedProjectId = NEW_PROJECT_ID
  const host = defaultProjectAgentSelection(agents)
  selectedTaskIds = host.selectedIds
  leadTaskId = host.leadId
  pendingFolderPath = ''
  pendingFiles = []
  focus = { threadId: INBOX_THREAD_ID, view: 'task' }
  document.body.dataset.view = 'task'
  document.body.dataset.thread = INBOX_THREAD_ID
  paintToolPane(parkToolTab(toolPane, toolPane.tab))
  closeProjectMenu()
  renderRail()
  renderThread()
}

export function openScheduleView(): void {
  leaveHarness()
  closeCreateProject()
  closeProjectMenu()
  focus = { threadId: focus.threadId, view: 'schedule' }
  document.body.dataset.view = 'schedule'
  paintToolPane(openSchedule(toolPane))
  activateCalendar()
  renderRail()
  renderThread()
}

function projectMenuEls(): { trigger: HTMLButtonElement; menu: HTMLElement } {
  return {
    trigger: required('#task-project-trigger', HTMLButtonElement),
    menu: required('#task-project-menu', HTMLElement),
  }
}

function closeProjectMenu(): void {
  const { trigger, menu } = projectMenuEls()
  menu.hidden = true
  trigger.setAttribute('aria-expanded', 'false')
}

function toggleProjectMenu(): void {
  const { trigger, menu } = projectMenuEls()
  const next = menu.hidden
  menu.hidden = !next
  trigger.setAttribute('aria-expanded', next ? 'true' : 'false')
}

function selectTaskProject(projectId: string): void {
  selectedProjectId = projectId
  pendingFolderPath = ''
  pendingFiles = []
  const current = threads.find((item) => item.id === projectId && item.kind === 'user')
  selectedTaskIds = current ? withHostAgent(current.agentIds) : defaultProjectAgentSelection(agents).selectedIds
  leadTaskId = current?.workspaceAgentId ?? selectedTaskIds[0]
  closeProjectMenu()
  renderTaskPage()
  if (projectId) {
    required('#task-command', HTMLTextAreaElement).focus()
  }
}

function renderTaskAgentChips(
  list: HTMLElement,
  chips: readonly NewTaskAgentChip[],
  selectedIds: readonly string[],
  leadId: string | undefined,
  onChange: (next: { selectedIds: string[]; leadId: string | undefined }) => void,
): void {
  list.replaceChildren()
  for (const chip of chips) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'task-agent'
    button.classList.toggle('is-selected', chip.selected)
    button.classList.toggle('is-lead', chip.lead)
    button.classList.toggle('is-locked', chip.locked)
    const source = agents.find((item) => item.id === chip.id)
    button.classList.toggle('needs-module', source?.status === 'needs-module')
    const avatar = agentAvatarEl({ templateId: source?.templateId ?? '', hue: chip.hue })
    const label = document.createElement('span')
    label.textContent = chip.title
    button.append(avatar, label)
    if (chip.locked) {
      button.classList.add('is-host')
      button.title = chip.lead ? HOST_BADGE_TITLE : '默认主理人：点选设为主成员，不能移出'
      button.append(hostBadgeEl())
    } else if (chip.lead) {
      button.title = '主成员'
    }
    if (chip.lead) {
      button.append(taskLeadBadge())
    }
    button.addEventListener('click', () => {
      onChange(clickProjectAgent(selectedIds, leadId, chip.id, chips.filter((item) => item.locked).map((item) => item.id)))
    })
    list.append(button)
  }
}

function setCreateProjectHint(text: string): void {
  const hint = required('#create-project-hint', HTMLElement)
  hint.textContent = text
  hint.classList.toggle('is-error', Boolean(text))
}

function syncProjectDescCount(): void {
  const desc = required('#create-project-desc', HTMLTextAreaElement)
  required('#create-project-count', HTMLElement).textContent = `${String(desc.value.length)}/${String(PROJECT_DESC_MAX)}`
}

function renderCreateProjectAgents(): void {
  const model = describeNewTaskPage({
    threads,
    agents,
    hostName: hostLabel,
    selectedIds: draftProjectIds,
    leadId: draftLeadId,
  })
  required('#create-project-agents-meta', HTMLElement).textContent =
    `选择加入项目的成员（${String(model.selectedCount)}/${String(model.totalCount)}）`
  renderTaskAgentChips(
    required('#create-project-agents', HTMLElement),
    model.agents,
    draftProjectIds,
    draftLeadId,
    (next) => {
      draftProjectIds = next.selectedIds
      draftLeadId = next.leadId
      renderCreateProjectAgents()
    },
  )
}

function closeCreateProject(): void {
  const dialog = document.querySelector('#create-project')
  if (dialog instanceof HTMLDialogElement && dialog.open) {
    dialog.close()
  }
}

function openCreateProject(): void {
  closeProjectMenu()
  const dialog = required('#create-project', HTMLDialogElement)
  const host = defaultProjectAgentSelection(agents)
  draftProjectIds = host.selectedIds
  draftLeadId = host.leadId
  required('#create-project-title', HTMLInputElement).value = ''
  required('#create-project-desc', HTMLTextAreaElement).value = ''
  setCreateProjectHint('')
  syncProjectDescCount()
  renderCreateProjectAgents()
  if (typeof dialog.showModal === 'function') {
    dialog.showModal()
  }
  required('#create-project-title', HTMLInputElement).focus()
}

async function submitCreateProject(): Promise<void> {
  const title = required('#create-project-title', HTMLInputElement).value
  const description = required('#create-project-desc', HTMLTextAreaElement).value
  if (!title.trim()) {
    setCreateProjectHint('先给项目起个标题')
    required('#create-project-title', HTMLInputElement).focus()
    return
  }
  if (draftProjectIds.length === 0) {
    const host = defaultProjectAgentSelection(agents)
    draftProjectIds = host.selectedIds
    draftLeadId = host.leadId
  }
  if (draftProjectIds.length === 0) {
    setCreateProjectHint('主理人还没就绪，稍后再开项目。')
    return
  }
  if (!(window.ownworkbuddy.agents.createProject instanceof Function)) {
    setCreateProjectHint('开发端还是旧主进程，完全退出后重新 pnpm dev。')
    return
  }
  const submit = required('#create-project-submit', HTMLButtonElement)
  submit.disabled = true
  try {
    const thread = await window.ownworkbuddy.agents.createProject(
      title,
      description,
      draftProjectIds,
      draftLeadId,
      pendingFolderPath || undefined,
      pendingFiles.length > 0 ? pendingFiles : undefined,
    )
    const snapshot = await window.ownworkbuddy.agents.snapshot()
    agents = snapshot.agents
    threads = snapshot.threads
    messages = snapshot.messages
    selectedProjectId = thread.id
    selectedTaskIds = [...thread.agentIds]
    leadTaskId = thread.workspaceAgentId
    pendingFolderPath = thread.folderPath ?? ''
    pendingFiles = thread.attachedFiles ?? []
    closeCreateProject()
    renderRail()
    renderThread()
    required('#task-command', HTMLTextAreaElement).focus()
  } catch (error) {
    setCreateProjectHint(error instanceof Error ? error.message : '没建起来，看是不是要重启一次开发端。')
  } finally {
    submit.disabled = false
  }
}

export function showPrefs(): void {
  closeCreateProject()
  closeRailUserMenu()
  leaveHarness()
  focus = { threadId: focus.threadId, view: 'prefs' }
  document.body.dataset.toolExpanded = 'false'
  activateView('prefs')
  renderRail()
}

export function showExtensions(): void {
  closeCreateProject()
  closeRailUserMenu()
  leaveHarness()
  focus = { threadId: focus.threadId, view: 'extensions' }
  paintToolPane(openSkillsPane(toolPane))
  activateView('extensions')
  renderRail()
}

/** @deprecated 旧入口，用户中心「设置」已改走独立页。 */
export function showSettings(): void {
  showPrefs()
}

function railUserEls(): { trigger: HTMLButtonElement; pop: HTMLElement } {
  return {
    trigger: required('#rail-user', HTMLButtonElement),
    pop: required('#rail-user-pop', HTMLElement),
  }
}

function closeRailUserMenu(): void {
  const { trigger, pop } = railUserEls()
  pop.hidden = true
  trigger.setAttribute('aria-expanded', 'false')
}

function toggleRailUserMenu(): void {
  const { trigger, pop } = railUserEls()
  const next = pop.hidden
  pop.hidden = !next
  trigger.setAttribute('aria-expanded', next ? 'true' : 'false')
}

export async function focusAgent(agentId: string, options: { revealTool?: boolean } = {}): Promise<void> {
  const agent = agents.find((item) => item.id === agentId) ?? (await loadAgent(agentId))
  if (!agent) {
    return
  }
  if (agent.kind === 'window') {
    await window.ownworkbuddy.workbench.open(agent.moduleIds[0] ?? agent.id)
    return
  }
  const thread =
    threads.find((item) => item.id === `thread:${agent.id}`) ?? threads.find((item) => item.agentIds.includes(agent.id))
  focus = {
    threadId: thread?.id ?? INBOX_THREAD_ID,
    agentId: agent.id,
    view: agent.viewId ?? 'home',
  }
  document.body.dataset.thread = focus.threadId
  await revealAgentTool(agent, options.revealTool === true)
  renderRail()
  renderThread()
}

export async function focusThread(threadId: string): Promise<void> {
  closeCreateProject()
  const thread = threads.find((item) => item.id === threadId)
  if (!thread || thread.kind === 'inbox') {
    focusInbox()
    return
  }
  const agentId = thread.workspaceAgentId ?? thread.agentIds[0]
  if (agentId) {
    await focusAgent(agentId)
  }
  focus = { threadId: thread.id, ...(agentId ? { agentId } : {}), view: agentId ? focus.view : 'home' }
  document.body.dataset.thread = thread.id
  if (!agentId) {
    leaveHarness()
    activateView('home')
  }
  renderRail()
  renderThread()
}

export async function handleComposer(text: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed || chatting) {
    return
  }
  const threadId = focus.threadId
  const posted = await window.ownworkbuddy.agents.post(threadId, trimmed)
  const snapshot = await window.ownworkbuddy.agents.snapshot()
  agents = snapshot.agents
  threads = snapshot.threads
  messages = snapshot.messages
  for (const action of posted.actions) {
    await applyAction(action, threadId)
  }
  const again = await window.ownworkbuddy.agents.snapshot()
  messages = again.messages
  threads = again.threads
  renderRail()
  renderThread()
}

async function applyAction(action: DispatchAction, threadId: string): Promise<void> {
  switch (action.kind) {
    case 'decompose':
      if (action.text) {
        setToolTab('todos')
        await seedTodos(action.text)
        await window.ownworkbuddy.agents.reply(threadId, `已把「${action.text}」拆进待办。`)
      }
      return
    case 'forward':
      return
    case 'open':
      if (action.agentId) {
        await attachAgent(action.agentId)
        await window.ownworkbuddy.agents.reply(
          threadId,
          `已打开「${agents.find((item) => item.id === action.agentId)?.title ?? action.agentId}」。`,
          action.agentId,
        )
      }
      return
    case 'invoke':
      if (action.agentId) {
        const agentId = action.agentId
        await attachAgent(agentId, true)
        await withAgentWork(agentId, threadId, 'working', () =>
          runInvoke(threadId, agentId, action.invoke, action.text),
        )
      }
      return
    case 'miss':
      if (action.agentId) {
        await attachAgent(action.agentId)
        await replySkillMiss(threadId, action.agentId, action.text)
        return
      }
      await window.ownworkbuddy.agents.reply(threadId, inboxMissReply(action.text, agents, action.agentIds))
      return
    case 'classify':
      if (action.agentId) {
        const agentId = action.agentId
        await attachAgent(agentId)
        renderThread()
        paintTyping(agentId)
        await withAgentWork(agentId, threadId, 'thinking', async () => {
          try {
            const decision = await window.ownworkbuddy.agents.classify(agentId, action.text)
            switch (decision.kind) {
              case 'invoke':
                if (decision.invoke) {
                  setRailMark(agentId, threadId, 'working')
                  await runInvoke(threadId, agentId, decision.invoke, action.text)
                  return
                }
                await replySkillMiss(threadId, agentId, action.text)
                return
              case 'chat':
                await window.ownworkbuddy.agents.chat(threadId, agentId, { mode: composerMode })
                return
              case 'note':
                await window.ownworkbuddy.agents.writeWorkspaceNote?.(threadId, action.text)
                await window.ownworkbuddy.agents.reply(threadId, `已写入工作区：${action.text}`, agentId)
                return
              case 'miss':
                await replySkillMiss(threadId, agentId, action.text)
                return
              default: {
                const exhaustive: never = decision.kind
                return exhaustive
              }
            }
          } catch (error) {
            markRailError(agentId, threadId)
            await window.ownworkbuddy.agents.reply(
              threadId,
              `没法接上：${error instanceof Error ? error.message : String(error)}`,
              agentId,
            )
          }
        })
      }
      return
    case 'note':
      if (action.text) {
        await window.ownworkbuddy.agents.writeWorkspaceNote?.(threadId, action.text)
        await window.ownworkbuddy.agents.reply(threadId, `已写入工作区：${action.text}`, action.agentId)
        if (action.agentId) {
          await attachAgent(action.agentId)
        }
      }
      return
    case 'window':
      if (action.agentId) {
        await attachAgent(action.agentId)
      }
      return
    case 'chat':
      if (action.agentId) {
        const agentId = action.agentId
        await attachAgent(agentId)
        renderThread()
        paintTyping(agentId)
        await withAgentWork(agentId, threadId, 'thinking', async () => {
          try {
            await window.ownworkbuddy.agents.chat(threadId, agentId, { mode: composerMode })
          } catch (error) {
            markRailError(agentId, threadId)
            await window.ownworkbuddy.agents.reply(
              threadId,
              `没法接上：${error instanceof Error ? error.message : String(error)}`,
              agentId,
            )
          }
        })
      }
      return
    default: {
      const exhaustive: never = action.kind
      return exhaustive
    }
  }
}

async function replySkillMiss(threadId: string, agentId: string, text = ''): Promise<void> {
  const agent = agents.find((item) => item.id === agentId)
  await window.ownworkbuddy.agents.reply(
    threadId,
    agent ? skillMissReply(agent, text) : `对不上这个成员的 Skill。`,
    agentId,
  )
}

async function runInvoke(threadId: string, agentId: string, invoke?: string, text = ''): Promise<void> {
  if (!invoke) {
    await window.ownworkbuddy.agents.reply(threadId, `对不上这条 Skill。`, agentId)
    return
  }
  try {
    if (isWorkbenchAdviceInvoke(invoke)) {
      await window.ownworkbuddy.agents.skillChat(threadId, agentId, invoke)
      return
    }
    const thread = threads.find((item) => item.id === threadId)
    const reply = await runSkillInvoke(agentId, invoke, text, agents, thread?.lastListing)
    await window.ownworkbuddy.agents.reply(threadId, reply.text, agentId, reply.listing)
  } catch (error) {
    markRailError(agentId, threadId)
    await window.ownworkbuddy.agents.reply(
      threadId,
      `没跑成：${error instanceof Error ? error.message : String(error)}`,
      agentId,
    )
  }
}

function hostBadgeEl(): HTMLSpanElement {
  const badge = document.createElement('span')
  badge.className = 'host-badge'
  badge.textContent = HOST_BADGE_LABEL
  badge.title = HOST_BADGE_TITLE
  return badge
}

function paintMentionedText(target: HTMLElement, text: string): void {
  target.replaceChildren()
  for (const span of mentionSpans(text, agents)) {
    if (span.kind === 'text') {
      target.append(document.createTextNode(span.text))
      continue
    }
    const chip = document.createElement('span')
    chip.className = 'mention-chip'
    chip.textContent = `@${span.agent.title}`
    if (isHostAgent(span.agent)) {
      chip.classList.add('is-host')
      chip.append(hostBadgeEl())
    }
    target.append(chip)
  }
}

function taskLeadBadge(): HTMLSpanElement {
  const badge = document.createElement('span')
  badge.className = 'task-agent-lead'
  badge.setAttribute('aria-hidden', 'true')
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute(
    'd',
    'M8 1.15 9.96 5.2l4.47.65-3.24 3.15.76 4.45L8 11.34l-3.95 2.11.76-4.45-3.24-3.15 4.47-.65z',
  )
  svg.append(path)
  badge.append(svg)
  return badge
}

function renderTaskPage(): void {
  const page = required('#view-task', HTMLElement)
  const model = describeNewTaskPage({
    threads,
    agents,
    hostName: hostLabel,
    projectId: selectedProjectId || undefined,
    selectedIds: selectedTaskIds,
    leadId: leadTaskId,
    folderPath: pendingFolderPath || undefined,
  })
  page.hidden = focus.view !== 'task'
  required('#task-headline-before', HTMLElement).textContent = model.headlineBefore
  required('#task-headline-after', HTMLElement).textContent = model.headlineAfter
  required('#task-project-label', HTMLButtonElement).textContent = model.triggerLabel
  const empty = required('#task-empty', HTMLElement)
  empty.hidden = !model.emptyHint
  empty.textContent = model.emptyHint
  const brief = required('#task-brief', HTMLElement)
  brief.hidden = !model.brief
  brief.textContent = model.brief
  required('#task-form', HTMLFormElement).hidden = !model.showComposer
  required('#task-agents-panel', HTMLElement).hidden = !model.showComposer
  const modelChip = required('#task-model', HTMLElement)
  modelChip.textContent = DEEPSEEK_MODEL_LABEL
  modelChip.title = DEEPSEEK_MODEL
  required('#task-command', HTMLTextAreaElement).placeholder = model.placeholder
  required('#task-host', HTMLButtonElement).textContent = model.chipLabel
  required('#task-host', HTMLButtonElement).title = model.folderLabel
    ? `项目文件夹：${model.folderLabel}`
    : '还没选项目文件夹'
  required('#task-agents-meta', HTMLElement).textContent =
    `选择加入项目的成员（${String(model.selectedCount)}/${String(model.totalCount)}）`
  const menu = required('#task-project-menu', HTMLElement)
  menu.replaceChildren()
  const create = document.createElement('button')
  create.type = 'button'
  create.role = 'option'
  create.classList.toggle('is-current', model.isNew)
  create.textContent = '新建项目'
  create.addEventListener('click', () => {
    closeProjectMenu()
    openCreateProject()
  })
  menu.append(create)
  for (const item of model.projects) {
    const button = document.createElement('button')
    button.type = 'button'
    button.role = 'option'
    button.classList.toggle('is-current', item.id === model.projectId)
    button.classList.toggle('is-pinned', item.pinned)
    button.textContent = item.title
    button.addEventListener('click', () => {
      selectTaskProject(item.id)
    })
    button.addEventListener('contextmenu', (event) => {
      const thread = threads.find((entry) => entry.id === item.id)
      if (thread) {
        openProjectMenu(event, thread)
      }
    })
    menu.append(button)
  }
  renderTaskAgentChips(required('#task-agents', HTMLElement), model.agents, selectedTaskIds, leadTaskId, (next) => {
    selectedTaskIds = next.selectedIds
    leadTaskId = next.leadId
    renderTaskPage()
  })
}

function setTaskHint(text: string): void {
  const hint = required('#task-hint', HTMLElement)
  hint.hidden = !text
  hint.textContent = text
}

async function submitNewTask(): Promise<void> {
  const input = required('#task-command', HTMLTextAreaElement)
  const send = required('#task-send', HTMLButtonElement)
  const text = input.value.trim()
  if (chatting) {
    setTaskHint('上一句还在回，等它说完再发。')
    return
  }
  if (!selectedProjectId) {
    setTaskHint('先点「新项目」把项目建起来。')
    openCreateProject()
    return
  }
  if (!text) {
    setTaskHint('先写一句这次要做什么，再点发送。')
    input.focus()
    return
  }
  selectedTaskIds = withHostAgent(selectedTaskIds)
  leadTaskId = leadTaskId && selectedTaskIds.includes(leadTaskId) ? leadTaskId : selectedTaskIds[0]
  if (selectedTaskIds.length === 0) {
    setTaskHint('主理人还没就绪，稍后再开项目。')
    return
  }
  if (!(window.ownworkbuddy.agents.startTask instanceof Function)) {
    setTaskHint('开发端还是旧主进程，完全退出后重新 pnpm dev。')
    return
  }
  setTaskHint('')
  send.disabled = true
  try {
    const posted = await window.ownworkbuddy.agents.startTask(
      text,
      selectedTaskIds,
      leadTaskId,
      selectedProjectId || undefined,
      {
        ...(pendingFolderPath ? { folderPath: pendingFolderPath } : {}),
        ...(pendingFiles.length > 0 ? { attachedFiles: pendingFiles } : {}),
      },
    )
    input.value = ''
    const snapshot = await window.ownworkbuddy.agents.snapshot()
    agents = snapshot.agents
    threads = snapshot.threads
    messages = snapshot.messages
    focus = {
      threadId: posted.thread.id,
      agentId: posted.thread.workspaceAgentId ?? focus.agentId,
      view: 'home',
    }
    document.body.dataset.thread = posted.thread.id
    const agent = agents.find((item) => item.id === focus.agentId)
    if (agent?.viewId && VIEWS_IN_TOOL.has(agent.viewId)) {
      activateView(agent.viewId)
      paintToolPane(parkToolTab(toolPane, 'tool'))
    } else {
      document.body.dataset.view = 'home'
      paintToolPane(parkToolTab(toolPane, 'todos'))
    }
    renderRail()
    renderThread()
    send.disabled = false
    for (const action of posted.actions) {
      await applyAction(action, posted.thread.id)
    }
    const again = await window.ownworkbuddy.agents.snapshot()
    messages = again.messages
    threads = again.threads
    renderRail()
    renderThread()
  } catch (error) {
    setTaskHint(error instanceof Error ? error.message : '没发出去，看是不是要重启一次开发端。')
    input.focus()
  } finally {
    send.disabled = false
  }
}

function renderRail(): void {
  if (railDrag?.active) {
    return
  }
  const pinNav = required('#pin-nav', HTMLElement)
  const threadNav = required('#thread-nav', HTMLElement)
  const agentNav = required('#agent-nav', HTMLElement)
  pinNav.replaceChildren()
  threadNav.replaceChildren()
  const pinned = listPinnedProjects(threads)
  const loose = listUnpinnedProjects(threads)
  if (pinned.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'rail-empty'
    empty.textContent = '右键项目可置顶'
    pinNav.append(empty)
  }
  for (const thread of pinned) {
    pinNav.append(projectRailButton(thread, 'pinned'))
  }
  for (const thread of loose.slice(0, 12)) {
    threadNav.append(projectRailButton(thread, 'project'))
  }
  required('#project-create', HTMLButtonElement).classList.toggle(
    'is-current',
    focus.view === 'task' && selectedProjectId === NEW_PROJECT_ID,
  )
  const globalCurrent = currentGlobalNav(focus.view, focus.threadId, INBOX_THREAD_ID)
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-global]')) {
    button.classList.toggle('is-current', button.dataset.global === globalCurrent)
  }
  agentNav.replaceChildren()
  const roster = sortAgentsForRail(agents)
  for (const [index, agent] of roster.entries()) {
    agentNav.append(agentRailButton(agent, index, roster.length))
  }
  paintWorkspaceFaces()
  required('#rail-user', HTMLButtonElement).classList.toggle('is-current', focus.view === 'prefs')
}

function projectRailButton(thread: ThreadRecord, list: 'pinned' | 'project'): HTMLButtonElement {
  const activity = projectRailActivity(thread, railMarks)
  const button = rowButton(
    thread.title,
    relativeTime(thread.updatedAt),
    focus.view === 'task' ? selectedProjectId === thread.id : focus.threadId === thread.id,
    () => {
      if (suppressRailClick) {
        suppressRailClick = false
        return
      }
      void focusThread(thread.id)
    },
    threadFaceEl(thread.agentIds),
  )
  button.dataset.railId = thread.id
  button.dataset.railList = list
  paintRailRowActivity(button, activity, thread.title)
  if (activity !== 'idle') {
    const aside = button.querySelector('.rail-item-meta')
    if (aside instanceof HTMLElement) {
      aside.replaceChildren(railActivityGlyph(activity))
      aside.dataset.activity = activity
      aside.title = describeRailActivity(activity)
    }
  }
  button.addEventListener('contextmenu', (event) => {
    openProjectMenu(event, thread)
  })
  bindRailDrag(button, list, thread.id)
  return button
}

function agentRailButton(agent: AgentRecord, index: number, total: number): HTMLButtonElement {
  const activity = agentRailActivity(agent.id, railMarks)
  const host = isHostAgent(agent)
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.railId = agent.id
  button.dataset.railList = 'agent'
  button.classList.toggle('is-current', focus.agentId === agent.id)
  button.classList.toggle('is-host', host)
  const copy = document.createElement('span')
  copy.className = 'stack-copy'
  const label = document.createElement('span')
  label.className = 'nav-label'
  label.textContent = agent.title
  if (host) {
    label.append(hostBadgeEl())
    button.title = HOST_BADGE_TITLE
  }
  copy.append(label)
  if (agent.description) {
    const desc = document.createElement('span')
    desc.className = 'nav-desc'
    desc.textContent = agent.description
    copy.append(desc)
  }
  button.append(
    wrapRailAvatar(agentAvatarEl({ templateId: agent.templateId, hue: agent.hue }), activity),
    copy,
  )
  if (activity !== 'idle') {
    button.append(railActivityMeta(activity))
  }
  paintRailRowActivity(button, activity, agent.title)
  button.addEventListener('click', () => {
    if (suppressRailClick) {
      suppressRailClick = false
      return
    }
    void focusAgent(agent.id)
  })
  button.addEventListener('contextmenu', (event) => {
    openAgentMenu(event, agent, index, total)
  })
  bindRailDrag(button, 'agent', agent.id)
  return button
}

function renderThread(): void {
  const title = required('#thread-title', HTMLElement)
  const meta = required('#thread-meta', HTMLElement)
  const feed = required('#thread-feed', HTMLElement)
  const thread = threads.find((item) => item.id === focus.threadId)
  const names = (thread?.agentIds ?? [])
    .map((id) => agents.find((agent) => agent.id === id)?.title)
    .filter((item): item is string => Boolean(item))
  title.textContent = thread?.title ?? '今日'
  meta.textContent =
    names.length > 0
      ? names.map((name) => `@${name}`).join(' ')
      : `${formatCalendarTitle(new Date(), 'day')} · 收件箱`
  paintThreadFace(thread?.agentIds ?? [])
  const threadMessages = messages.filter((item) => item.threadId === focus.threadId)
  const home = document.querySelector('#view-home')
  if (home instanceof HTMLElement) {
    home.hidden =
      focus.view === 'task' ||
      focus.view === 'schedule' ||
      focus.threadId !== INBOX_THREAD_ID ||
      threadMessages.length > 0
  }
  const showFeed = shouldShowThreadFeed(focus.view, threadMessages.length)
  feed.hidden = !showFeed
  renderTaskPage()
  paintComposerContext()
  paintComposerModes()
  feed.replaceChildren()
  if (!showFeed) {
    return
  }
  for (const message of threadMessages) {
    feed.append(messageEl(message))
  }
}

function agentsByIds(agentIds: readonly string[]): AgentRecord[] {
  return rosterAgentsByIds(agentIds, agents)
}

function threadFaceEl(agentIds: readonly string[]): HTMLElement | undefined {
  const shown = agentsByIds(agentIds).slice(0, 3)
  if (shown.length === 0) {
    return undefined
  }
  const face = document.createElement('span')
  face.className = 'rail-face'
  face.title = shown.map((agent) => agent.title).join('、')
  for (const agent of shown) {
    const avatar = agentAvatarEl({ templateId: agent.templateId, hue: agent.hue })
    face.append(wrapRailAvatar(avatar, agentRailActivity(agent.id, railMarks)))
  }
  return face
}

function paintThreadFace(agentIds: readonly string[]): void {
  const face = required('#thread-face', HTMLElement)
  const unique = [...new Set(focus.agentId ? [focus.agentId, ...agentIds] : agentIds)]
  const shown = agentsByIds(unique)
  face.replaceChildren()
  face.hidden = shown.length === 0
  for (const agent of shown.slice(0, 3)) {
    const avatar = agentAvatarEl({ templateId: agent.templateId, hue: agent.hue })
    avatar.title = agent.title
    avatar.classList.add('is-mentionable')
    avatar.addEventListener('click', () => {
      insertMention(agent)
    })
    face.append(avatar)
  }
}

function paintWorkspaceFaces(): void {
  for (const view of document.querySelectorAll<HTMLElement>('.workspace-stage > .view')) {
    const viewId = view.id.replace(/^view-/, '')
    const agent = agents.find((item) => item.viewId === viewId)
    const head = view.querySelector('.tick-head')
    if (!(head instanceof HTMLElement)) {
      continue
    }
    let face = view.querySelector('.tick-face')
    if (!agent) {
      if (face instanceof HTMLElement) {
        face.remove()
      }
      continue
    }
    if (!(face instanceof HTMLElement)) {
      face = document.createElement('span')
      face.className = 'tick-face'
      head.prepend(face)
    }
    face.replaceChildren(agentAvatarEl({ templateId: agent.templateId, hue: agent.hue }))
  }
}

function displayedAgentCopy(message: ThreadMessage): { text: string; thinking?: string } {
  const split = splitAssistantPayload(message.text)
  const stored = message.thinking?.trim() ?? ''
  const extracted = split.thinking.trim()
  let thinking = stored
  if (!thinking) {
    thinking = extracted
  } else if (extracted && !stored.includes(extracted) && !extracted.includes(stored)) {
    thinking = `${stored}\n\n${extracted}`
  }
  return {
    text: split.text.trim() || message.text,
    thinking: thinking || undefined,
  }
}

function threadThinkEl(thinking: string): HTMLElement {
  const details = document.createElement('details')
  details.className = 'thread-think'
  const summary = document.createElement('summary')
  summary.textContent = '思考过程'
  const body = document.createElement('pre')
  body.className = 'thread-think-body'
  body.textContent = thinking
  details.append(summary, body)
  return details
}

function messageEl(message: ThreadMessage): HTMLElement {
  const wrap = document.createElement('article')
  wrap.className = `thread-msg is-${message.role}`
  const row = document.createElement('div')
  row.className = 'thread-msg-row'
  const agent = message.agentId ? agents.find((item) => item.id === message.agentId) : undefined
  const copy = displayedAgentCopy(message)
  const bubble = document.createElement('div')
  bubble.className = 'bubble'
  if (message.role === 'user') {
    paintMentionedText(bubble, message.text)
    row.append(bubble, userAvatarEl())
    wrap.append(row)
    return wrap
  }
  bubble.classList.add('is-md')
  bubble.innerHTML = renderChatMarkdown(copy.text)
  bubble.addEventListener('click', (event) => {
    const row = event.target instanceof Element ? event.target.closest('tr[data-row]') : null
    const index = row?.getAttribute('data-row')
    if (!index || chatting) {
      return
    }
    void handleComposer(`第${index}条`)
  })
  if (agent && isSkillMissText(copy.text)) {
    const chips = document.createElement('div')
    chips.className = 'skill-chips'
    for (const skill of occupationSkillChoices(agent)) {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'skill-chip'
      chip.textContent = skill.title
      chip.addEventListener('click', (event) => {
        event.preventDefault()
        if (chatting) {
          return
        }
        void handleComposer(skill.phrase)
      })
      chips.append(chip)
    }
    if (chips.childElementCount > 0) {
      bubble.append(chips)
    }
  }
  if (agent) {
    const body = document.createElement('div')
    body.className = 'thread-msg-body'
    const who = document.createElement('p')
    who.className = 'thread-msg-who'
    who.textContent = agent.title
    body.append(who)
    if (copy.thinking) {
      body.append(threadThinkEl(copy.thinking))
    }
    body.append(bubble)
    row.append(agentAvatarEl({ templateId: agent.templateId, hue: agent.hue }), body)
    wrap.append(row)
    return wrap
  }
  if (copy.thinking) {
    wrap.append(threadThinkEl(copy.thinking))
  }
  wrap.append(bubble)
  return wrap
}

export async function openCreateAgent(): Promise<void> {
  const dialog = required('#create-agent', HTMLDialogElement)
  selectedTemplateId = 'social-ammo'
  cloneFrom = undefined
  await renderPalette()
  await fillForm()
  if (typeof dialog.showModal === 'function') {
    dialog.showModal()
  }
}

async function renderPalette(): Promise<void> {
  const palette = required('#create-agent-palette', HTMLElement)
  const recommend = await window.ownworkbuddy.agents.recommend()
  palette.replaceChildren()
  palette.append(paletteLabel('直接创建'))
  const blank = recommend.templates.find((template) => template.id === 'blank')
  if (blank) {
    palette.append(paletteItem(blank, !cloneFrom && selectedTemplateId === 'blank'))
  }
  palette.append(paletteLabel('模板创建'))
  for (const template of recommend.templates.filter((item) => item.id !== 'blank')) {
    palette.append(paletteItem(template, !cloneFrom && selectedTemplateId === template.id))
  }
  palette.append(paletteLabel('推荐成员'))
  for (const agent of recommend.agents) {
    palette.append(agentItem(agent, cloneFrom === agent.id))
  }
}

function paletteLabel(text: string): HTMLElement {
  const label = document.createElement('p')
  label.className = 'palette-label'
  label.textContent = text
  return label
}

function paletteItem(template: AgentTemplate, current: boolean): HTMLElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'palette-item'
  button.classList.toggle('is-current', current)
  const avatar = agentAvatarEl({ templateId: template.id, hue: template.hue })
  const copy = document.createElement('span')
  copy.className = 'stack-copy'
  const title = document.createElement('strong')
  title.textContent = template.role
  const desc = document.createElement('small')
  desc.textContent = template.hireTemplateIds?.length
    ? '雇佣 · 拆成左栏身份'
    : template.singleton
      ? '单例 · 打开已有'
      : template.description
  copy.append(title, desc)
  button.title = desc.textContent
  button.append(avatar, copy)
  button.addEventListener('click', () => {
    selectedTemplateId = template.id
    cloneFrom = undefined
    void fillForm()
    void renderPalette()
  })
  return button
}

function agentItem(agent: AgentRecord, current: boolean): HTMLElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'palette-item'
  button.classList.toggle('is-current', current)
  const avatar = agentAvatarEl({ templateId: agent.templateId, hue: agent.hue })
  const copy = document.createElement('span')
  copy.className = 'stack-copy'
  const title = document.createElement('strong')
  title.textContent = agent.title
  const desc = document.createElement('small')
  desc.textContent = agent.singleton ? '打开已有' : `以「${agent.title}」为蓝本`
  copy.append(title, desc)
  button.title = desc.textContent
  button.append(avatar, copy)
  button.addEventListener('click', () => {
    cloneFrom = agent.id
    selectedTemplateId = agent.templateId
    void fillForm()
    void renderPalette()
  })
  return button
}

async function fillForm(): Promise<void> {
  const recommend = await window.ownworkbuddy.agents.recommend()
  const source = cloneFrom ? agents.find((item) => item.id === cloneFrom) : undefined
  const template = recommend.templates.find((item) => item.id === selectedTemplateId) ?? recommend.templates[0]
  const name = required('#create-agent-name', HTMLInputElement)
  const desc = required('#create-agent-desc', HTMLTextAreaElement)
  const hero = required('#create-agent-hero', HTMLElement)
  const hint = required('#create-agent-hint', HTMLElement)
  const submit = required('#create-agent-submit', HTMLButtonElement)
  if (source) {
    name.value = source.singleton ? source.title : `${source.title} 副本`
    desc.value = source.description
    hint.textContent = source.singleton ? '这是单例，创建会打开已有实例，不会复制数据。' : '会复制人设，不复制模块数据。'
    submit.textContent = source.singleton ? '打开已有' : '雇进来'
  } else if (template) {
    name.value = template.id === 'blank' ? await window.ownworkbuddy.agents.nextName() : template.role
    desc.value = template.persona
    hint.textContent = template.hireTemplateIds?.length
      ? template.description
      : template.singleton
        ? '已有默认实例时会打开它，而不是再做一份账本。'
        : template.description
    submit.textContent = template.hireTemplateIds?.length
      ? '雇进花名册'
      : template.singleton
        ? '打开已有'
        : '雇进来'
  }
  hero.replaceChildren()
  const avatar = agentAvatarEl({
    templateId: source?.templateId ?? template?.id ?? 'blank',
    hue: source?.hue ?? template?.hue ?? 4,
  })
  const copy = document.createElement('div')
  copy.className = 'stack-copy'
  const heading = document.createElement('h3')
  heading.textContent = source?.title ?? template?.role ?? '直接创建'
  const lede = document.createElement('p')
  lede.textContent = source?.description ?? template?.description ?? ''
  copy.append(heading, lede)
  hero.append(avatar, copy)
  paintCreatePacks(template, source)
  syncDescCount()
}

function paintPackFieldset(fieldset: HTMLElement, selected: ReadonlySet<string>, legendText?: string): void {
  fieldset.replaceChildren()
  if (legendText) {
    const legend = document.createElement('legend')
    legend.textContent = legendText
    fieldset.append(legend)
    fieldset.removeAttribute('aria-label')
  } else {
    fieldset.setAttribute('aria-label', '工具包')
  }
  for (const id of TOOL_PACKS) {
    const label = document.createElement('label')
    label.className = 'agent-pack-row'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.dataset.pack = id
    input.checked = selected.has(id)
    const copy = document.createElement('span')
    copy.textContent = toolPackTitle(id)
    label.append(input, copy)
    fieldset.append(label)
  }
}

function selectedPacks(fieldsetId: string): ToolPackId[] {
  return [...document.querySelectorAll<HTMLInputElement>(`${fieldsetId} input[data-pack]`)]
    .filter((input) => input.checked)
    .map((input) => input.dataset.pack)
    .filter((id): id is ToolPackId => isToolPackId(id))
}

function paintCreatePacks(template?: AgentTemplate, source?: AgentRecord): void {
  const fieldset = required('#create-agent-packs', HTMLElement)
  const planRow = required('#create-agent-plan-row', HTMLElement)
  const plan = required('#create-agent-plan', HTMLInputElement)
  const hire = Boolean(template?.hireTemplateIds?.length)
  fieldset.hidden = hire
  planRow.hidden = hire
  if (hire) {
    fieldset.replaceChildren()
    plan.checked = false
    return
  }
  const selected = new Set(
    source?.toolPacks ??
      template?.toolPacks ??
      defaultToolPacks(template?.id ?? 'blank', template?.agentKind ?? 'conversational'),
  )
  paintPackFieldset(fieldset, selected, '工具包')
  plan.checked = Boolean(source?.planMode ?? template?.planMode)
}

async function shuffleName(): Promise<void> {
  const name = required('#create-agent-name', HTMLInputElement)
  name.value = await window.ownworkbuddy.agents.nextName()
}

async function submitCreateAgent(): Promise<void> {
  const packsHidden = required('#create-agent-packs', HTMLElement).hidden
  const result = await window.ownworkbuddy.agents.create({
    templateId: selectedTemplateId,
    title: required('#create-agent-name', HTMLInputElement).value,
    description: required('#create-agent-desc', HTMLTextAreaElement).value,
    ...(cloneFrom ? { cloneFrom } : {}),
    ...(!packsHidden
      ? {
          extraToolPacks: selectedPacks('#create-agent-packs'),
          planMode: required('#create-agent-plan', HTMLInputElement).checked,
        }
      : {}),
  })
  const dialog = required('#create-agent', HTMLDialogElement)
  if (!result.ok && result.existingId) {
    dialog.close()
    await refreshStudio()
    await focusAgent(result.existingId)
    return
  }
  if (!result.ok) {
    required('#create-agent-hint', HTMLElement).textContent = result.error ?? '创建失败'
    return
  }
  dialog.close()
  await refreshStudio()
  if (result.agent) {
    await focusAgent(result.agent.id)
  }
}

function syncDescCount(): void {
  const desc = required('#create-agent-desc', HTMLTextAreaElement)
  required('#create-agent-count', HTMLElement).textContent = `${desc.value.length}/100`
}

export function openStudioTool(tab: ToolTab): void {
  setToolTab(tab)
}

function setToolTab(tab: ToolTab): void {
  paintToolPane(openToolTab(toolPane, tab))
  if (tab === 'calendar') {
    activateCalendar()
  }
}

function paintToolPane(next: ToolPaneState): void {
  toolPane = next
  document.body.dataset.tool = next.tab
  document.body.dataset.toolCollapsed = next.collapsed ? 'true' : 'false'
  document.body.dataset.toolExpanded = next.expanded ? 'true' : 'false'
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-tool-tab]')) {
    button.classList.toggle('is-current', button.dataset.toolTab === next.tab)
  }
}

function studioWidth(): number {
  const studio = document.querySelector('.studio')
  return studio instanceof HTMLElement ? studio.getBoundingClientRect().width : window.innerWidth
}

function applyToolWidth(width: number): void {
  const next = clampToolWidth(width, studioWidth())
  document.documentElement.style.setProperty('--tool-width', `${String(next)}px`)
}

function currentToolWidth(): number {
  const pane = document.querySelector('.tool-pane')
  if (pane instanceof HTMLElement && !toolPane.collapsed && !toolPane.expanded) {
    return pane.getBoundingClientRect().width
  }
  return clampToolWidth(parseToolWidth(localStorage.getItem(TOOL_WIDTH_KEY)) ?? defaultToolWidth(studioWidth()), studioWidth())
}

function bindToolResize(): void {
  const gutter = required('.tool-gutter', HTMLElement)
  applyToolWidth(parseToolWidth(localStorage.getItem(TOOL_WIDTH_KEY)) ?? defaultToolWidth(studioWidth()))
  let dragging = false
  let originX = 0
  let originWidth = TOOL_WIDTH_DEFAULT

  gutter.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || toolPane.collapsed || toolPane.expanded) {
      return
    }
    event.preventDefault()
    dragging = true
    originX = event.clientX
    originWidth = currentToolWidth()
    document.body.dataset.toolResizing = 'true'
    gutter.setPointerCapture(event.pointerId)
  })

  gutter.addEventListener('pointermove', (event) => {
    if (!dragging) {
      return
    }
    applyToolWidth(originWidth + (originX - event.clientX))
  })

  const endDrag = (): void => {
    if (!dragging) {
      return
    }
    dragging = false
    delete document.body.dataset.toolResizing
    const next = currentToolWidth()
    if (Math.abs(next - originWidth) >= 2) {
      localStorage.setItem(TOOL_WIDTH_KEY, String(next))
    }
  }

  gutter.addEventListener('pointerup', endDrag)
  gutter.addEventListener('pointercancel', endDrag)
  window.addEventListener('resize', () => {
    applyToolWidth(parseToolWidth(localStorage.getItem(TOOL_WIDTH_KEY)) ?? defaultToolWidth(studioWidth()))
  })
}

function rowButton(
  title: string,
  meta: string,
  current: boolean,
  onClick: () => void,
  leading?: HTMLElement,
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.classList.toggle('is-current', current)
  const label = document.createElement('span')
  label.className = 'nav-label'
  label.textContent = title
  const aside = document.createElement('span')
  aside.className = 'rail-item-meta'
  aside.textContent = meta
  const nodes: HTMLElement[] = []
  if (leading) {
    nodes.push(leading)
  }
  nodes.push(label, aside)
  button.append(...nodes)
  button.addEventListener('click', onClick)
  return button
}

function cancelRailErrorTimer(agentId: string): void {
  const timer = railErrorTimers.get(agentId)
  if (timer !== undefined) {
    window.clearTimeout(timer)
    railErrorTimers.delete(agentId)
  }
}

function syncRailBusy(): void {
  chatting = isRailBusy(railMarks)
}

function setRailMark(agentId: string, threadId: string, kind: Exclude<RailActivityKind, 'idle'>): void {
  cancelRailErrorTimer(agentId)
  railMarks = upsertRailMark(railMarks, { agentId, threadId, kind })
  syncRailBusy()
  renderRail()
}

function clearRailMark(agentId: string): void {
  cancelRailErrorTimer(agentId)
  railMarks = removeRailMark(railMarks, agentId)
  syncRailBusy()
  renderRail()
}

function markRailError(agentId: string, threadId: string): void {
  cancelRailErrorTimer(agentId)
  railMarks = upsertRailMark(railMarks, { agentId, threadId, kind: 'error' })
  syncRailBusy()
  renderRail()
  const timer = window.setTimeout(() => {
    railErrorTimers.delete(agentId)
    const current = railMarks.find((mark) => mark.agentId === agentId)
    if (current?.kind === 'error') {
      railMarks = removeRailMark(railMarks, agentId)
      syncRailBusy()
      renderRail()
    }
  }, 4200)
  railErrorTimers.set(agentId, timer)
}

async function withAgentWork(
  agentId: string,
  threadId: string,
  kind: 'thinking' | 'working',
  run: () => Promise<void>,
): Promise<void> {
  setRailMark(agentId, threadId, kind)
  try {
    await run()
  } catch (error) {
    markRailError(agentId, threadId)
    throw error
  } finally {
    const current = railMarks.find((mark) => mark.agentId === agentId)
    if (current && current.kind !== 'error') {
      clearRailMark(agentId)
    }
  }
}

function paintRailRowActivity(button: HTMLButtonElement, activity: RailActivityKind, title: string): void {
  if (activity === 'idle') {
    button.removeAttribute('aria-busy')
    delete button.dataset.activity
    return
  }
  button.dataset.activity = activity
  if (activity === 'thinking' || activity === 'working') {
    button.setAttribute('aria-busy', 'true')
  } else {
    button.removeAttribute('aria-busy')
  }
  button.setAttribute('aria-label', `${title}，${describeRailActivity(activity)}`)
}

function wrapRailAvatar(avatar: HTMLElement, kind: RailActivityKind): HTMLElement {
  if (kind === 'idle') {
    return avatar
  }
  const wrap = document.createElement('span')
  wrap.className = 'rail-avatar-wrap'
  wrap.dataset.activity = kind
  wrap.append(avatar, railActivityRingEl())
  return wrap
}

function railActivityRingEl(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('rail-activity-ring')
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  circle.setAttribute('cx', '12')
  circle.setAttribute('cy', '12')
  circle.setAttribute('r', '10')
  svg.append(circle)
  return svg
}

function railActivityMeta(kind: Exclude<RailActivityKind, 'idle'>): HTMLSpanElement {
  const meta = document.createElement('span')
  meta.className = 'rail-item-meta'
  meta.dataset.activity = kind
  meta.title = describeRailActivity(kind)
  meta.append(railActivityGlyph(kind))
  return meta
}

function railActivityGlyph(kind: Exclude<RailActivityKind, 'idle'>): HTMLElement {
  switch (kind) {
    case 'thinking':
      return railDotsEl()
    case 'working':
      return railSpinnerGlyph()
    case 'error':
      return railErrorGlyph()
    default: {
      const exhaustive: never = kind
      return exhaustive
    }
  }
}

function railDotsEl(): HTMLSpanElement {
  const dots = document.createElement('span')
  dots.className = 'rail-activity-dots'
  dots.setAttribute('aria-hidden', 'true')
  dots.append(document.createElement('span'), document.createElement('span'), document.createElement('span'))
  return dots
}

function railSpinnerGlyph(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('rail-activity-icon', 'is-spin')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M8 2.25a5.75 5.75 0 1 1-4.07 1.68')
  svg.append(path)
  return svg
}

function railErrorGlyph(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('rail-activity-icon')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M5.15 5.15l5.7 5.7M10.85 5.15l-5.7 5.7')
  svg.append(path)
  return svg
}

type RailMenuItem =
  | { kind: 'sep' }
  | { kind: 'item'; id: string; label: string; danger?: boolean; disabled?: boolean }

function railMenuEl(): HTMLElement {
  return required('#rail-context-menu', HTMLElement)
}

function closeRailMenu(): void {
  const menu = railMenuEl()
  menu.hidden = true
  menu.replaceChildren()
}

function openRailMenu(event: MouseEvent, items: RailMenuItem[], onPick: (id: string) => void): void {
  event.preventDefault()
  event.stopPropagation()
  closeRailUserMenu()
  closeProjectMenu()
  const menu = railMenuEl()
  menu.replaceChildren()
  for (const item of items) {
    if (item.kind === 'sep') {
      const sep = document.createElement('div')
      sep.className = 'rail-context-sep'
      menu.append(sep)
      continue
    }
    const button = document.createElement('button')
    button.type = 'button'
    button.role = 'menuitem'
    button.textContent = item.label
    button.disabled = Boolean(item.disabled)
    button.classList.toggle('is-danger', Boolean(item.danger))
    button.addEventListener('click', () => {
      closeRailMenu()
      onPick(item.id)
    })
    menu.append(button)
  }
  menu.hidden = false
  const rect = menu.getBoundingClientRect()
  const left = Math.min(event.clientX, window.innerWidth - rect.width - 8)
  const top = Math.min(event.clientY, window.innerHeight - rect.height - 8)
  menu.style.left = `${Math.max(8, left)}px`
  menu.style.top = `${Math.max(8, top)}px`
}

function openProjectMenu(event: MouseEvent, thread: ThreadRecord): void {
  const pinned = isProjectPinned(thread)
  const listed = listProjects(threads)
  const group = listed.filter((item) => isProjectPinned(item) === pinned)
  const groupIndex = group.findIndex((item) => item.id === thread.id)
  openRailMenu(
    event,
    [
      { kind: 'item', id: 'open', label: '打开' },
      { kind: 'item', id: 'pin', label: pinned ? '取消置顶' : '置顶' },
      { kind: 'item', id: 'rename', label: '重命名' },
      { kind: 'sep' },
      { kind: 'item', id: 'up', label: '上移', disabled: groupIndex <= 0 },
      { kind: 'item', id: 'down', label: '下移', disabled: groupIndex < 0 || groupIndex >= group.length - 1 },
      { kind: 'sep' },
      { kind: 'item', id: 'delete', label: '删除项目', danger: true },
    ],
    (id) => {
      void handleProjectAction(thread.id, id)
    },
  )
}

function openAgentMenu(event: MouseEvent, agent: AgentRecord, index: number, total: number): void {
  const items: RailMenuItem[] = [
    { kind: 'item', id: 'open', label: '打开' },
    { kind: 'item', id: 'rename', label: '重命名' },
  ]
  if (canCloneAgent(agent)) {
    items.push({ kind: 'item', id: 'clone', label: '复制一份' })
  }
  if (canConfigurePacks(agent)) {
    items.push({ kind: 'item', id: 'packs', label: '工具包' })
  }
  items.push(
    { kind: 'sep' },
    { kind: 'item', id: 'up', label: '上移', disabled: index <= 0 },
    { kind: 'item', id: 'down', label: '下移', disabled: index >= total - 1 },
  )
  if (canRemoveAgent(agent)) {
    items.push({ kind: 'sep' }, { kind: 'item', id: 'remove', label: '解雇', danger: true })
  }
  openRailMenu(event, items, (id) => {
    void handleAgentAction(agent.id, id)
  })
}

async function handleProjectAction(threadId: string, action: string): Promise<void> {
  const thread = threads.find((item) => item.id === threadId)
  if (!thread) {
    return
  }
  switch (action) {
    case 'open':
      await focusThread(threadId)
      return
    case 'pin':
      await window.ownworkbuddy.agents.pinProject(threadId, !isProjectPinned(thread))
      await refreshStudio()
      return
    case 'rename':
      openRenameItem('project', threadId, thread.title)
      return
    case 'up':
      await shiftRailItem('project', threadId, -1)
      return
    case 'down':
      await shiftRailItem('project', threadId, 1)
      return
    case 'delete':
      if (!window.confirm(`删除项目「${thread.title}」？会话记录会一起清掉。`)) {
        return
      }
      await window.ownworkbuddy.agents.deleteProject(threadId)
      if (focus.threadId === threadId || selectedProjectId === threadId) {
        selectedProjectId = NEW_PROJECT_ID
        focusInbox()
      }
      await refreshStudio()
      return
    default:
      return
  }
}

async function handleAgentAction(agentId: string, action: string): Promise<void> {
  const agent = agents.find((item) => item.id === agentId)
  if (!agent) {
    return
  }
  switch (action) {
    case 'open':
      await focusAgent(agentId)
      return
    case 'rename':
      openRenameItem('agent', agentId, agent.title)
      return
    case 'clone':
      await openCloneAgent(agentId)
      return
    case 'packs':
      openConfigureAgent(agentId)
      return
    case 'up':
      await shiftRailItem('agent', agentId, -1)
      return
    case 'down':
      await shiftRailItem('agent', agentId, 1)
      return
    case 'remove':
      if (!window.confirm(`解雇「${agent.title}」？左栏会去掉这个成员，项目记录还在。`)) {
        return
      }
      await window.ownworkbuddy.agents.remove(agentId)
      if (focus.agentId === agentId) {
        focusInbox()
      }
      await refreshStudio()
      return
    default:
      return
  }
}

function openRenameItem(kind: 'project' | 'agent', id: string, title: string): void {
  renameTarget = { kind, id }
  const dialog = required('#rename-item', HTMLDialogElement)
  required('#rename-item-heading', HTMLElement).textContent = kind === 'project' ? '重命名项目' : '重命名成员'
  const input = required('#rename-item-value', HTMLInputElement)
  input.maxLength = kind === 'project' ? PROJECT_TITLE_MAX : AGENT_TITLE_MAX
  input.value = title
  required('#rename-item-hint', HTMLElement).textContent = ''
  if (typeof dialog.showModal === 'function') {
    dialog.showModal()
  }
  input.focus()
  input.select()
}

async function submitRenameItem(): Promise<void> {
  const target = renameTarget
  const dialog = required('#rename-item', HTMLDialogElement)
  const hint = required('#rename-item-hint', HTMLElement)
  const title = required('#rename-item-value', HTMLInputElement).value
  if (!target) {
    dialog.close()
    return
  }
  try {
    if (target.kind === 'project') {
      await window.ownworkbuddy.agents.renameProject(target.id, title)
    } else {
      await window.ownworkbuddy.agents.rename(target.id, title)
    }
    renameTarget = undefined
    dialog.close()
    await refreshStudio()
  } catch (error) {
    hint.textContent = error instanceof Error ? error.message : '没改成'
  }
}

async function openCloneAgent(agentId: string): Promise<void> {
  const agent = agents.find((item) => item.id === agentId)
  if (!agent || !canCloneAgent(agent)) {
    return
  }
  cloneFrom = agent.id
  selectedTemplateId = agent.templateId
  const dialog = required('#create-agent', HTMLDialogElement)
  await renderPalette()
  await fillForm()
  if (typeof dialog.showModal === 'function') {
    dialog.showModal()
  }
}

function openConfigureAgent(agentId: string): void {
  const agent = agents.find((item) => item.id === agentId)
  if (!agent || !canConfigurePacks(agent)) {
    return
  }
  configureAgentId = agentId
  const selected = new Set(agent.toolPacks ?? defaultToolPacks(agent.templateId, agent.kind))
  paintPackFieldset(required('#configure-agent-packs', HTMLElement), selected)
  required('#configure-agent-plan', HTMLInputElement).checked = Boolean(agent.planMode)
  required('#configure-agent-copy', HTMLElement).textContent = `给「${agent.title}」打开或关掉通用能力`
  required('#configure-agent-hint', HTMLElement).textContent = ''
  const dialog = required('#configure-agent', HTMLDialogElement)
  if (typeof dialog.showModal === 'function') {
    dialog.showModal()
  }
}

async function submitConfigureAgent(): Promise<void> {
  const agentId = configureAgentId
  const dialog = required('#configure-agent', HTMLDialogElement)
  const hint = required('#configure-agent-hint', HTMLElement)
  if (!agentId) {
    dialog.close()
    return
  }
  try {
    await window.ownworkbuddy.agents.configure({
      agentId,
      toolPacks: selectedPacks('#configure-agent-packs'),
      planMode: required('#configure-agent-plan', HTMLInputElement).checked,
    })
    configureAgentId = undefined
    dialog.close()
    await refreshStudio()
  } catch (error) {
    hint.textContent = error instanceof Error ? error.message : '没改成'
  }
}

function railNav(list: RailList): HTMLElement {
  switch (list) {
    case 'pinned':
      return required('#pin-nav', HTMLElement)
    case 'project':
      return required('#thread-nav', HTMLElement)
    case 'agent':
      return required('#agent-nav', HTMLElement)
    default: {
      const neverList: never = list
      return neverList
    }
  }
}

function railIds(list: RailList): string[] {
  switch (list) {
    case 'pinned':
      return listPinnedProjects(threads).map((thread) => thread.id)
    case 'project':
      return listUnpinnedProjects(threads).map((thread) => thread.id)
    case 'agent':
      return listedAgentRailIds(agents)
    default: {
      const neverList: never = list
      return neverList
    }
  }
}

function bindRailPointer(): void {
  if (railPointerBound) {
    return
  }
  railPointerBound = true
  window.addEventListener('pointermove', onRailPointerMove)
  window.addEventListener('pointerup', onRailPointerUp)
  window.addEventListener('pointercancel', onRailPointerUp)
}

function bindRailDrag(button: HTMLButtonElement, list: RailList, id: string): void {
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return
    }
    railDrag = {
      list,
      id,
      startY: event.clientY,
      offsetY: 0,
      pointerId: event.pointerId,
      active: false,
      button,
    }
  })
}

function onRailPointerMove(event: PointerEvent): void {
  if (!railDrag || railDrag.pointerId !== event.pointerId) {
    return
  }
  if (!railDrag.active) {
    if (Math.abs(event.clientY - railDrag.startY) < RAIL_DRAG_THRESHOLD) {
      return
    }
    beginRailDrag(event)
  }
  moveRailGhost(event.clientY)
  autoScrollRail(event.clientY)
  placeRailPlaceholder(event.clientY)
}

function beginRailDrag(event: PointerEvent): void {
  if (!railDrag) {
    return
  }
  const button = railDrag.button
  const rect = button.getBoundingClientRect()
  railDrag.active = true
  railDrag.offsetY = event.clientY - rect.top
  closeRailMenu()
  document.body.classList.add('is-rail-dragging')
  const placeholder = document.createElement('div')
  placeholder.className = 'rail-placeholder'
  placeholder.style.height = `${rect.height}px`
  button.after(placeholder)
  railDrag.placeholder = placeholder
  button.classList.add('is-rail-ghost')
  button.style.width = `${rect.width}px`
  button.style.left = `${rect.left}px`
  document.body.append(button)
  button.setPointerCapture(event.pointerId)
  moveRailGhost(event.clientY)
}

function moveRailGhost(y: number): void {
  if (!railDrag) {
    return
  }
  railDrag.button.style.top = `${y - railDrag.offsetY}px`
}

function autoScrollRail(y: number): void {
  const scroller = document.querySelector('.rail-scroll')
  if (!(scroller instanceof HTMLElement)) {
    return
  }
  const rect = scroller.getBoundingClientRect()
  if (y < rect.top + 32) {
    scroller.scrollTop -= 10
    return
  }
  if (y > rect.bottom - 32) {
    scroller.scrollTop += 10
  }
}

function hitRailDest(y: number): RailList | undefined {
  if (!railDrag) {
    return undefined
  }
  if (railDrag.list === 'agent') {
    return 'agent'
  }
  for (const list of ['pinned', 'project'] as const) {
    const block = document.querySelector(`[data-rail-list="${list}"]`)
    if (!(block instanceof HTMLElement)) {
      continue
    }
    const rect = block.getBoundingClientRect()
    if (y >= rect.top && y <= rect.bottom) {
      return list
    }
  }
  return railDrag.list
}

function placeRailPlaceholder(y: number): void {
  if (!railDrag?.placeholder) {
    return
  }
  const dest = hitRailDest(y)
  if (!dest) {
    return
  }
  const nav = railNav(dest)
  nav.querySelector('.rail-empty')?.remove()
  for (const block of document.querySelectorAll('.rail-block')) {
    block.classList.toggle('is-drop-list', block.getAttribute('data-rail-list') === dest)
  }
  const items = [...nav.querySelectorAll<HTMLElement>('[data-rail-id]')].map((item) => {
    const rect = item.getBoundingClientRect()
    return { id: item.dataset.railId ?? '', top: rect.top, height: rect.height, el: item }
  }).filter((item) => item.id.length > 0)
  const beforeId = insertBeforeIdFromY(items, y)
  const before = items.find((item) => item.id === beforeId)?.el
  if (before) {
    before.before(railDrag.placeholder)
    return
  }
  nav.append(railDrag.placeholder)
}

function destIdsFromPlaceholder(fromId: string): string[] {
  const placeholder = railDrag?.placeholder
  const nav = placeholder?.parentElement
  if (!nav) {
    return []
  }
  const childIds = [...nav.children].map((child) => {
    if (child === placeholder) {
      return 'placeholder' as const
    }
    if (child instanceof HTMLElement && child.dataset.railId) {
      return child.dataset.railId
    }
    return ''
  }).filter((id) => id.length > 0)
  return idsAtPlaceholder(childIds, fromId)
}

function finishRailGhost(): RailList | undefined {
  if (!railDrag) {
    return undefined
  }
  const dest = railDrag.placeholder?.parentElement
    ? destListOf(railDrag.placeholder.parentElement)
    : railDrag.list
  if (railDrag.button.hasPointerCapture(railDrag.pointerId)) {
    railDrag.button.releasePointerCapture(railDrag.pointerId)
  }
  railDrag.button.classList.remove('is-rail-ghost')
  railDrag.button.style.width = ''
  railDrag.button.style.left = ''
  railDrag.button.style.top = ''
  if (railDrag.placeholder?.parentElement) {
    railDrag.placeholder.replaceWith(railDrag.button)
  } else {
    railNav(railDrag.list).append(railDrag.button)
  }
  document.body.classList.remove('is-rail-dragging')
  for (const block of document.querySelectorAll('.rail-block.is-drop-list')) {
    block.classList.remove('is-drop-list')
  }
  document.querySelector('.rail-placeholder')?.remove()
  return dest
}

function destListOf(nav: HTMLElement): RailList {
  switch (nav.id) {
    case 'pin-nav':
      return 'pinned'
    case 'thread-nav':
      return 'project'
    case 'agent-nav':
      return 'agent'
    default:
      return railDrag?.list ?? 'project'
  }
}

function onRailPointerUp(event: PointerEvent): void {
  if (!railDrag || railDrag.pointerId !== event.pointerId) {
    return
  }
  const drag = railDrag
  if (!drag.active) {
    railDrag = undefined
    return
  }
  const destParent = drag.placeholder?.parentElement
  const dest =
    hitRailDest(event.clientY) ??
    (destParent instanceof HTMLElement ? destListOf(destParent) : drag.list)
  const destIds = destIdsFromPlaceholder(drag.id)
  finishRailGhost()
  railDrag = { ...drag, active: true, placeholder: undefined }
  suppressRailClick = true
  const nextIds = destIds.length > 0 ? destIds : [drag.id, ...railIds(dest).filter((item) => item !== drag.id)]
  void commitRailDrop(drag.list, dest, drag.id, nextIds)
}

async function commitRailDrop(
  from: RailList,
  dest: RailList,
  id: string,
  destIds: string[],
): Promise<void> {
  try {
    if (from === 'agent' || dest === 'agent') {
      if (destIds.join('\0') !== railIds('agent').join('\0')) {
        await persistRailOrder('agent', destIds)
      }
      return
    }
    await persistProjectDrop(id, dest === 'pinned' ? 'pinned' : 'project', destIds)
  } finally {
    railDrag = undefined
    await refreshStudio()
  }
}

async function persistProjectDrop(
  id: string,
  dest: 'pinned' | 'project',
  destIds: string[],
): Promise<void> {
  const thread = threads.find((item) => item.id === id)
  if (!thread) {
    return
  }
  const willPin = dest === 'pinned'
  const wasPinned = isProjectPinned(thread)
  if (wasPinned !== willPin) {
    threads = threads.map((item) => {
      if (item.id !== id) {
        return item
      }
      const next = { ...item }
      if (willPin) {
        next.pinnedAt = new Date().toISOString()
      } else {
        delete next.pinnedAt
      }
      return next
    })
    await window.ownworkbuddy.agents.pinProject(id, willPin)
  }
  const other = willPin
    ? listUnpinnedProjects(threads).map((item) => item.id)
    : listPinnedProjects(threads).map((item) => item.id)
  const merged = willPin ? mergeProjectRailIds(destIds, other) : mergeProjectRailIds(other, destIds)
  if (merged.join('\0') === mergeProjectRailIds(
    listPinnedProjects(threads).map((item) => item.id),
    listUnpinnedProjects(threads).map((item) => item.id),
  ).join('\0') && wasPinned === willPin) {
    return
  }
  await persistRailOrder('project', merged)
}


async function shiftRailItem(kind: 'project' | 'agent', id: string, delta: -1 | 1): Promise<void> {
  const ids = railIds(kind)
  if (kind === 'project') {
    const listed = listProjects(threads)
    const current = listed.find((thread) => thread.id === id)
    if (!current) {
      return
    }
    const group = listed.filter((thread) => isProjectPinned(thread) === isProjectPinned(current))
    const groupIds = group.map((thread) => thread.id)
    const moved = shiftIds(groupIds, id, delta)
    if (!moved) {
      return
    }
    const rest = listed.filter((thread) => isProjectPinned(thread) !== isProjectPinned(current)).map((thread) => thread.id)
    await persistRailOrder(kind, isProjectPinned(current) ? [...moved, ...rest] : [...rest, ...moved])
    return
  }
  const moved = shiftIds(ids, id, delta)
  if (moved) {
    await persistRailOrder(kind, moved)
  }
}

function shiftIds(ids: string[], id: string, delta: -1 | 1): string[] | undefined {
  const index = ids.indexOf(id)
  const swap = index + delta
  if (index < 0 || swap < 0 || swap >= ids.length) {
    return undefined
  }
  const next = [...ids]
  const current = next[index]
  const other = next[swap]
  if (!current || !other) {
    return undefined
  }
  next[index] = other
  next[swap] = current
  return next
}

async function persistRailOrder(kind: 'project' | 'agent', ids: string[]): Promise<void> {
  applyRailOrder(kind, ids)
  renderRail()
  try {
    if (kind === 'project') {
      await window.ownworkbuddy.agents.reorderProjects(ids)
    } else {
      await window.ownworkbuddy.agents.reorder(ids)
    }
    await refreshStudio()
  } catch {
    await refreshStudio()
  }
}

function applyRailOrder(kind: 'project' | 'agent', ids: string[]): void {
  const index = new Map(ids.map((id, order) => [id, order]))
  if (kind === 'project') {
    threads = threads.map((thread) => {
      const sortOrder = index.get(thread.id)
      return sortOrder == null ? thread : { ...thread, sortOrder }
    })
    return
  }
  agents = applyAgentSortOrder(agents, ids)
}

function relativeTime(iso: string): string {
  const delta = Date.now() - Date.parse(iso)
  if (Number.isNaN(delta)) {
    return ''
  }
  if (delta < 60_000) {
    return '刚刚'
  }
  if (delta < 3_600_000) {
    return `${Math.floor(delta / 60_000)} 分钟`
  }
  if (delta < 86_400_000) {
    return `${Math.floor(delta / 3_600_000)} 小时`
  }
  return `${Math.floor(delta / 86_400_000)} 天`
}

async function loadAgent(id: string): Promise<AgentRecord | undefined> {
  const snapshot = await window.ownworkbuddy.agents.snapshot()
  agents = snapshot.agents
  threads = snapshot.threads
  messages = snapshot.messages
  return agents.find((item) => item.id === id)
}

async function attachAgent(agentId: string, open = false): Promise<void> {
  const agent = agents.find((item) => item.id === agentId) ?? (await loadAgent(agentId))
  if (!agent) {
    return
  }
  focus = { ...focus, agentId: agent.id }
  await revealAgentTool(agent, open)
  renderRail()
}

async function revealAgentTool(agent: AgentRecord, open = false): Promise<void> {
  const ready = (tab: ToolTab): void => {
    paintToolPane(open ? openToolTab(toolPane, tab) : parkToolTab(toolPane, tab))
  }
  leaveHarness()
  if (agent.kind === 'window') {
    await window.ownworkbuddy.workbench.open(agent.moduleIds[0] ?? agent.id)
    return
  }
  if (agent.status === 'needs-module') {
    ready('todos')
    return
  }
  if (agent.viewId && VIEWS_IN_TOOL.has(agent.viewId)) {
    activateView(agent.viewId)
    ready('tool')
    return
  }
  if (navEntries.some((entry) => entry.id === agent.id && entry.kind === 'view')) {
    activateView(agent.id)
    ready('tool')
    return
  }
  unmountHosted()
  ready('todos')
}

function leaveHarness(): void {
  document.body.dataset.harness = 'false'
  if (document.body.dataset.view === 'harness') {
    document.body.dataset.view = 'home'
  }
}

function paintTyping(agentId: string): void {
  if (focus.view === 'task') {
    return
  }
  typingAgentId = agentId
  const feed = required('#thread-feed', HTMLElement)
  const home = document.querySelector('#view-home')
  if (home instanceof HTMLElement) {
    home.hidden = true
  }
  feed.hidden = false
  feed.append(
    messageEl({
      id: 'typing',
      threadId: focus.threadId,
      role: 'agent',
      agentId,
      text: '正在想…',
      createdAt: new Date().toISOString(),
    }),
  )
  const last = feed.lastElementChild
  if (last instanceof HTMLElement) {
    last.classList.add('is-typing')
  }
}

function paintToolEvent(event: ToolEvent): void {
  if (!chatting) {
    return
  }
  if (event.threadId && event.threadId !== focus.threadId) {
    return
  }
  if (event.agentId && event.agentId !== typingAgentId) {
    return
  }
  const bubble = document.querySelector('#thread-feed .is-typing .bubble')
  if (!(bubble instanceof HTMLElement)) {
    return
  }
  bubble.classList.remove('is-md')
  bubble.textContent = formatToolEventLine(event)
}

function composerMenuEl(): HTMLElement {
  return required('#mention-menu', HTMLElement)
}

function renderComposerMenu(): void {
  const command = commandEl()
  const skill = skillQueryAt(command.value, command.selectionStart)
  if (skill) {
    mentionHits = []
    skillHits = listComposerSkills(skill.query, agents)
    if (skillHits.length === 0) {
      hideComposerMenu()
      return
    }
    mentionIndex = Math.min(mentionIndex, skillHits.length - 1)
    paintComposerMenu(
      skillHits.map((item, index) => ({
        mark: '/',
        hue: 4,
        title: item.title,
        hint: item.hint,
        current: index === mentionIndex,
        onPick: () => insertSkill(item),
      })),
    )
    return
  }
  const at = mentionQueryAt(command.value, command.selectionStart)
  if (!at) {
    hideComposerMenu()
    return
  }
  skillHits = []
  const thread = threads.find((item) => item.id === focus.threadId)
  mentionHits = filterMentionAgents(at.query, agents, thread?.kind === 'user' ? thread.agentIds : [])
  if (mentionHits.length === 0) {
    hideComposerMenu()
    return
  }
  mentionIndex = Math.min(mentionIndex, mentionHits.length - 1)
  paintComposerMenu(
    mentionHits.map((agent, index) => ({
      templateId: agent.templateId,
      mark: agent.mark,
      hue: agent.hue,
      title: agent.title,
      hint: isHostAgent(agent) ? HOST_BADGE_TITLE : agent.description,
      current: index === mentionIndex,
      host: isHostAgent(agent),
      onPick: () => insertMention(agent),
    })),
  )
}

function paintComposerMenu(
  items: {
    templateId?: string
    mark: string
    hue: number
    title: string
    hint: string
    current: boolean
    host?: boolean
    onPick: () => void
  }[],
): void {
  const menu = composerMenuEl()
  menu.hidden = false
  menu.replaceChildren()
  for (const item of items) {
    const button = document.createElement('button')
    button.type = 'button'
    button.classList.toggle('is-current', item.current)
    button.classList.toggle('is-host', Boolean(item.host))
    const avatar = document.createElement('span')
    if (item.templateId) {
      paintAgentAvatar(avatar, { templateId: item.templateId, hue: item.hue })
    } else {
      avatar.className = 'agent-avatar'
      avatar.dataset.hue = String(item.hue)
      avatar.textContent = item.mark
    }
    const copy = document.createElement('span')
    copy.className = 'stack-copy'
    const title = document.createElement('strong')
    title.textContent = item.title
    if (item.host) {
      title.append(hostBadgeEl())
    }
    const desc = document.createElement('small')
    desc.textContent = item.hint
    copy.append(title, desc)
    button.append(avatar, copy)
    button.addEventListener('mousedown', (event) => {
      event.preventDefault()
      item.onPick()
    })
    menu.append(button)
  }
}

function hideComposerMenu(): void {
  mentionHits = []
  skillHits = []
  mentionIndex = 0
  const menu = composerMenuEl()
  menu.hidden = true
  menu.replaceChildren()
}

function handleComposerKeys(event: KeyboardEvent): boolean {
  const total = skillHits.length > 0 ? skillHits.length : mentionHits.length
  if (total === 0) {
    return false
  }
  switch (event.key) {
    case 'ArrowDown':
      mentionIndex = (mentionIndex + 1) % total
      renderComposerMenu()
      return true
    case 'ArrowUp':
      mentionIndex = (mentionIndex - 1 + total) % total
      renderComposerMenu()
      return true
    case 'Enter':
    case 'Tab': {
      const skill = skillHits[mentionIndex]
      const agent = mentionHits[mentionIndex]
      if (skill) {
        insertSkill(skill)
      } else if (agent) {
        insertMention(agent)
      }
      return true
    }
    case 'Escape':
      hideComposerMenu()
      return true
    default:
      return false
  }
}

function insertMention(agent: AgentRecord): void {
  const command = commandEl()
  const at = mentionQueryAt(command.value, command.selectionStart)
  if (at) {
    replaceComposerToken(at, `@${agent.title} `)
    return
  }
  const prefix = command.value && !/\s$/.test(command.value) ? ' ' : ''
  const inserted = `${prefix}@${agent.title} `
  const start = command.selectionStart
  command.value = `${command.value.slice(0, start)}${inserted}${command.value.slice(command.selectionEnd)}`
  const cursor = start + inserted.length
  command.setSelectionRange(cursor, cursor)
  command.focus()
  hideComposerMenu()
}

function insertSkill(skill: ComposerSkill): void {
  replaceComposerToken(skillQueryAt(commandEl().value, commandEl().selectionStart), skill.insert)
}

function replaceComposerToken(
  token: { start: number; query: string } | undefined,
  inserted: string,
): void {
  const command = commandEl()
  if (!token) {
    hideComposerMenu()
    return
  }
  const before = command.value.slice(0, token.start)
  const after = command.value.slice(command.selectionStart)
  command.value = `${before}${inserted}${after}`
  const cursor = before.length + inserted.length
  command.setSelectionRange(cursor, cursor)
  command.focus()
  hideComposerMenu()
}

type ComposerSurface = 'inbox' | 'task'

function taskCommandEl(): HTMLTextAreaElement {
  return required('#task-command', HTMLTextAreaElement)
}

function contextThread(): ThreadRecord | undefined {
  if (focus.view === 'task' && selectedProjectId) {
    return threads.find((item) => item.id === selectedProjectId)
  }
  return threads.find((item) => item.id === focus.threadId)
}

function contextSnapshot(): {
  surface: ComposerSurface
  allowWorkspace: boolean
  threadId?: string
  folderPath?: string
  files: ProjectContextFile[]
} {
  const surface: ComposerSurface = focus.view === 'task' ? 'task' : 'inbox'
  if (surface === 'task') {
    const thread = selectedProjectId ? threads.find((item) => item.id === selectedProjectId) : undefined
    return {
      surface,
      allowWorkspace: true,
      threadId: thread?.id,
      folderPath: thread?.folderPath || pendingFolderPath || undefined,
      files: thread?.attachedFiles ?? pendingFiles,
    }
  }
  const thread = contextThread()
  return {
    surface,
    allowWorkspace: canBindProjectFolder(thread),
    threadId: thread?.id,
    folderPath: thread?.folderPath,
    files: thread?.attachedFiles ?? [],
  }
}

function paintComposerContext(): void {
  const host = document.querySelector('#composer-host')
  const taskHost = document.querySelector('#task-host')
  if (!(host instanceof HTMLElement) || !(taskHost instanceof HTMLElement)) {
    return
  }
  const snapshot = contextSnapshot()
  const chip = composerContextChip({ folderPath: snapshot.folderPath, hostName: hostLabel })
  host.textContent = chip.label
  host.title = chip.title
  host.classList.toggle('is-folder', chip.kind === 'folder')
  const taskPage = describeNewTaskPage({
    threads,
    agents,
    hostName: hostLabel,
    projectId: selectedProjectId || undefined,
    selectedIds: selectedTaskIds,
    leadId: leadTaskId,
    folderPath: pendingFolderPath || undefined,
  })
  taskHost.textContent = taskPage.chipLabel
  taskHost.title = taskPage.folderLabel ? `项目文件夹：${taskPage.folderLabel}` : chip.title
  const inboxThread = threads.find((item) => item.id === focus.threadId)
  const taskThread = selectedProjectId ? threads.find((item) => item.id === selectedProjectId) : undefined
  paintAttachmentChips('inbox', canBindProjectFolder(inboxThread) ? inboxThread?.attachedFiles ?? [] : [])
  paintAttachmentChips('task', taskThread?.attachedFiles ?? pendingFiles)
}

function currentComposerAgent(): AgentRecord | undefined {
  const thread = threads.find((item) => item.id === focus.threadId)
  const agentId = focus.agentId ?? thread?.workspaceAgentId ?? thread?.agentIds[0]
  return agents.find((item) => item.id === agentId)
}

function paintComposerModes(): void {
  const host = document.querySelector('#composer-modes')
  if (!(host instanceof HTMLElement)) {
    return
  }
  const thread = threads.find((item) => item.id === focus.threadId)
  const agent = currentComposerAgent()
  const visible = Boolean(agent && offersComposerModes(agent) && thread?.kind !== 'inbox')
  host.hidden = !visible
  if (!visible || !agent || !thread) {
    return
  }
  composerMode = composerModeOf(storedComposerModeOf(thread, agent.id) ?? parseComposerMode(thread.composerMode), agent)
  const labels: Record<ComposerMode, string> = { ask: '问', plan: '计划', agent: '动手' }
  host.replaceChildren()
  for (const mode of ['ask', 'plan', 'agent'] as const) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.mode = mode
    button.textContent = labels[mode]
    button.className = `composer-mode${composerMode === mode ? ' is-current' : ''}`
    button.addEventListener('click', () => {
      void setComposerMode(mode)
    })
    host.append(button)
  }
}

async function setComposerMode(mode: ComposerMode): Promise<void> {
  const thread = threads.find((item) => item.id === focus.threadId)
  const agent = currentComposerAgent()
  composerMode = mode
  if (thread && agent) {
    const next = await window.ownworkbuddy.agents.setComposerMode(thread.id, agent.id, mode)
    threads = threads.map((item) => (item.id === next.id ? next : item))
  }
  paintComposerModes()
}

function paintAttachmentChips(surface: ComposerSurface, files: readonly ProjectContextFile[]): void {
  const row = document.querySelector(surface === 'task' ? '#task-attachments' : '#composer-attachments')
  if (!(row instanceof HTMLElement)) {
    return
  }
  row.hidden = files.length === 0
  row.replaceChildren()
  for (const file of files) {
    const chip = document.createElement('span')
    chip.className = 'composer-attach-chip'
    chip.title = file.path
    const label = document.createElement('span')
    label.textContent = file.name
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.setAttribute('aria-label', `拿掉 ${file.name}`)
    remove.textContent = '×'
    remove.addEventListener('click', (event) => {
      event.stopPropagation()
      void runContextAction(surface, 'detach-file', file.path)
    })
    chip.append(label, remove)
    row.append(chip)
  }
}

function contextMenuEl(surface: ComposerSurface): HTMLElement {
  return required(surface === 'task' ? '#task-context-menu' : '#composer-context-menu', HTMLElement)
}

function hideContextMenus(): void {
  for (const surface of ['inbox', 'task'] as const) {
    const menu = document.querySelector(surface === 'task' ? '#task-context-menu' : '#composer-context-menu')
    if (menu instanceof HTMLElement) {
      menu.hidden = true
      menu.replaceChildren()
    }
    const plus = document.querySelector(surface === 'task' ? '#task-plus' : '#composer-plus')
    plus?.setAttribute('aria-expanded', 'false')
  }
}

function toggleContextMenu(surface: ComposerSurface): void {
  const menu = contextMenuEl(surface)
  if (!menu.hidden) {
    hideContextMenus()
    return
  }
  hideContextMenus()
  hideComposerMenu()
  paintContextActions(surface)
  menu.hidden = false
  const plus = document.querySelector(surface === 'task' ? '#task-plus' : '#composer-plus')
  plus?.setAttribute('aria-expanded', 'true')
}

function paintContextActions(surface: ComposerSurface): void {
  const snapshot = contextSnapshot()
  const items = composerContextMenuItems({
    allowWorkspace: snapshot.allowWorkspace,
    folderPath: snapshot.folderPath,
    files: snapshot.files,
  })
  paintContextMenu(
    surface,
    items.map((item) => ({
      title: item.title,
      hint: item.hint,
      onPick: () => {
        void runContextAction(surface, item.action, item.path)
      },
    })),
  )
}

function paintContextMenu(
  surface: ComposerSurface,
  items: { title: string; hint: string; onPick: () => void }[],
): void {
  const menu = contextMenuEl(surface)
  menu.replaceChildren()
  for (const item of items) {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('role', 'menuitem')
    const title = document.createElement('strong')
    title.textContent = item.title
    const hint = document.createElement('small')
    hint.textContent = item.hint
    button.append(title, hint)
    button.addEventListener('mousedown', (event) => {
      event.preventDefault()
      item.onPick()
    })
    menu.append(button)
  }
}

function paintSkillContextMenu(surface: ComposerSurface): void {
  const hits = listComposerSkills('', agents)
  paintContextMenu(
    surface,
    hits.map((skill) => ({
      title: skill.title,
      hint: skill.hint,
      onPick: () => insertContextSkill(surface, skill),
    })),
  )
  contextMenuEl(surface).hidden = false
}

function insertContextSkill(surface: ComposerSurface, skill: ComposerSkill): void {
  const input = surface === 'task' ? taskCommandEl() : commandEl()
  const token = skillQueryAt(input.value, input.selectionStart)
  const inserted = skill.insert
  if (token) {
    const before = input.value.slice(0, token.start)
    const after = input.value.slice(input.selectionStart)
    input.value = `${before}${inserted}${after}`
    const cursor = before.length + inserted.length
    input.setSelectionRange(cursor, cursor)
  } else {
    const prefix = input.value && !/\s$/.test(input.value) ? ' ' : ''
    const start = input.selectionStart
    const text = `${prefix}${inserted}`
    input.value = `${input.value.slice(0, start)}${text}${input.value.slice(input.selectionEnd)}`
    const cursor = start + text.length
    input.setSelectionRange(cursor, cursor)
  }
  input.focus()
  hideContextMenus()
  if (surface === 'inbox') {
    hideComposerMenu()
  }
}

function setComposerHint(text: string): void {
  const hint = document.querySelector('#composer-hint')
  if (hint instanceof HTMLElement) {
    hint.hidden = !text
    hint.textContent = text
  }
  if (focus.view === 'task') {
    setTaskHint(text)
  }
}

async function runContextAction(
  surface: ComposerSurface,
  action: ComposerContextAction,
  path?: string,
): Promise<void> {
  const snapshot = contextSnapshot()
  switch (action) {
    case 'cite-skill':
      paintSkillContextMenu(surface)
      return
    case 'pick-folder':
      if (!snapshot.allowWorkspace) {
        setComposerHint('今日不是项目。先开一件项目再绑文件夹。')
        hideContextMenus()
        return
      }
      await pickContextFolder(snapshot.threadId)
      hideContextMenus()
      return
    case 'pick-files':
      if (!snapshot.allowWorkspace) {
        setComposerHint('今日不是项目。先开一件项目再引用文件。')
        hideContextMenus()
        return
      }
      await pickContextFiles(snapshot.threadId)
      hideContextMenus()
      return
    case 'clear-folder':
      if (snapshot.threadId) {
        await window.ownworkbuddy.agents.clearFolder(snapshot.threadId)
        await refreshStudio()
      } else {
        pendingFolderPath = ''
        pendingFiles = []
        paintComposerContext()
      }
      hideContextMenus()
      return
    case 'detach-file':
      if (!path) {
        hideContextMenus()
        return
      }
      if (snapshot.threadId) {
        await window.ownworkbuddy.agents.detachFile(snapshot.threadId, path)
        await refreshStudio()
      } else {
        pendingFiles = pendingFiles.filter((file) => file.path !== path)
        paintComposerContext()
      }
      hideContextMenus()
      return
    default: {
      const exhaustive: never = action
      return exhaustive
    }
  }
}

async function pickContextFolder(threadId?: string): Promise<void> {
  if (!(window.ownworkbuddy.agents.pickFolder instanceof Function)) {
    setComposerHint('开发端还是旧主进程，完全退出后重新 pnpm dev。')
    return
  }
  try {
    const picked = await window.ownworkbuddy.agents.pickFolder(threadId)
    if (!picked) {
      return
    }
    if (!threadId) {
      pendingFolderPath = picked.path
      pendingFiles = pendingFiles.filter((file) => file.path.startsWith(picked.path))
    }
    await refreshStudio()
    paintComposerContext()
    setComposerHint('')
  } catch (error) {
    setComposerHint(error instanceof Error ? error.message : '没选到文件夹。')
  }
}

async function pickContextFiles(threadId?: string): Promise<void> {
  if (!(window.ownworkbuddy.agents.pickFiles instanceof Function)) {
    setComposerHint('开发端还是旧主进程，完全退出后重新 pnpm dev。')
    return
  }
  try {
    const picked = await window.ownworkbuddy.agents.pickFiles(threadId)
    if (!picked) {
      return
    }
    if (!threadId) {
      const files = picked.paths.map(contextFileFromPath).filter((file): file is ProjectContextFile => Boolean(file))
      pendingFiles = [...pendingFiles, ...files]
      if (!pendingFolderPath && files[0]) {
        pendingFolderPath = files[0].path.slice(0, files[0].path.length - files[0].name.length - 1)
      }
    }
    await refreshStudio()
    paintComposerContext()
    setComposerHint('')
  } catch (error) {
    setComposerHint(error instanceof Error ? error.message : '没选到文件。')
  }
}

function commandEl(): HTMLTextAreaElement {
  return required('#command', HTMLTextAreaElement)
}

function required<T extends typeof HTMLElement>(selector: string, ctor: T): InstanceType<T> {
  const node = document.querySelector(selector)
  if (!(node instanceof ctor)) {
    throw new Error(`missing ${selector}`)
  }
  return node as InstanceType<T>
}
