import { clipboard, dialog, shell } from 'electron'
import { readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname } from 'node:path'
import type { IpcRegistrar } from '../kernel/main/ipc'
import { getWorkbenchWindow } from './workbench-window'
import { runWxDraftStream } from './wx-draft-coze'
import { reviseWxDraftBody, summarizeWxDraft } from './wx-draft-llm'
import { fetchEgressIp } from './egress-ip'
import { WxDirectClient } from './wx-draft-wxapi'
import {
  findLocalCover,
  isLocalImageSrc,
  missingCoverMessage,
  rewriteMarkdownImageSrcs,
  type LocalImageResolveContext,
} from '../shared/wx-draft-images'
import {
  addRecord,
  defaultAuthor,
  draftChannel,
  listRecords,
  removeRecord,
  resolveAppid,
  resolveCozeToken,
  resolveWxSecret,
  saveWxDraftSettings,
  wxDraftSettingsView,
  workflowId,
} from './wx-draft-store'
import { isOverContentLimit, markdownToWechatHtml } from '../shared/wx-draft-html'
import {
  appendOriginalityNotice,
  formatReviewMessage,
  reviewWxDraftMarkdown,
} from '../shared/wx-draft-review'
import {
  WxDraftError,
  applyWxDraftMeta,
  explainWeixinAuthError,
  type IngestedDrop,
  type PickedAssets,
  type PickedMarkdown,
  type WxDraftInput,
  type WxDraftProgress,
  type WxDraftRunResult,
  type WxDraftSettingsInput,
} from '../shared/wx-draft'

let currentController: AbortController | null = null

function emit(progress: WxDraftProgress): void {
  getWorkbenchWindow()?.webContents.send('wxdraft:progress', progress)
}

function asRecord(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function asFlag(value: unknown): 0 | 1 {
  return value === 1 || value === true || value === '1' ? 1 : 0
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png'])
const MARKDOWN_EXT = new Set(['.md', '.markdown', '.txt'])

function classifyLocalPath(path: string): 'markdown' | 'image' | 'dir' | 'other' {
  try {
    const stat = statSync(path)
    if (stat.isDirectory()) {
      return 'dir'
    }
    if (stat.isFile()) {
      const ext = extname(path).toLowerCase()
      if (MARKDOWN_EXT.has(ext)) {
        return 'markdown'
      }
      if (IMAGE_EXT.has(ext)) {
        return 'image'
      }
    }
  } catch {
    return 'other'
  }
  return 'other'
}

function readPickedMarkdown(path: string): PickedMarkdown {
  return {
    path,
    name: basename(path),
    content: readFileSync(path, 'utf8'),
    coverPath: findLocalCover({ markdownPath: path }),
  }
}

function imageContext(input: WxDraftInput): LocalImageResolveContext {
  return {
    markdownPath: input.markdownPath?.trim() || undefined,
    assetRoots: input.assetRoots,
    assetFiles: input.assetFiles,
  }
}

/** 审查后的正文；勾选原创声明时再在文末追加说明。 */
function bodyMarkdown(input: WxDraftInput): string {
  return input.declareOriginal === 0
    ? input.markdownContent
    : appendOriginalityNotice(input.markdownContent, input.author)
}

/** 把渲染层传来的 unknown 规范化为工作流入参，并补全存储里的 appid/secret/作者。 */
function normalizeInput(raw: unknown): WxDraftInput {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const input: WxDraftInput = {
    markdownContent: asRecord(data.markdownContent, ''),
    title: asRecord(data.title, ''),
    author: asRecord(data.author, ''),
    digest: asRecord(data.digest, ''),
    coverImageUrl: asRecord(data.coverImageUrl, ''),
    contentSourceUrl: asRecord(data.contentSourceUrl, ''),
    needOpenComment: asFlag(data.needOpenComment),
    onlyFansCanComment: asFlag(data.onlyFansCanComment),
    declareOriginal: data.declareOriginal === undefined ? 1 : asFlag(data.declareOriginal),
    appid: asRecord(data.appid, ''),
    secret: asRecord(data.secret, ''),
    markdownPath: asRecord(data.markdownPath, ''),
    assetRoots: asStringList(data.assetRoots),
    assetFiles: asStringList(data.assetFiles),
  }
  // 表单留空时回退到已保存设置 / 环境变量。
  input.appid = input.appid.trim() || resolveAppid()
  input.secret = input.secret.trim() || resolveWxSecret()
  input.author = input.author.trim() || defaultAuthor()
  return input
}

export function stopWxDraftRun(): void {
  currentController?.abort()
  currentController = null
}

export function registerWxDraftIpc(handle: IpcRegistrar): void {
  handle('wxdraft:state', () => ({
    settings: wxDraftSettingsView(),
    records: listRecords(),
    running: currentController !== null,
  }))

  handle('wxdraft:save-settings', (_event, raw: unknown) => {
    const data = (raw && typeof raw === 'object' ? raw : {}) as WxDraftSettingsInput
    return {
      settings: saveWxDraftSettings({
        workflowId: typeof data.workflowId === 'string' ? data.workflowId : undefined,
        channel:
          typeof data.channel === 'string' && (data.channel === 'direct' || data.channel === 'coze')
            ? data.channel
            : undefined,
        defaultAuthor: typeof data.defaultAuthor === 'string' ? data.defaultAuthor : undefined,
        appid: typeof data.appid === 'string' ? data.appid : undefined,
        needOpenComment: data.needOpenComment === undefined ? undefined : asFlag(data.needOpenComment),
        onlyFansCanComment:
          data.onlyFansCanComment === undefined ? undefined : asFlag(data.onlyFansCanComment),
        cozeToken: data.cozeToken === undefined ? undefined : (data.cozeToken as string | null),
        wxSecret: data.wxSecret === undefined ? undefined : (data.wxSecret as string | null),
      }),
      records: listRecords(),
      running: currentController !== null,
    }
  })

  handle('wxdraft:run', async (_event, raw: unknown): Promise<WxDraftRunResult> => {
    if (currentController) {
      throw new WxDraftError('BUSY', '已有一个草稿任务在执行，请先停止或等待完成')
    }
    const input = normalizeInput(raw)
    const token = resolveCozeToken()
    const controller = new AbortController()
    currentController = controller
    const startedAt = new Date().toISOString()
    let filled = input
    try {
      const coverImageUrl = input.coverImageUrl.trim() || findLocalCover(imageContext(input)) || ''
      if (!coverImageUrl) {
        throw new WxDraftError('NO_COVER', missingCoverMessage())
      }
      filled = { ...input, coverImageUrl }
      emit({ stage: 'node', nodeTitle: '审查正文', delta: '正在剔除封面图和 AI 指引', at: startedAt })
      const reviewed = reviewWxDraftMarkdown(input.markdownContent)
      if (!reviewed.markdown.trim()) {
        throw new WxDraftError('EMPTY_BODY', '审查后没有可发布的正文。请确认 Markdown 不是只剩封面图或 AI 指引。')
      }
      filled = { ...filled, markdownContent: reviewed.markdown }
      emit({
        stage: 'delta',
        delta: formatReviewMessage(reviewed),
        at: new Date().toISOString(),
      })
      emit({ stage: 'node', nodeTitle: '校对正文', delta: '红线词、错别字、未格式化标记', at: new Date().toISOString() })
      const revised = await reviseWxDraftBody(filled.markdownContent, controller.signal)
      filled = { ...filled, markdownContent: revised.revision.markdown }
      emit({
        stage: 'delta',
        delta: revised.message,
        at: new Date().toISOString(),
      })
      if (filled.declareOriginal !== 0) {
        emit({
          stage: 'delta',
          delta: '将在文末写入原创说明。官方原创标 draft/add 不支持，需到公众号后台草稿箱点选',
          at: new Date().toISOString(),
        })
      }
      emit({ stage: 'node', nodeTitle: '总结正文', delta: '正在生成标题和简介', at: new Date().toISOString() })
      const { meta, usedModel } = await summarizeWxDraft(filled.markdownContent, controller.signal)
      filled = applyWxDraftMeta(filled, meta)
      emit({
        stage: 'meta',
        title: filled.title,
        digest: filled.digest,
        coverImageUrl: filled.coverImageUrl,
        author: filled.author,
        message: usedModel ? '已根据正文生成标题和简介' : '未连上模型，已用正文标题/首段兜底',
        at: new Date().toISOString(),
      })
      await assertWeixinAuth(filled.appid, filled.secret)
      const result =
        draftChannel() === 'direct'
          ? await runDirect(filled, controller)
          : await runCoze(filled, controller, token)
      const ok = Boolean(result.draftMediaId)
      addRecord({
        id: crypto.randomUUID(),
        title: filled.title,
        draftMediaId: result.draftMediaId,
        coverMediaId: result.coverMediaId,
        debugUrl: result.debugUrl,
        status: ok ? 'success' : 'failed',
        error: ok ? undefined : '工作流未返回 draft_media_id，可打开调试链接排查',
        createdAt: startedAt,
      })
      if (!ok) {
        throw new WxDraftError(
          'NO_DRAFT_ID',
          result.debugUrl
            ? `工作流执行结束但未返回草稿 media_id。常见原因是公众号开了 IP 白名单，扣子云端过不了。调试：${result.debugUrl}`
            : '工作流执行结束但未返回草稿 media_id，请查看调试链接',
        )
      }
      return result
    } catch (error) {
      const e = error as WxDraftError
      // NO_DRAFT_ID 已在上面落过带 debugUrl 的记录，避免再写一条把链接冲掉。
      if (e.code !== 'NO_DRAFT_ID') {
        addRecord({
          id: crypto.randomUUID(),
          title: filled.title || input.title || '未命名草稿',
          draftMediaId: '',
          coverMediaId: '',
          debugUrl: '',
          status: 'failed',
          error: e.message || String(error),
          createdAt: startedAt,
        })
      }
      throw error
    } finally {
      currentController = null
    }
  })

  handle('wxdraft:stop', () => {
    currentController?.abort()
    return currentController !== null
  })

  handle('wxdraft:remove-record', (_event, id: unknown) => {
    if (typeof id === 'string') {
      removeRecord(id)
    }
    return listRecords()
  })

  handle('wxdraft:copy', async (_event, text: unknown) => {
    if (typeof text === 'string' && text) {
      clipboard.writeText(text)
      return true
    }
    return false
  })

  handle('wxdraft:open-external', async (_event, url: unknown) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) {
      await shell.openExternal(url)
      return true
    }
    return false
  })

  // 通过系统文件选择器读取本地主文档（.md / .txt），对应「一个主文档」的素材入口。
  handle('wxdraft:pick-markdown', async () => {
    const options: Electron.OpenDialogOptions = {
      title: '选择 Markdown 主文档',
      properties: ['openFile'],
      filters: [
        { name: 'Markdown / 文本', extensions: ['md', 'markdown', 'txt'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    }
    const parent = getWorkbenchWindow()
    const picked = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (picked.canceled || picked.filePaths.length === 0) {
      return null
    }
    const path = picked.filePaths[0]
    return readPickedMarkdown(path)
  })

  handle('wxdraft:pick-assets', async (): Promise<PickedAssets | null> => {
    const options: Electron.OpenDialogOptions = {
      title: '选择配图文件夹',
      properties: ['openDirectory', 'multiSelections'],
    }
    const parent = getWorkbenchWindow()
    const picked = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (picked.canceled || picked.filePaths.length === 0) {
      return null
    }
    return { roots: picked.filePaths, files: [] }
  })

  handle('wxdraft:ingest-drop', async (_event, raw: unknown): Promise<IngestedDrop> => {
    const paths = asStringList(raw)
    const result: IngestedDrop = { markdown: null, roots: [], files: [] }
    for (const path of paths) {
      const kind = classifyLocalPath(path)
      switch (kind) {
        case 'markdown':
          if (!result.markdown) {
            result.markdown = readPickedMarkdown(path)
          }
          break
        case 'image':
          result.files.push(path)
          result.roots.push(dirname(path))
          break
        case 'dir':
          result.roots.push(path)
          break
        case 'other':
          break
        default: {
          const _exhaustive: never = kind
          void _exhaustive
        }
      }
    }
    result.roots = [...new Set(result.roots)]
    result.files = [...new Set(result.files)]
    return result
  })
}

async function runDirect(filled: WxDraftInput, controller: AbortController): Promise<WxDraftRunResult> {
  emit({
    stage: 'node',
    nodeTitle: '转换格式',
    delta: 'Markdown → 微信正文 HTML',
    at: new Date().toISOString(),
  })
  const { html, images, mathCount } = markdownToWechatHtml(bodyMarkdown(filled))
  if (isOverContentLimit(html)) {
    throw new WxDraftError('CONTENT_TOO_LONG', '正文超过微信 2 万字符上限,请精简后再试')
  }
  if (mathCount > 0) {
    emit({
      stage: 'delta',
      delta: `检测到 ${mathCount} 处 LaTeX 公式,当前以代码块文本展示(v1),图片化渲染后续版本支持`,
      at: new Date().toISOString(),
    })
  }
  const client = new WxDirectClient({
    appid: filled.appid,
    secret: filled.secret,
    onProgress: emit,
    signal: controller.signal,
  })
  const htmlReady = await client.resolveBodyImages(html, images, imageContext(filled))
  const { draftMediaId, coverMediaId } = await client.createDraft({
    title: filled.title,
    author: filled.author,
    digest: filled.digest,
    contentHtml: htmlReady,
    coverImageUrl: filled.coverImageUrl,
    contentSourceUrl: filled.contentSourceUrl,
    needOpenComment: filled.needOpenComment,
    onlyFansCanComment: filled.onlyFansCanComment,
  })
  return { output: null, draftMediaId, coverMediaId, debugUrl: '' }
}

async function runCoze(
  filled: WxDraftInput,
  controller: AbortController,
  token: string,
): Promise<WxDraftRunResult> {
  const markdown = await rewriteLocalImagesForCoze(filled, controller)
  return runWxDraftStream({
    token,
    workflowId: workflowId(),
    input: { ...filled, markdownContent: markdown },
    signal: controller.signal,
    onProgress: emit,
  })
}

/** 扣子云端读不到本机路径：先 uploadimg，再把微信 URL 写回 Markdown。 */
async function rewriteLocalImagesForCoze(
  filled: WxDraftInput,
  controller: AbortController,
): Promise<string> {
  const source = bodyMarkdown(filled)
  const { html, images } = markdownToWechatHtml(source)
  const locals = images.filter((image) => isLocalImageSrc(image.src))
  if (locals.length === 0) {
    return source
  }
  emit({
    stage: 'node',
    nodeTitle: '上传正文图片',
    delta: '先把本地配图上传到微信再交给工作流',
    at: new Date().toISOString(),
  })
  const client = new WxDirectClient({
    appid: filled.appid,
    secret: filled.secret,
    onProgress: emit,
    signal: controller.signal,
  })
  const urls = await client.mapBodyImageUrls(locals, html, imageContext(filled))
  return rewriteMarkdownImageSrcs(source, urls)
}

async function assertWeixinAuth(appid: string, secret: string): Promise<void> {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`
  let payload: { access_token?: string; errcode?: number; errmsg?: string }
  try {
    const res = await fetch(url)
    payload = (await res.json()) as { access_token?: string; errcode?: number; errmsg?: string }
  } catch (error) {
    throw new WxDraftError('WX_AUTH_NETWORK', `无法连接微信鉴权接口：${(error as Error).message}`)
  }
  if (payload.access_token) {
    return
  }
  if (payload.errcode === 40164) {
    const ip = await fetchEgressIp()
    throw new WxDraftError(
      'WX_AUTH_40164',
      `${explainWeixinAuthError(40164, payload.errmsg ?? '')}\n本机当前出口 IP：${ip ?? '(查询失败，可在浏览器打开 ifconfig.me 查看)'}`,
    )
  }
  throw new WxDraftError(
    `WX_AUTH_${String(payload.errcode ?? 'UNKNOWN')}`,
    explainWeixinAuthError(payload.errcode ?? 0, payload.errmsg ?? ''),
  )
}

