// 公众号草稿模块：类型定义 + 不依赖 Electron / DOM 的纯函数（可单测）
/** 直连微信通道使用说明见 src/main/wx-draft-wxapi.ts */

/** 扣子工作流 ID。空则必须在设置里自己填。 */
export const DEFAULT_WORKFLOW_ID = ''

/** 自动写入草稿时的默认作者。空则用设置里填的，或表单当前值。 */
export const DEFAULT_AUTHOR = ''

/** 微信标题 / 摘要字数上限（按码点计）。 */
export const WX_TITLE_MAX = 64
export const WX_DIGEST_MAX = 120

/** 扣子流式执行工作流接口。 */
export const COZE_STREAM_URL = 'https://api.coze.cn/v1/workflow/stream_run'

/** 表单层输入（camelCase，主进程调用时再映射为工作流的 snake_case 入参）。 */
export interface WxDraftInput {
  markdownContent: string
  title: string
  author: string
  digest: string
  coverImageUrl: string
  contentSourceUrl: string
  needOpenComment: 0 | 1
  onlyFansCanComment: 0 | 1
  /** 文末写入原创说明。微信 draft/add 没有官方原创标字段。 */
  declareOriginal: 0 | 1
  appid: string
  secret: string
  /** 本地主文档路径，用于把 `/images/…` 解析到磁盘。 */
  markdownPath?: string
  /** 用户选择或拖入的配图文件夹。 */
  assetRoots?: string[]
  /** 用户选择或拖入的单张配图。 */
  assetFiles?: string[]
}

/** 草稿通道：direct = 本机直连微信 API，coze = 扣子工作流。 */
export type WxDraftChannel = 'direct' | 'coze'

/** 模块设置（密钥在 store 层加密，这里只承载明文读写时的结构）。 */
export interface WxDraftSettings {
  workflowId: string
  defaultAuthor: string
  appid: string
  needOpenComment: 0 | 1
  onlyFansCanComment: 0 | 1
  channel: WxDraftChannel
  // 以下为敏感字段，仅在保存时传入；读取设置时只回传脱敏预览
  cozeToken: string
  wxSecret: string
}

/** 保存设置时的输入：敏感字段 undefined=不改，null=清除，''=不改，非空=更新。 */
export interface WxDraftSettingsInput {
  workflowId?: string
  defaultAuthor?: string
  appid?: string
  needOpenComment?: 0 | 1
  onlyFansCanComment?: 0 | 1
  channel?: WxDraftChannel
  cozeToken?: string | null
  wxSecret?: string | null
}

/** 设置回传给渲染层的形态：敏感字段只给是否已配置与脱敏预览。 */
export interface WxDraftSettingsView {
  workflowId: string
  defaultAuthor: string
  appid: string
  needOpenComment: 0 | 1
  onlyFansCanComment: 0 | 1
  channel: WxDraftChannel
  hasCozeToken: boolean
  cozeTokenPreview: string
  hasWxSecret: boolean
  wxSecretPreview: string
}

/** 一次草稿创建的历史记录。 */
export interface WxDraftRecord {
  id: string
  title: string
  draftMediaId: string
  coverMediaId: string
  debugUrl: string
  status: 'success' | 'failed'
  error?: string
  createdAt: string
}

/** 主进程持久化的整体数据形态。 */
export interface WxDraftState {
  settings: {
    workflowId: string
    defaultAuthor: string
    appid: string
    needOpenComment: 0 | 1
    onlyFansCanComment: 0 | 1
    channel: WxDraftChannel
    cozeToken?: { encrypted: string } | { plain: string } | null
    wxSecret?: { encrypted: string } | { plain: string } | null
  }
  records: WxDraftRecord[]
}

/** 解析后的单个 SSE 事件。 */
export interface WxSseEvent {
  id: string | null
  event: string
  data: unknown
}

/** 扣子 Message 事件 data 的结构（只声明用到的字段）。 */
export interface WxMessageData {
  content?: string
  node_title?: string
  node_seq_id?: string
  node_is_finish?: boolean
}

/** 根据正文总结出的标题、摘要与配图提示。 */
export interface WxDraftAiMeta {
  title: string
  digest: string
  coverPrompt: string
}

/** 推给渲染层的流式进度。 */
export interface WxDraftProgress {
  stage: 'delta' | 'node' | 'error' | 'done' | 'ping' | 'meta'
  delta?: string
  nodeTitle?: string
  message?: string
  title?: string
  digest?: string
  coverImageUrl?: string
  author?: string
  at: string
}

/** 流式执行最终结果。 */
export interface WxDraftRunResult {
  output: Record<string, unknown> | null
  draftMediaId: string
  coverMediaId: string
  debugUrl: string
}

/** 文件选择器读到的本地主文档。 */
export interface PickedMarkdown {
  path: string
  name: string
  content: string
  coverPath?: string
}

/** 用户选择的配图文件夹 / 单张图。 */
export interface PickedAssets {
  roots: string[]
  files: string[]
}

/** 拖入正文区的本地文件：主文档 + 配图目录/文件。 */
export interface IngestedDrop {
  markdown: PickedMarkdown | null
  roots: string[]
  files: string[]
}

/** 渲染层拉取的整体状态：脱敏设置 + 历史 + 是否在跑。 */
export interface WxDraftViewState {
  settings: WxDraftSettingsView
  records: WxDraftRecord[]
  running: boolean
}

/** IPC 执行失败时抛出的结构化错误。 */
export class WxDraftError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'WxDraftError'
    this.code = code
  }
}

/**
 * 从累积的 SSE 文本缓冲中切出完整事件块。
 * SSE 事件之间以空行（\n\n 或 \r\n\r\n）分隔，末尾不完整的部分留待下次拼接。
 */
export function splitSseBlocks(buffer: string): { blocks: string[]; rest: string } {
  const parts = buffer.split(/\r?\n\r?\n/)
  const rest = parts.pop() ?? ''
  return { blocks: parts.filter((block) => block.trim().length > 0), rest }
}

/** 解析单个 SSE 事件块为 {id, event, data}，data 尽量 JSON.parse。 */
export function parseSseBlock(block: string): WxSseEvent | null {
  if (!block || !block.trim()) {
    return null
  }
  let event = 'message'
  const dataLines: string[] = []
  let id: string | null = null
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, '')
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
    } else if (line.startsWith('id:')) {
      id = line.slice(3).trim()
    }
  }
  if (dataLines.length === 0) {
    return { id, event, data: null }
  }
  const dataStr = dataLines.join('\n')
  try {
    return { id, event, data: JSON.parse(dataStr) as unknown }
  } catch {
    return { id, event, data: dataStr }
  }
}

/** 扣子结束节点标题可能是空字符串，也可能是 End / 结束。 */
export function isWorkflowEndTitle(title: string | undefined): boolean {
  const name = (title ?? '').trim()
  return name === '' || name === 'End' || name === '结束'
}

/**
 * 判断 Message 事件是否为「结束节点汇总包」：
 * node_is_finish=true，且标题为空 / End / 结束，content 是结果 JSON 字符串。
 * 返回解析后的输出对象；不是汇总包则返回 null。
 */
export function extractFinalOutput(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') {
    return null
  }
  const message = data as WxMessageData
  if (
    message.node_is_finish === true &&
    isWorkflowEndTitle(message.node_title) &&
    typeof message.content === 'string'
  ) {
    try {
      const parsed = JSON.parse(message.content) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return { raw_output: message.content }
    }
  }
  return null
}

/** 把表单输入映射为扣子工作流开始节点的 snake_case 入参。 */
export function buildWorkflowParameters(input: WxDraftInput): Record<string, string | number> {
  return {
    markdown_content: input.markdownContent,
    title: input.title,
    author: input.author,
    digest: input.digest,
    cover_image_url: input.coverImageUrl,
    content_source_url: input.contentSourceUrl,
    need_open_comment: input.needOpenComment,
    only_fans_can_comment: input.onlyFansCanComment,
    appid: input.appid,
    secret: input.secret,
  }
}

/** 从 Message.data.content 解析出对象（字符串 JSON 或已是对象）。 */
export function parseWorkflowContent(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') {
    return null
  }
  const content = (data as WxMessageData).content as unknown
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    return content as Record<string, unknown>
  }
  if (typeof content !== 'string' || !content.trim()) {
    return null
  }
  try {
    const parsed = JSON.parse(content) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return null
  }
  return null
}

/** 后到的空 media_id 不得盖住已经收到的值。 */
export function mergeWorkflowOutput(
  current: Record<string, unknown> | null,
  next: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!next) {
    return current
  }
  if (!current) {
    return next
  }
  return {
    ...current,
    ...next,
    draft_media_id: pickString(next, 'draft_media_id') || pickString(current, 'draft_media_id'),
    cover_media_id: pickString(next, 'cover_media_id') || pickString(current, 'cover_media_id'),
  }
}

/**
 * 吸收一条扣子 Message：结束汇总包、未标 finish 的 End 节点、
 * 以及 content 已是对象的情况都收下；空 id 不覆盖已有 id。
 */
export function absorbWorkflowMessage(
  current: Record<string, unknown> | null,
  data: unknown,
): Record<string, unknown> | null {
  const parsed = parseWorkflowContent(data)
  const final = extractFinalOutput(data)
  if (final) {
    return mergeWorkflowOutput(current, final)
  }
  if (parsed && (pickString(parsed, 'draft_media_id') || pickString(parsed, 'cover_media_id'))) {
    return mergeWorkflowOutput(current, parsed)
  }
  return current
}

/** 把微信 gettoken 错误码转成可执行的中文说明。 */
export function explainWeixinAuthError(errcode: number, errmsg = ''): string {
  switch (errcode) {
    case 40164:
      return '当前出口 IP 不在公众号 IP 白名单，微信拒绝发放 token。到 mp.weixin.qq.com → 设置与开发 → 基本配置 → IP 白名单，把下方提示的本机出口 IP 加进去即可恢复；扣子通道不受影响（云端 IP 一直放行）。家庭宽带 IP 会变，变化后需重新添加。'
    case 40125:
    case 40001:
      return 'AppSecret 无效或已重置，请在设置里重新保存。'
    case 40013:
      return 'AppID 无效，请核对公众号后台的开发者 ID。'
    case 41002:
    case 41004:
      return '缺少 AppID 或 AppSecret。'
    case 40007:
      return '封面 media_id 无效，封面上传可能失败，请重试。'
    case 45009:
      return '当日接口调用超限，请明日再试或减少调用。'
    case 48001:
      return '接口未授权：公众号未认证或未开通草稿箱权限。'
    default: {
      const detail = errmsg.trim() || `errcode ${String(errcode)}`
      if (detail.includes('封面图片尺寸') || detail.includes('封面裁剪')) {
        return `封面图裁剪不合规：图文需要能裁出 2.35:1（建议 ≥900×383）和 1:1（建议 ≥200×200）。${detail}`
      }
      return `微信接口失败：${detail}`
    }
  }
}

/** 从工作流输出对象中安全取字符串字段。 */
export function pickString(output: Record<string, unknown> | null, key: string): string {
  const value = output?.[key]
  return typeof value === 'string' ? value : ''
}

/** 敏感信息脱敏：保留首 4 位与末 4 位。 */
export function maskSecret(value: string): string {
  if (!value) {
    return ''
  }
  if (value.length <= 8) {
    return '****'
  }
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

/** 按 Unicode 码点截断，避免把代理对切坏。 */
export function clipChars(text: string, max: number): string {
  const chars = [...text.trim()]
  return chars.length > max ? chars.slice(0, max).join('') : chars.join('')
}

/** 解析模型返回的标题 / 摘要 / 配图提示。 */
export function parseWxDraftAiMeta(content: string): WxDraftAiMeta | null {
  const json = content.replace(/```json|```/g, '').trim()
  const start = json.indexOf('{')
  const end = json.lastIndexOf('}')
  if (start < 0 || end < 0) {
    return null
  }
  try {
    const raw = JSON.parse(json.slice(start, end + 1)) as Record<string, unknown>
    const title = typeof raw.title === 'string' ? raw.title.trim() : ''
    const digest = typeof raw.digest === 'string' ? raw.digest.trim() : ''
    const coverPrompt = typeof raw.coverPrompt === 'string' ? raw.coverPrompt.trim() : ''
    if (!title) {
      return null
    }
    return {
      title: clipChars(title, WX_TITLE_MAX),
      digest: clipChars(digest || title, WX_DIGEST_MAX),
      coverPrompt: coverPrompt || `Editorial cover for "${title}", warm paper, lamp, books, no text`,
    }
  } catch {
    return null
  }
}

/** 模型不可用时，从正文第一则标题或首段兜底。 */
export function fallbackDraftMeta(markdown: string): WxDraftAiMeta {
  const lines = markdown
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const heading = lines.find((line) => /^#{1,3}\s+/.test(line))?.replace(/^#{1,3}\s+/, '') ?? ''
  const firstPara = lines.find((line) => !/^#{1,6}\s+/.test(line) && !/^[-*`>|]/.test(line)) ?? ''
  const title = heading || clipChars(firstPara, 32) || '未命名草稿'
  const digest = firstPara && firstPara !== heading ? firstPara : title
  return {
    title: clipChars(title, WX_TITLE_MAX),
    digest: clipChars(digest, WX_DIGEST_MAX),
    coverPrompt: `Editorial cover for "${title}", warm paper, data and books, no text, 2.35:1`,
  }
}

/**
 * 写入草稿前补全元数据：作者用表单值，空才回落到默认作者；
 * 标题 / 摘要留空时用 AI（或兜底）结果填上。封面只认手工图，不生成。
 */
export function applyWxDraftMeta(input: WxDraftInput, meta: WxDraftAiMeta): WxDraftInput {
  return {
    ...input,
    author: input.author.trim() || DEFAULT_AUTHOR,
    title: input.title.trim() || meta.title,
    digest: input.digest.trim() || meta.digest,
    coverImageUrl: input.coverImageUrl.trim(),
  }
}

/** 空输入兜底，生成一份默认表单。 */
export function emptyInput(author = DEFAULT_AUTHOR, appid = ''): WxDraftInput {
  return {
    markdownContent: '',
    title: '',
    author: author.trim(),
    digest: '',
    coverImageUrl: '',
    contentSourceUrl: '',
    needOpenComment: 0,
    onlyFansCanComment: 0,
    declareOriginal: 1,
    appid,
    secret: '',
    markdownPath: '',
    assetRoots: [],
    assetFiles: [],
  }
}
