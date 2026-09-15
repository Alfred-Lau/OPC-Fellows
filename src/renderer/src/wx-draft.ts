import {
  type WxDraftChannel,
  type PickedMarkdown,
  type WxDraftInput,
  type WxDraftProgress,
  type WxDraftRecord,
  type WxDraftRunResult,
  type WxDraftSettingsView,
} from '../../shared/wx-draft'

const $ = <T extends typeof HTMLElement>(selector: string, ctor: T): InstanceType<T> => {
  const node = document.querySelector(selector)
  if (!(node instanceof ctor)) {
    throw new Error(`missing ${selector}`)
  }
  return node as InstanceType<T>
}

// —— 主表单 ——
const runBtn = $('#wxd-run', HTMLButtonElement)
const stopBtn = $('#wxd-stop', HTMLButtonElement)
const runState = $('#wxd-run-state', HTMLSpanElement)
const pickBtn = $('#wxd-pick', HTMLButtonElement)
const pickAssetsBtn = $('#wxd-pick-assets', HTMLButtonElement)
const dropEl = $('#wxd-drop', HTMLElement)
const fileEl = $('#wxd-file', HTMLParagraphElement)
const assetsEl = $('#wxd-assets', HTMLParagraphElement)
const markdownEl = $('#wxd-markdown', HTMLTextAreaElement)
const titleEl = $('#wxd-title', HTMLInputElement)
const authorEl = $('#wxd-author', HTMLInputElement)
const coverEl = $('#wxd-cover', HTMLInputElement)
const coverHintEl = $('#wxd-cover-hint', HTMLParagraphElement)
const digestEl = $('#wxd-digest', HTMLInputElement)
const sourceUrlEl = $('#wxd-source-url', HTMLInputElement)
const openCommentEl = $('#wxd-open-comment', HTMLInputElement)
const fansOnlyEl = $('#wxd-fans-only', HTMLInputElement)
const originalEl = $('#wxd-original', HTMLInputElement)

// —— 设置 ——
const channelEl = $('#wxd-channel', HTMLSelectElement)
const workflowEl = $('#wxd-workflow', HTMLInputElement)
const defaultAuthorEl = $('#wxd-default-author', HTMLInputElement)
const appidEl = $('#wxd-appid', HTMLInputElement)
const tokenEl = $('#wxd-token', HTMLInputElement)
const secretEl = $('#wxd-secret', HTMLInputElement)
const tokenStateEl = $('#wxd-token-state', HTMLSpanElement)
const secretStateEl = $('#wxd-secret-state', HTMLSpanElement)
const setOpenEl = $('#wxd-set-open', HTMLInputElement)
const setFansEl = $('#wxd-set-fans', HTMLInputElement)
const saveSettingsBtn = $('#wxd-save-settings', HTMLButtonElement)
const clearTokenBtn = $('#wxd-clear-token', HTMLButtonElement)
const clearSecretBtn = $('#wxd-clear-secret', HTMLButtonElement)
const settingsPanel = $('.wx-settings', HTMLDetailsElement)

// —— 进度 / 结果 / 历史 ——
const progressStateEl = $('#wxd-progress-state', HTMLSpanElement)
const logEl = $('#wxd-log', HTMLUListElement)
const resultBlock = $('#wxd-result-block', HTMLElement)
const resultEl = $('#wxd-result', HTMLDivElement)
const historyEl = $('#wxd-history', HTMLUListElement)
const historyMeta = $('#wxd-history-meta', HTMLSpanElement)

let running = false
let loaded = false
let markdownPath = ''
let assetRoots: string[] = []
let assetFiles: string[] = []

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function clock(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

function stampTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return `${date.getMonth() + 1}/${date.getDate()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function appendLog(text: string, tone: 'plain' | 'node' | 'ok' | 'error' = 'plain'): void {
  const item = document.createElement('li')
  item.className = `wx-log-line is-${tone}`
  const time = document.createElement('span')
  time.className = 'wx-log-time'
  time.textContent = clock(new Date().toISOString())
  const body = document.createElement('span')
  body.className = 'wx-log-text'
  body.textContent = text
  item.append(time, body)
  logEl.append(item)
  logEl.scrollTop = logEl.scrollHeight
}

function setRunning(next: boolean): void {
  running = next
  runBtn.disabled = next
  stopBtn.hidden = !next
  runBtn.textContent = next ? '生成中…' : '生成草稿'
  progressStateEl.textContent = next ? '执行中' : ''
}

function applyChannelMode(channel: WxDraftChannel): void {
  const hide = channel !== 'coze'
  for (const node of document.querySelectorAll<HTMLElement>('.coze-only')) {
    node.hidden = hide
  }
}

function fillSettings(settings: WxDraftSettingsView): void {
  channelEl.value = settings.channel === 'coze' ? 'coze' : 'direct'
  applyChannelMode(settings.channel)
  workflowEl.value = settings.workflowId
  defaultAuthorEl.value = settings.defaultAuthor
  authorEl.value = settings.defaultAuthor
  appidEl.value = settings.appid
  setOpenEl.checked = settings.needOpenComment === 1
  setFansEl.checked = settings.onlyFansCanComment === 1
  openCommentEl.checked = settings.needOpenComment === 1
  fansOnlyEl.checked = settings.onlyFansCanComment === 1
  tokenEl.value = ''
  secretEl.value = ''
  tokenEl.placeholder = settings.hasCozeToken ? `已保存 ${settings.cozeTokenPreview}，留空不修改` : '尚未配置，粘贴 pat_…'
  secretEl.placeholder = settings.hasWxSecret ? `已保存 ${settings.wxSecretPreview}，留空不修改` : '尚未配置，粘贴 AppSecret'
  tokenStateEl.textContent = settings.hasCozeToken ? '已配置' : '未配置'
  tokenStateEl.className = `wx-secret-state ${settings.hasCozeToken ? 'is-ok' : 'is-missing'}`
  secretStateEl.textContent = settings.hasWxSecret ? '已配置' : '未配置'
  secretStateEl.className = `wx-secret-state ${settings.hasWxSecret ? 'is-ok' : 'is-missing'}`
}

function renderHistory(records: WxDraftRecord[]): void {
  historyMeta.textContent = records.length ? `${records.length} 条` : ''
  historyEl.replaceChildren()
  if (records.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'wx-empty'
    empty.textContent = '还没有生成记录'
    historyEl.append(empty)
    return
  }
  for (const record of records) {
    historyEl.append(historyRow(record))
  }
}

function historyRow(record: WxDraftRecord): HTMLLIElement {
  const item = document.createElement('li')
  item.className = `wx-history-row is-${record.status}`
  const head = document.createElement('div')
  head.className = 'wx-history-head'
  const dot = document.createElement('span')
  dot.className = 'wx-dot'
  dot.textContent = record.status === 'success' ? '✓' : '✕'
  const title = document.createElement('span')
  title.className = 'wx-history-title'
  title.textContent = record.title || '未命名'
  const when = document.createElement('span')
  when.className = 'wx-history-when'
  when.textContent = stampTime(record.createdAt)
  head.append(dot, title, when)
  item.append(head)

  if (record.status === 'success') {
    const meta = document.createElement('div')
    meta.className = 'wx-history-meta'
    meta.textContent = `草稿 ${record.draftMediaId || '—'} · 封面 ${record.coverMediaId || '—'}`
    item.append(meta)
  } else if (record.error) {
    const meta = document.createElement('div')
    meta.className = 'wx-history-meta is-error'
    meta.textContent = record.error
    item.append(meta)
  }

  const actions = document.createElement('div')
  actions.className = 'wx-history-actions'
  if (record.draftMediaId) {
    actions.append(smallButton('复制草稿ID', () => window.ownworkbuddy.wxdraft.copy(record.draftMediaId)))
  }
  if (record.debugUrl) {
    actions.append(smallButton('调试链接', () => window.ownworkbuddy.wxdraft.openExternal(record.debugUrl)))
  }
  actions.append(
    smallButton('删除', async () => {
      const next = await window.ownworkbuddy.wxdraft.removeRecord(record.id)
      renderHistory(next)
    }),
  )
  item.append(actions)
  return item
}

function smallButton(text: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'ghost wx-mini'
  button.textContent = text
  button.addEventListener('click', () => onClick())
  return button
}

function renderResult(result: WxDraftRunResult): void {
  resultBlock.hidden = false
  resultEl.replaceChildren()
  const rows: Array<[string, string, boolean]> = [
    ['草稿 media_id', result.draftMediaId, true],
    ['封面 media_id', result.coverMediaId, false],
    ['调试链接', result.debugUrl, false],
  ]
  for (const [label, value, copyable] of rows) {
    const row = document.createElement('div')
    row.className = 'wx-result-row'
    const key = document.createElement('span')
    key.className = 'wx-result-key'
    key.textContent = label
    const val = document.createElement('span')
    val.className = 'wx-result-val'
    val.textContent = value || '—'
    val.title = value
    row.append(key, val)
    if (copyable && value) {
      row.append(
        smallButton('复制', () => {
          void window.ownworkbuddy.wxdraft.copy(value)
        }),
      )
    }
    if (label === '调试链接' && value) {
      row.append(smallButton('打开', () => void window.ownworkbuddy.wxdraft.openExternal(value)))
    }
    resultEl.append(row)
  }
}

async function refreshState(): Promise<void> {
  const state = await window.ownworkbuddy.wxdraft.state()
  fillSettings(state.settings)
  renderHistory(state.records)
  runState.textContent = state.running ? '（有任务在跑）' : ''
}

function collectInput(): WxDraftInput | string {
  const markdown = markdownEl.value
  if (!markdown.trim()) {
    return '请先贴入或读取正文 Markdown'
  }
  return {
    markdownContent: markdown,
    title: titleEl.value.trim(),
    author: authorEl.value.trim(),
    digest: digestEl.value.trim(),
    coverImageUrl: coverEl.value.trim(),
    contentSourceUrl: sourceUrlEl.value.trim(),
    needOpenComment: openCommentEl.checked ? 1 : 0,
    onlyFansCanComment: fansOnlyEl.checked ? 1 : 0,
    declareOriginal: originalEl.checked ? 1 : 0,
    appid: '',
    secret: '',
    markdownPath,
    assetRoots,
    assetFiles,
  }
}

async function run(): Promise<void> {
  if (running) {
    return
  }
  const collected = collectInput()
  if (typeof collected === 'string') {
    appendLog(collected, 'error')
    return
  }
  resultBlock.hidden = true
  logEl.replaceChildren()
  appendLog('先审查正文、校对红线词和错别字、核对封面，再根据正文生成标题和简介，然后写入草稿…', 'node')
  setRunning(true)
  try {
    const result = await window.ownworkbuddy.wxdraft.run(collected)
    appendLog(`草稿创建成功：${result.draftMediaId}`, 'ok')
    renderResult(result)
    const state = await window.ownworkbuddy.wxdraft.state()
    renderHistory(state.records)
  } catch (error) {
    appendLog(`失败：${(error as Error).message ?? error}`, 'error')
  } finally {
    setRunning(false)
  }
}

function handleProgress(progress: WxDraftProgress): void {
  switch (progress.stage) {
    case 'node':
      appendLog(`节点 · ${progress.nodeTitle ?? ''}${progress.delta ? `：${truncate(progress.delta)}` : ''}`, 'node')
      break
    case 'delta':
      if (progress.delta) {
        appendLog(truncate(progress.delta), 'plain')
      }
      break
    case 'done':
      appendLog(progress.message ?? '工作流结束', 'ok')
      break
    case 'error':
      appendLog(progress.message ?? '出错', 'error')
      break
    case 'ping':
      break
    case 'meta':
      applyGeneratedMeta(progress)
      appendLog(progress.message ?? '已生成标题和简介', 'ok')
      break
    default: {
      const _exhaustive: never = progress.stage
      void _exhaustive
    }
  }
}

function applyGeneratedMeta(progress: WxDraftProgress): void {
  if (progress.title) {
    titleEl.value = progress.title
  }
  if (progress.digest) {
    digestEl.value = progress.digest
  }
  if (progress.coverImageUrl) {
    coverEl.value = progress.coverImageUrl
  }
  authorEl.value = progress.author || defaultAuthorEl.value
}

function truncate(text: string, max = 120): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed
}

// —— 事件绑定 ——

runBtn.addEventListener('click', () => void run())
stopBtn.addEventListener('click', () => {
  void window.ownworkbuddy.wxdraft.stop()
})

function addUnique(list: string[], next: string[]): string[] {
  const seen = new Set(list)
  const out = [...list]
  for (const item of next) {
    if (!item || seen.has(item)) {
      continue
    }
    seen.add(item)
    out.push(item)
  }
  return out
}

function refreshSourceHint(): void {
  if (markdownPath) {
    fileEl.hidden = false
    const name = markdownPath.split(/[\\/]/).pop() || markdownPath
    fileEl.textContent = `已读取：${name}（按该文档目录解析 /images/ 配图）`
  } else {
    fileEl.hidden = true
    fileEl.textContent = ''
  }
  const bits: string[] = []
  if (assetRoots.length) {
    bits.push(`文件夹 ${assetRoots.length} 个`)
  }
  if (assetFiles.length) {
    bits.push(`单张图 ${assetFiles.length} 张`)
  }
  if (bits.length) {
    assetsEl.hidden = false
    assetsEl.textContent = `配图来源：${bits.join(' · ')}`
  } else {
    assetsEl.hidden = true
    assetsEl.textContent = ''
  }
}

function applyCoverHint(coverPath?: string): void {
  if (coverPath) {
    coverEl.value = coverPath
    coverHintEl.hidden = true
    coverHintEl.textContent = ''
    return
  }
  coverEl.value = ''
  coverHintEl.hidden = false
  coverHintEl.textContent = 'images 里还没有封面图。请补上 封面.jpg / 封面.png / cover.jpg（与正文 .md 同级），再点生成草稿。封面要手工做，不会自动生成。'
}

function applyPickedMarkdown(picked: PickedMarkdown): void {
  markdownPath = picked.path
  markdownEl.value = picked.content
  applyCoverHint(picked.coverPath)
  refreshSourceHint()
  if (picked.coverPath) {
    const name = picked.coverPath.split(/[\\/]/).pop() || picked.coverPath
    appendLog(`已载入本地主文档 ${picked.name}（${picked.content.length} 字），封面用 images/${name}`, 'ok')
    return
  }
  appendLog(`已载入本地主文档 ${picked.name}（${picked.content.length} 字）。${coverHintEl.textContent}`, 'error')
}

function pathsFromDataTransfer(transfer: DataTransfer): string[] {
  const out: string[] = []
  for (const file of Array.from(transfer.files)) {
    const path = (file as File & { path?: string }).path
    if (typeof path === 'string' && path) {
      out.push(path)
    }
  }
  return out
}

pickBtn.addEventListener('click', async () => {
  const picked = await window.ownworkbuddy.wxdraft.pickMarkdown()
  if (!picked) {
    return
  }
  applyPickedMarkdown(picked)
})

pickAssetsBtn.addEventListener('click', async () => {
  const picked = await window.ownworkbuddy.wxdraft.pickAssets()
  if (!picked) {
    return
  }
  assetRoots = addUnique(assetRoots, picked.roots)
  assetFiles = addUnique(assetFiles, picked.files)
  refreshSourceHint()
  appendLog(`已加入配图文件夹 ${picked.roots.length} 个，生成时会先上传本地插图`, 'ok')
})

dropEl.addEventListener('dragover', (event) => {
  event.preventDefault()
  dropEl.classList.add('is-drop')
})

dropEl.addEventListener('dragleave', () => {
  dropEl.classList.remove('is-drop')
})

dropEl.addEventListener('drop', (event) => {
  event.preventDefault()
  dropEl.classList.remove('is-drop')
  const paths = event.dataTransfer ? pathsFromDataTransfer(event.dataTransfer) : []
  if (paths.length === 0) {
    appendLog('拖入的文件没有本地路径，请改用「读取本地 .md」或「选择配图文件夹」', 'error')
    return
  }
  void window.ownworkbuddy.wxdraft.ingestDrop(paths).then((ingested) => {
    if (ingested.markdown) {
      applyPickedMarkdown(ingested.markdown)
    }
    assetRoots = addUnique(assetRoots, ingested.roots)
    assetFiles = addUnique(assetFiles, ingested.files)
    refreshSourceHint()
    if (!ingested.markdown && ingested.roots.length === 0 && ingested.files.length === 0) {
      appendLog('拖入的内容不是 .md / 图片 / 文件夹', 'error')
      return
    }
    if (ingested.roots.length || ingested.files.length) {
      appendLog('已收下拖入的配图，生成草稿时会上传并写回正文', 'ok')
    }
  })
})

settingsPanel.querySelector('summary')?.addEventListener('click', (event) => {
  event.preventDefault()
  settingsPanel.open = !settingsPanel.open
})

channelEl.addEventListener('change', () => {
  const channel: WxDraftChannel = channelEl.value === 'coze' ? 'coze' : 'direct'
  applyChannelMode(channel)
  appendLog(channel === 'coze' ? '已切换扣子通道' : '已切换直连通道', 'plain')
})

saveSettingsBtn.addEventListener('click', async () => {
  const next = await window.ownworkbuddy.wxdraft.saveSettings({
    channel: channelEl.value === 'coze' ? 'coze' : 'direct',
    workflowId: workflowEl.value.trim(),
    defaultAuthor: defaultAuthorEl.value.trim(),
    appid: appidEl.value.trim(),
    needOpenComment: setOpenEl.checked ? 1 : 0,
    onlyFansCanComment: setFansEl.checked ? 1 : 0,
    // 输入框留空 => undefined => 不修改已保存密钥
    cozeToken: tokenEl.value ? tokenEl.value.trim() : undefined,
    wxSecret: secretEl.value ? secretEl.value.trim() : undefined,
  })
  fillSettings(next.settings)
  renderHistory(next.records)
  appendLog('设置已保存', 'ok')
})

clearTokenBtn.addEventListener('click', async () => {
  const next = await window.ownworkbuddy.wxdraft.saveSettings({ cozeToken: null })
  fillSettings(next.settings)
  appendLog('已清除扣子 PAT', 'plain')
})

clearSecretBtn.addEventListener('click', async () => {
  const next = await window.ownworkbuddy.wxdraft.saveSettings({ wxSecret: null })
  fillSettings(next.settings)
  appendLog('已清除微信 AppSecret', 'plain')
})

window.ownworkbuddy.wxdraft.onProgress(handleProgress)

export function activateWxDraft(): void {
  markdownEl.focus()
  if (!loaded) {
    loaded = true
    void refreshState()
  }
}
