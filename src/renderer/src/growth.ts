import { getProducts } from '../../shared/products'
import {
  AARRR_STAGES,
  CHANNEL_STATUSES,
  EXPERIMENT_STATUSES,
  GROWTH_AGENT_ID,
  GROWTH_TAG,
  LOOP_KINDS,
  aarrrLabel,
  channelStatusLabel,
  experimentStatusLabel,
  experimentTodoTitle,
  loopKindLabel,
  type AarrrStage,
  type ChannelStatus,
  type ExperimentStatus,
  type GrowthChannel,
  type GrowthExperiment,
  type GrowthLoop,
  type GrowthState,
  type LoopKind,
} from '../../shared/growth'

const GROUP_KEY = 'ownworkbuddy.growthGroup'
const EXPERIMENT_KEY = 'ownworkbuddy.growthExperiment'
const LOOP_KEY = 'ownworkbuddy.growthLoop'
const CHANNEL_KEY = 'ownworkbuddy.growthChannel'

const countEl = required('#growth-count', HTMLSpanElement)
const newBtn = required('#growth-new', HTMLButtonElement)
const filtersEl = required('#growth-filters', HTMLDivElement)
const listEl = required('#growth-list', HTMLUListElement)
const emptyEl = required('#growth-empty', HTMLDivElement)
const detailEl = required('#growth-detail', HTMLDivElement)
const experimentForm = required('#growth-experiment-form', HTMLFormElement)
const loopForm = required('#growth-loop-form', HTMLFormElement)
const channelForm = required('#growth-channel-form', HTMLFormElement)

type Group = 'experiments' | 'loops' | 'channels'

let state: GrowthState = { experiments: [], loops: [], channels: [] }
let group: Group = readGroup()
let selectedExperimentId = localStorage.getItem(EXPERIMENT_KEY) ?? ''
let selectedLoopId = localStorage.getItem(LOOP_KEY) ?? ''
let selectedChannelId = localStorage.getItem(CHANNEL_KEY) ?? ''
let bound = false
let editing = false

function required<T extends typeof HTMLElement>(selector: string, ctor: T): InstanceType<T> {
  const node = document.querySelector(selector)
  if (!(node instanceof ctor)) {
    throw new Error(`missing ${selector}`)
  }
  return node as InstanceType<T>
}

function readGroup(): Group {
  const raw = localStorage.getItem(GROUP_KEY)
  if (raw === 'experiments' || raw === 'loops' || raw === 'channels') {
    return raw
  }
  return 'experiments'
}

function remember(): void {
  localStorage.setItem(GROUP_KEY, group)
  if (selectedExperimentId) {
    localStorage.setItem(EXPERIMENT_KEY, selectedExperimentId)
  } else {
    localStorage.removeItem(EXPERIMENT_KEY)
  }
  if (selectedLoopId) {
    localStorage.setItem(LOOP_KEY, selectedLoopId)
  } else {
    localStorage.removeItem(LOOP_KEY)
  }
  if (selectedChannelId) {
    localStorage.setItem(CHANNEL_KEY, selectedChannelId)
  } else {
    localStorage.removeItem(CHANNEL_KEY)
  }
}

function applyState(next: GrowthState): void {
  state = next
  if (!state.experiments.some((item) => item.id === selectedExperimentId)) {
    selectedExperimentId = state.experiments[0]?.id ?? ''
  }
  if (!state.loops.some((item) => item.id === selectedLoopId)) {
    selectedLoopId = state.loops[0]?.id ?? ''
  }
  if (!state.channels.some((item) => item.id === selectedChannelId)) {
    selectedChannelId = state.channels[0]?.id ?? ''
  }
  remember()
  render()
}

export function activateGrowth(): void {
  bindGrowth()
  void refreshGrowth()
}

export function revealGrowthGroup(next: Group): void {
  group = next
  editing = false
  remember()
  activateGrowth()
}

export function highlightExperiment(id: string): void {
  selectedExperimentId = id
  group = 'experiments'
  remember()
  void refreshGrowth()
}

export async function refreshGrowth(): Promise<void> {
  applyState(await window.ownworkbuddy.growth.state())
}

function bindGrowth(): void {
  if (bound) {
    return
  }
  bound = true
  fillSelects()
  newBtn.addEventListener('click', () => {
    editing = true
    clearForm()
    render()
  })
  experimentForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitExperiment()
  })
  loopForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitLoop()
  })
  channelForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitChannel()
  })
}

function fillSelects(): void {
  fillNamedSelect('#experiment-stage', AARRR_STAGES, aarrrLabel)
  fillNamedSelect('#experiment-status', EXPERIMENT_STATUSES, experimentStatusLabel)
  fillNamedSelect('#loop-kind', LOOP_KINDS, loopKindLabel)
  fillNamedSelect('#channel-status', CHANNEL_STATUSES, channelStatusLabel)
  fillNamedSelect('#channel-stage', AARRR_STAGES, aarrrLabel)
  const product = required('#loop-product', HTMLSelectElement)
  const channelProduct = required('#channel-product', HTMLSelectElement)
  const options = ['<option value="">不挂产品</option>'].concat(
    getProducts().map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)}</option>`),
  )
  product.innerHTML = options.join('')
  channelProduct.innerHTML = options.join('')
}

function fillNamedSelect<T extends string>(selector: string, values: readonly T[], labelOf: (value: T) => string): void {
  const select = required(selector, HTMLSelectElement)
  select.replaceChildren(
    ...values.map((value) => {
      const option = document.createElement('option')
      option.value = value
      option.textContent = labelOf(value)
      return option
    }),
  )
}

function render(): void {
  const total = state.experiments.length + state.loops.length + state.channels.length
  countEl.textContent = String(total)
  newBtn.textContent = group === 'experiments' ? '开实验' : group === 'loops' ? '画增长环' : '排渠道'
  renderFilters()
  renderList()
  experimentForm.hidden = group !== 'experiments' || (!editing && !selectedExperimentId)
  loopForm.hidden = group !== 'loops' || (!editing && !selectedLoopId)
  channelForm.hidden = group !== 'channels' || (!editing && !selectedChannelId)
  const empty =
    (group === 'experiments' && state.experiments.length === 0 && !editing) ||
    (group === 'loops' && state.loops.length === 0 && !editing) ||
    (group === 'channels' && state.channels.length === 0 && !editing)
  emptyEl.hidden = !empty
  emptyEl.textContent =
    group === 'experiments'
      ? '还没有实验。点开实验，写下假设和指标。不要去刷新流量。'
      : group === 'loops'
        ? '还没有增长环。内容、裂变、付费、销售、产品各一份真相。'
        : '还没有渠道表。试水、扩量、暂停、杀掉，不是账号也不是弹药。'
  detailEl.hidden = empty
  if (group === 'experiments') {
    fillExperimentForm()
  }
  if (group === 'loops') {
    fillLoopForm()
  }
  if (group === 'channels') {
    fillChannelForm()
  }
}

function renderFilters(): void {
  const items: Array<{ id: Group; label: string; count: number }> = [
    { id: 'experiments', label: '实验', count: state.experiments.length },
    { id: 'loops', label: '增长环', count: state.loops.length },
    { id: 'channels', label: '渠道', count: state.channels.length },
  ]
  filtersEl.replaceChildren(
    ...items.map((item) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = `${item.label} ${item.count}`
      button.classList.toggle('is-on', group === item.id)
      button.addEventListener('click', () => {
        group = item.id
        editing = false
        remember()
        render()
      })
      return button
    }),
  )
}

function renderList(): void {
  listEl.replaceChildren()
  if (group === 'experiments') {
    for (const item of state.experiments) {
      listEl.append(experimentRow(item))
    }
    return
  }
  if (group === 'loops') {
    for (const item of state.loops) {
      listEl.append(loopRow(item))
    }
    return
  }
  for (const item of state.channels) {
    listEl.append(channelRow(item))
  }
}

function experimentRow(item: GrowthExperiment): HTMLElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'growth-item'
  button.classList.toggle('is-on', item.id === selectedExperimentId && !editing)
  button.innerHTML = `<strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(aarrrLabel(item.stage))} · ${escapeHtml(experimentStatusLabel(item.status))}</span>`
  button.addEventListener('click', () => {
    selectedExperimentId = item.id
    editing = false
    remember()
    render()
  })
  return wrapRow(button, () => void window.ownworkbuddy.growth.removeExperiment(item.id).then(applyState))
}

function loopRow(item: GrowthLoop): HTMLElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'growth-item'
  button.classList.toggle('is-on', item.id === selectedLoopId && !editing)
  button.innerHTML = `<strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(loopKindLabel(item.kind))}</span>`
  button.addEventListener('click', () => {
    selectedLoopId = item.id
    editing = false
    remember()
    render()
  })
  return wrapRow(button, () => void window.ownworkbuddy.growth.removeLoop(item.id).then(applyState))
}

function channelRow(item: GrowthChannel): HTMLElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'growth-item'
  button.classList.toggle('is-on', item.id === selectedChannelId && !editing)
  button.innerHTML = `<strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(channelStatusLabel(item.status))} · ${item.score}分</span>`
  button.addEventListener('click', () => {
    selectedChannelId = item.id
    editing = false
    remember()
    render()
  })
  return wrapRow(button, () => void window.ownworkbuddy.growth.removeChannel(item.id).then(applyState))
}

function wrapRow(button: HTMLButtonElement, remove: () => void): HTMLElement {
  const row = document.createElement('li')
  const trash = document.createElement('button')
  trash.type = 'button'
  trash.className = 'ghost'
  trash.textContent = '删'
  trash.addEventListener('click', (event) => {
    event.preventDefault()
    remove()
  })
  row.append(button, trash)
  return row
}

function fillExperimentForm(): void {
  const item = editing ? undefined : state.experiments.find((item) => item.id === selectedExperimentId)
  required('#experiment-id', HTMLInputElement).value = item?.id ?? ''
  required('#experiment-title', HTMLInputElement).value = item?.title ?? ''
  required('#experiment-hypothesis', HTMLTextAreaElement).value = item?.hypothesis ?? ''
  required('#experiment-metric', HTMLInputElement).value = item?.metric ?? ''
  required('#experiment-stage', HTMLSelectElement).value = item?.stage ?? 'acquisition'
  required('#experiment-status', HTMLSelectElement).value = item?.status ?? 'running'
  required('#experiment-note', HTMLInputElement).value = item?.note ?? ''
  renderExperimentMeta(item)
}

function fillLoopForm(): void {
  const item = editing ? undefined : state.loops.find((item) => item.id === selectedLoopId)
  required('#loop-id', HTMLInputElement).value = item?.id ?? ''
  required('#loop-title', HTMLInputElement).value = item?.title ?? ''
  required('#loop-kind', HTMLSelectElement).value = item?.kind ?? 'content'
  required('#loop-steps', HTMLTextAreaElement).value = item?.steps ?? ''
  required('#loop-product', HTMLSelectElement).value = item?.productId ?? ''
  required('#loop-note', HTMLInputElement).value = item?.note ?? ''
}

function fillChannelForm(): void {
  const item = editing ? undefined : state.channels.find((item) => item.id === selectedChannelId)
  required('#channel-id', HTMLInputElement).value = item?.id ?? ''
  required('#channel-name', HTMLInputElement).value = item?.name ?? ''
  required('#channel-status', HTMLSelectElement).value = item?.status ?? 'testing'
  required('#channel-stage', HTMLSelectElement).value = item?.stage ?? 'acquisition'
  required('#channel-score', HTMLInputElement).value = String(item?.score ?? 3)
  required('#channel-product', HTMLSelectElement).value = item?.productId ?? ''
  required('#channel-note', HTMLInputElement).value = item?.note ?? ''
}

function renderExperimentMeta(item: GrowthExperiment | undefined): void {
  const meta = required('#experiment-meta', HTMLDivElement)
  meta.replaceChildren()
  if (!item) {
    return
  }
  if (item.ideaId) {
    const pointer = document.createElement('p')
    pointer.className = 'hint'
    pointer.textContent = `Idea 指针 ${item.ideaId}。正文仍在选品。`
    meta.append(pointer)
  }
  if (item.ammoNote) {
    const pointer = document.createElement('p')
    pointer.className = 'hint'
    pointer.textContent = `已交接弹药：${item.ammoNote}`
    meta.append(pointer)
  }
  const todo = document.createElement('button')
  todo.type = 'button'
  todo.textContent = '写成待办'
  todo.addEventListener('click', () => {
    void window.ownworkbuddy.todos.ingestAgent({
      agentId: GROWTH_AGENT_ID,
      source: '增长黑客',
      tags: [GROWTH_TAG],
      items: [
        {
          title: experimentTodoTitle(item),
          note: `experiment:${item.id}`,
          dedupeKey: `growth:follow:${item.id}`,
        },
      ],
    })
  })
  meta.append(todo)
}

function clearForm(): void {
  if (group === 'experiments') {
    selectedExperimentId = ''
  }
  if (group === 'loops') {
    selectedLoopId = ''
  }
  if (group === 'channels') {
    selectedChannelId = ''
  }
}

async function submitExperiment(): Promise<void> {
  const title = required('#experiment-title', HTMLInputElement).value.trim()
  if (!title) {
    return
  }
  const next = await window.ownworkbuddy.growth.saveExperiment({
    id: required('#experiment-id', HTMLInputElement).value || undefined,
    title,
    hypothesis: required('#experiment-hypothesis', HTMLTextAreaElement).value,
    metric: required('#experiment-metric', HTMLInputElement).value,
    stage: required('#experiment-stage', HTMLSelectElement).value as AarrrStage,
    status: required('#experiment-status', HTMLSelectElement).value as ExperimentStatus,
    note: required('#experiment-note', HTMLInputElement).value,
  })
  editing = false
  selectedExperimentId = next.experiments.find((item) => item.title === title)?.id ?? selectedExperimentId
  applyState(next)
}

async function submitLoop(): Promise<void> {
  const title = required('#loop-title', HTMLInputElement).value.trim()
  if (!title) {
    return
  }
  const next = await window.ownworkbuddy.growth.saveLoop({
    id: required('#loop-id', HTMLInputElement).value || undefined,
    title,
    kind: required('#loop-kind', HTMLSelectElement).value as LoopKind,
    steps: required('#loop-steps', HTMLTextAreaElement).value,
    productId: required('#loop-product', HTMLSelectElement).value,
    note: required('#loop-note', HTMLInputElement).value,
  })
  editing = false
  selectedLoopId = next.loops.find((item) => item.title === title)?.id ?? selectedLoopId
  applyState(next)
}

async function submitChannel(): Promise<void> {
  const name = required('#channel-name', HTMLInputElement).value.trim()
  if (!name) {
    return
  }
  const next = await window.ownworkbuddy.growth.saveChannel({
    id: required('#channel-id', HTMLInputElement).value || undefined,
    name,
    status: required('#channel-status', HTMLSelectElement).value as ChannelStatus,
    stage: required('#channel-stage', HTMLSelectElement).value as AarrrStage,
    score: Number(required('#channel-score', HTMLInputElement).value),
    productId: required('#channel-product', HTMLSelectElement).value,
    note: required('#channel-note', HTMLInputElement).value,
  })
  editing = false
  selectedChannelId = next.channels.find((item) => item.name === name)?.id ?? selectedChannelId
  applyState(next)
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;')
}
