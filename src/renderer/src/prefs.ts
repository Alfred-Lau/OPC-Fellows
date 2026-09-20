import type { WorkbenchCatalog } from '../../kernel/shared/catalog'
import type { WorkbenchProfileView } from '../../kernel/shared/profile'
import { PRODUCT_NAME } from '../../shared/brand'
import { describeLlmKeyStatus, type LlmSettings } from '../../shared/deepseek'
import { DEFAULT_PRODUCT_LINE, type OpcProduct, type StatsStatus } from '../../shared/products'
import { setUserAvatarSrc } from './avatar'
import { setHostLabel } from './studio'

const PREFS_SECTIONS = ['me', 'appearance', 'model', 'catalog', 'about'] as const
type PrefsSection = (typeof PREFS_SECTIONS)[number]

const view = required('#view-prefs', HTMLElement)
const displayName = required('#prefs-display-name', HTMLInputElement)
const hostHint = required('#prefs-host-hint', HTMLParagraphElement)
const productEl = required('#prefs-product', HTMLElement)
const versionEl = required('#prefs-version', HTMLElement)
const channelEl = required('#prefs-channel', HTMLElement)
const catalogForm = required('#catalog-form', HTMLFormElement)
const catalogTag = required('#catalog-tag', HTMLInputElement)
const catalogSignature = required('#catalog-signature', HTMLInputElement)
const catalogProducts = required('#catalog-products', HTMLDivElement)
const catalogAdd = required('#catalog-add', HTMLButtonElement)
const catalogReset = required('#catalog-reset', HTMLButtonElement)
const catalogHint = required('#catalog-hint', HTMLParagraphElement)
const llmForm = required('#prefs-llm-form', HTMLFormElement)
const llmKey = required('#prefs-llm-key', HTMLInputElement)
const llmStatus = required('#prefs-llm-status', HTMLParagraphElement)
const llmClear = required('#prefs-llm-clear', HTMLButtonElement)

let bound = false
let lastCatalog: WorkbenchCatalog | null = null
let lastLlm: LlmSettings | null = null
let section: PrefsSection = 'me'
let lastSavedName = ''

function required<T extends typeof HTMLElement>(selector: string, ctor: T): InstanceType<T> {
  const node = document.querySelector(selector)
  if (!(node instanceof ctor)) {
    throw new Error(`missing ${selector}`)
  }
  return node as InstanceType<T>
}

function isPrefsSection(value: string | undefined): value is PrefsSection {
  return PREFS_SECTIONS.some((section) => section === value)
}

export function activatePrefs(): void {
  if (!bound) {
    bound = true
    bindPrefs()
  }
  view.dataset.active = 'true'
  showSection(section)
  void renderProfile()
  void renderCatalog()
  void renderLlmSettings()
}

export function leavePrefs(): void {
  view.dataset.active = 'false'
  void saveDisplayNameIfNeeded()
}

function bindPrefs(): void {
  productEl.textContent = PRODUCT_NAME
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-prefs-section]')) {
    button.addEventListener('click', () => {
      if (isPrefsSection(button.dataset.prefsSection)) {
        showSection(button.dataset.prefsSection)
      }
    })
  }
  required('#prefs-me-form', HTMLFormElement).addEventListener('submit', (event) => {
    event.preventDefault()
    void saveDisplayName()
  })
  displayName.addEventListener('change', () => {
    void saveDisplayNameIfNeeded()
  })
  required('#prefs-avatar-pick', HTMLButtonElement).addEventListener('click', () => {
    void pickAvatar()
  })
  required('#prefs-avatar-clear', HTMLButtonElement).addEventListener('click', () => {
    void clearAvatar()
  })
  catalogForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void saveCatalog()
  })
  catalogAdd.addEventListener('click', () => {
    catalogProducts.append(productRow())
  })
  catalogReset.addEventListener('click', () => {
    void resetCatalog()
  })
  llmForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void saveLlmKey()
  })
  llmClear.addEventListener('click', () => {
    void clearLlmKey()
  })
  window.ownworkbuddy.workbench.onCatalogChanged((catalog) => {
    if (view.dataset.active === 'true') {
      fillCatalog(catalog)
    }
  })
}

function showSection(next: PrefsSection): void {
  section = next
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-prefs-section]')) {
    button.classList.toggle('is-current', button.dataset.prefsSection === next)
  }
  for (const panel of document.querySelectorAll<HTMLElement>('[data-prefs-panel]')) {
    panel.hidden = panel.dataset.prefsPanel !== next
  }
}

async function renderProfile(): Promise<void> {
  if (!window.ownworkbuddy.profile) {
    hostHint.textContent = '开发预览里还读不到本机档案。'
    return
  }
  applyProfile(await window.ownworkbuddy.profile.get())
}

async function saveDisplayName(): Promise<void> {
  applyProfile(await window.ownworkbuddy.profile.save({ displayName: displayName.value }))
  hostHint.textContent = '已保存称呼。'
}

async function saveDisplayNameIfNeeded(): Promise<void> {
  if (!window.ownworkbuddy.profile) {
    return
  }
  if (displayName.value.trim() === lastSavedName) {
    return
  }
  await saveDisplayName()
}

async function pickAvatar(): Promise<void> {
  const next = await window.ownworkbuddy.profile.pickAvatar()
  if (next) {
    applyProfile(next)
  }
}

async function clearAvatar(): Promise<void> {
  applyProfile(await window.ownworkbuddy.profile.clearAvatar())
}

function applyProfile(profile: WorkbenchProfileView): void {
  displayName.value = profile.displayName
  hostHint.textContent = profile.displayName
    ? `没填时会回落到机器名 ${profile.hostName}。`
    : `现在用机器名「${profile.hostName}」。`
  productEl.textContent = PRODUCT_NAME
  versionEl.textContent = profile.version
  channelEl.textContent = profile.packaged ? '打包' : '开发'
  setUserAvatarSrc(profile.avatarDataUrl)
  setHostLabel(profile.label)
  const railName = document.querySelector('#rail-user-name')
  if (railName) {
    railName.textContent = profile.label
  }
  lastSavedName = profile.displayName
}

async function renderCatalog(): Promise<void> {
  fillCatalog(await window.ownworkbuddy.workbench.catalog())
}

async function renderLlmSettings(): Promise<void> {
  if (!window.ownworkbuddy.llm) {
    llmStatus.textContent = '开发预览里还读不到模型密钥。'
    llmClear.disabled = true
    return
  }
  paintLlmSettings(await window.ownworkbuddy.llm.settings())
}

function paintLlmSettings(settings: LlmSettings): void {
  lastLlm = settings
  llmStatus.textContent = describeLlmKeyStatus(settings)
  llmStatus.classList.remove('is-error')
  llmClear.disabled = settings.keySource !== 'stored'
}

async function saveLlmKey(): Promise<void> {
  const key = llmKey.value.trim()
  if (!key) {
    llmStatus.textContent = '先粘贴一把 DeepSeek API Key。'
    llmStatus.classList.add('is-error')
    return
  }
  const result = await window.ownworkbuddy.llm.setApiKey(key)
  paintLlmSettings(result.settings)
  if (!result.ok) {
    llmStatus.textContent = result.error ?? '保存失败。'
    llmStatus.classList.add('is-error')
    return
  }
  llmKey.value = ''
  if (result.settings.keySource === 'env') {
    llmStatus.textContent = `本机已保存 ${result.settings.keyPreview}，但当前仍以环境变量 DEEPSEEK_API_KEY 为准。`
  }
}

async function clearLlmKey(): Promise<void> {
  if (lastLlm?.keySource !== 'stored') {
    return
  }
  if (!window.confirm('清除本机保存的 DeepSeek API Key？')) {
    return
  }
  const result = await window.ownworkbuddy.llm.setApiKey(null)
  paintLlmSettings(result.settings)
  llmKey.value = ''
}

function fillCatalog(catalog: WorkbenchCatalog): void {
  lastCatalog = catalog
  catalogTag.value = catalog.defaultProjectTag
  catalogSignature.value = catalog.socialSignature
  catalogProducts.replaceChildren()
  for (const product of catalog.products) {
    catalogProducts.append(productRow(product))
  }
}

function productRow(product?: Partial<OpcProduct>): HTMLElement {
  const row = document.createElement('div')
  row.className = 'catalog-row'
  row.append(
    field('id', 'id', product?.id ?? '', true),
    field('名称', 'name', product?.name ?? ''),
    field('网址', 'url', product?.url ?? ''),
    field('统计源', 'statsOrigin', product?.statsOrigin ?? ''),
    statusField(product?.statsStatus ?? 'pending'),
  )
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'ghost danger'
  remove.textContent = '删'
  remove.addEventListener('click', () => {
    row.remove()
  })
  row.append(remove)
  return row
}

function field(label: string, key: string, value: string, readonly = false): HTMLLabelElement {
  const wrap = document.createElement('label')
  wrap.textContent = label
  const input = document.createElement('input')
  input.type = 'text'
  input.dataset.key = key
  input.value = value
  input.spellcheck = false
  if (readonly && value) {
    input.readOnly = true
  }
  wrap.append(input)
  return wrap
}

function statusField(value: StatsStatus): HTMLLabelElement {
  const wrap = document.createElement('label')
  wrap.textContent = '统计'
  const select = document.createElement('select')
  select.dataset.key = 'statsStatus'
  for (const option of ['live', 'pending', 'unavailable'] as const) {
    const node = document.createElement('option')
    node.value = option
    node.textContent = option === 'live' ? '请求' : option === 'pending' ? '未接' : '跳过'
    node.selected = option === value
    select.append(node)
  }
  wrap.append(select)
  return wrap
}

function readCatalog(): WorkbenchCatalog {
  const products: OpcProduct[] = []
  for (const row of catalogProducts.querySelectorAll('.catalog-row')) {
    const value = (key: string): string =>
      (row.querySelector(`[data-key="${key}"]`) as HTMLInputElement | HTMLSelectElement | null)?.value.trim() ?? ''
    const id = value('id')
    const name = value('name')
    const url = value('url')
    if (!id || !name || !url) {
      continue
    }
    const statsStatus = value('statsStatus') as StatsStatus
    const previous = lastCatalog?.products.find((item) => item.id === id)
    products.push({
      id,
      line: previous?.line ?? DEFAULT_PRODUCT_LINE
      name,
      nameEn: previous?.nameEn || name,
      url,
      ...(value('statsOrigin') ? { statsOrigin: value('statsOrigin') } : {}),
      statsStatus: statsStatus === 'live' || statsStatus === 'unavailable' ? statsStatus : 'pending',
      pitch: previous?.pitch ?? '',
      pitchEn: previous?.pitchEn ?? '',
      aliases: previous?.aliases ?? [],
      tagsZh: previous?.tagsZh ?? [],
      tagsEn: previous?.tagsEn ?? [],
    })
  }
  return {
    defaultProjectTag: catalogTag.value.trim(),
    socialSignature: catalogSignature.value.trim(),
    products,
  }
}

async function saveCatalog(): Promise<void> {
  try {
    const next = await window.ownworkbuddy.workbench.saveCatalog(readCatalog())
    fillCatalog(next)
    catalogHint.textContent = `已保存 ${next.products.length} 个产品。监控、收款、账号、弹药都会用这份目录。`
  } catch (error) {
    catalogHint.textContent = `保存失败：${describeError(error)}`
  }
}

async function resetCatalog(): Promise<void> {
  if (!window.confirm('清空产品清单、标签和社媒签名？个人站点不会再从代码里回来。')) {
    return
  }
  fillCatalog(await window.ownworkbuddy.workbench.resetCatalog())
  catalogHint.textContent = '已清空为空白工作情况。'
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function hydrateProfile(): Promise<void> {
  if (!window.ownworkbuddy.profile) {
    return
  }
  applyProfile(await window.ownworkbuddy.profile.get())
}
