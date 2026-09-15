/**
 * 扣子通道的替代实现：主进程直连微信公众平台 API（gettoken / uploadimg / add_material / draft/add）。
 * Phase A 只提供客户端，不接线到 ipc；Phase B 再替换 wx-draft-coze 调用链。
 */
import { nativeImage } from 'electron'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  WX_COVER_WIDE_MIN,
  coverCropList,
  coverNeedsUpscale,
  type CoverCrop,
} from '../shared/wx-draft-cover'
import { resolveBodyImageSrc, type LocalImageResolveContext } from '../shared/wx-draft-images'
import { WxDraftError, explainWeixinAuthError, type WxDraftProgress } from '../shared/wx-draft'
import { fetchEgressIp } from './egress-ip'

export type WxDirectClientOptions = {
  appid: string
  secret: string
  onProgress?: (p: WxDraftProgress) => void
  signal?: AbortSignal
}

export type WxCreateDraftInput = {
  title: string
  author: string
  digest: string
  contentHtml: string
  coverImageUrl: string
  contentSourceUrl: string
  needOpenComment: 0 | 1
  onlyFansCanComment: 0 | 1
}

export type WxCreateDraftResult = {
  draftMediaId: string
  coverMediaId: string
}

export type WxBodyImage = {
  token: string
  src: string
}

const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token'
const UPLOADIMG_URL = 'https://api.weixin.qq.com/cgi-bin/media/uploadimg'
const ADD_MATERIAL_URL = 'https://api.weixin.qq.com/cgi-bin/material/add_material'
const DRAFT_ADD_URL = 'https://api.weixin.qq.com/cgi-bin/draft/add'
const COVER_TIMEOUT_MS = 20_000
const TOKEN_REUSE_MS = 60_000
const UPLOADIMG_MAX_BYTES = 1024 * 1024

type TokenEntry = { token: string; expiresAt: number }

/** 按 appid 缓存 access_token；剩余 >60s 复用（事实基线另写提前 5 分钟，以实现条款为准）。 */
const tokenCache = new Map<string, TokenEntry>()
/** 同一 appid 并发取 token 单飞。 */
const tokenInflight = new Map<string, Promise<string>>()
type CachedCover = { mediaId: string; crops: CoverCrop[] }

/** 会话内同封面 URL 复用永久素材 media_id（不跨进程持久化）。 */
const coverMediaCache = new Map<string, CachedCover>()

type WxPayload = Record<string, unknown>

function nowIso(): string {
  return new Date().toISOString()
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asErrcode(payload: WxPayload): number {
  return typeof payload.errcode === 'number' ? payload.errcode : 0
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new WxDraftError('ABORTED', '执行已取消')
  }
}

async function throwWxError(errcode: number, errmsg: string): Promise<never> {
  if (errcode === 40164) {
    const ip = await fetchEgressIp()
    throw new WxDraftError(
      'WX_AUTH_40164',
      `${explainWeixinAuthError(40164, errmsg)}\n本机当前出口 IP：${ip ?? '(查询失败，可在浏览器打开 ifconfig.me 查看)'}`,
    )
  }
  if (errcode === 40001 || errcode === 40014 || errcode === 42001) {
    throw new WxDraftError('WX_AUTH_40001', explainWeixinAuthError(40001, errmsg))
  }
  throw new WxDraftError(`WX_AUTH_${String(errcode)}`, explainWeixinAuthError(errcode, errmsg))
}

function isTokenInvalid(errcode: number): boolean {
  return errcode === 40001 || errcode === 40014 || errcode === 42001
}

async function parseWxJson(res: Response): Promise<WxPayload> {
  const text = await res.text()
  try {
    const parsed = JSON.parse(text) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as WxPayload
    }
  } catch {
    throw new WxDraftError('WX_NETWORK', `微信接口返回无法解析：${text.slice(0, 200)}`)
  }
  throw new WxDraftError('WX_NETWORK', `微信接口返回无法解析：${text.slice(0, 200)}`)
}

async function fetchAccessToken(appid: string, secret: string, signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal)
  const url =
    `${TOKEN_URL}?grant_type=client_credential` +
    `&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`
  let payload: WxPayload
  try {
    const res = await fetch(url, { signal })
    payload = await parseWxJson(res)
  } catch (error) {
    throwIfAborted(signal)
    if (error instanceof WxDraftError) {
      throw error
    }
    throw new WxDraftError('WX_NETWORK', `无法连接微信鉴权接口：${(error as Error).message}`)
  }
  const token = asString(payload.access_token)
  if (token) {
    const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 7200
    tokenCache.set(appid, { token, expiresAt: Date.now() + expiresIn * 1000 })
    return token
  }
  return throwWxError(asErrcode(payload), asString(payload.errmsg))
}

async function getAccessToken(
  appid: string,
  secret: string,
  signal?: AbortSignal,
  force = false,
): Promise<string> {
  throwIfAborted(signal)
  if (!force) {
    const cached = tokenCache.get(appid)
    if (cached && cached.expiresAt - Date.now() > TOKEN_REUSE_MS) {
      return cached.token
    }
  }
  const inflight = tokenInflight.get(appid)
  if (inflight) {
    return inflight
  }
  const pending = fetchAccessToken(appid, secret, signal).finally(() => {
    tokenInflight.delete(appid)
  })
  tokenInflight.set(appid, pending)
  return pending
}

async function wxSend(
  buildUrl: (token: string) => string,
  init: RequestInit,
  appid: string,
  secret: string,
  signal?: AbortSignal,
  retryToken = true,
  retryBusy = true,
): Promise<WxPayload> {
  throwIfAborted(signal)
  const token = await getAccessToken(appid, secret, signal)
  let payload: WxPayload
  try {
    const res = await fetch(buildUrl(token), { ...init, signal })
    payload = await parseWxJson(res)
  } catch (error) {
    throwIfAborted(signal)
    if (error instanceof WxDraftError) {
      throw error
    }
    if ((error as Error).name === 'AbortError') {
      throw new WxDraftError('ABORTED', '执行已取消')
    }
    throw new WxDraftError('WX_NETWORK', `微信接口请求失败：${(error as Error).message}`)
  }
  const errcode = asErrcode(payload)
  if (errcode === 0) {
    return payload
  }
  if (isTokenInvalid(errcode) && retryToken) {
    tokenCache.delete(appid)
    await getAccessToken(appid, secret, signal, true)
    return wxSend(buildUrl, init, appid, secret, signal, false, retryBusy)
  }
  if (errcode === -1 && retryBusy) {
    return wxSend(buildUrl, init, appid, secret, signal, retryToken, false)
  }
  return throwWxError(errcode, asString(payload.errmsg))
}

function sniffImage(buffer: Uint8Array, src: string): { mime: string; ext: string } {
  const pathPart = src.split('?')[0] ?? src
  const ext = extname(pathPart).toLowerCase()
  if (ext === '.png') {
    return { mime: 'image/png', ext: '.png' }
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    return { mime: 'image/jpeg', ext: '.jpg' }
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { mime: 'image/png', ext: '.png' }
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return { mime: 'image/jpeg', ext: '.jpg' }
  }
  throw new WxDraftError('IMAGE_FETCH_FAIL', '仅支持 jpg/png 图片（uploadimg 限制）')
}

/** Node 26 的 Uint8Array 默认带 ArrayBufferLike，不能直接当 BlobPart，拷一份纯 ArrayBuffer。 */
function toBlobPart(buffer: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(buffer.byteLength)
  new Uint8Array(copy).set(buffer)
  return copy
}

function mediaForm(buffer: Uint8Array, mime: string, filename: string): FormData {
  const form = new FormData()
  form.append('media', new Blob([toBlobPart(buffer)], { type: mime }), filename)
  return form
}

function composeSignal(user?: AbortSignal, timeoutMs?: number): AbortSignal | undefined {
  if (timeoutMs && user) {
    return AbortSignal.any([user, AbortSignal.timeout(timeoutMs)])
  }
  if (timeoutMs) {
    return AbortSignal.timeout(timeoutMs)
  }
  return user
}

async function downloadHttp(url: string, signal?: AbortSignal): Promise<Uint8Array> {
  const res = await fetch(url, { signal })
  if (!res.ok) {
    throw new Error(`HTTP ${String(res.status)}`)
  }
  return new Uint8Array(await res.arrayBuffer())
}

function altForToken(html: string, token: string): string {
  const matched = new RegExp(`src="__WXIMG_${token}__" alt="([^"]*)"`).exec(html)
  return matched?.[1] ?? ''
}

function fitNativeCover(buffer: Uint8Array, targetW: number, targetH: number) {
  const img = nativeImage.createFromBuffer(Buffer.from(buffer))
  const size = img.getSize()
  if (size.width < 1 || size.height < 1) {
    throw new WxDraftError('COVER_DOWNLOAD_FAIL', '封面无法解码，请换一张 jpg/png')
  }
  const destRatio = targetW / targetH
  const srcRatio = size.width / size.height
  let x = 0
  let y = 0
  let cropW = size.width
  let cropH = size.height
  if (srcRatio > destRatio) {
    cropW = Math.max(1, Math.round(size.height * destRatio))
    x = Math.round((size.width - cropW) / 2)
  } else if (srcRatio < destRatio) {
    cropH = Math.max(1, Math.round(size.width / destRatio))
    y = Math.round((size.height - cropH) / 2)
  }
  return img.crop({ x, y, width: cropW, height: cropH }).resize({
    width: targetW,
    height: targetH,
    quality: 'best',
  })
}

function prepareCover(buffer: Uint8Array, src: string): { buffer: Uint8Array; mime: string; ext: string; crops: CoverCrop[] } {
  const img = nativeImage.createFromBuffer(Buffer.from(buffer))
  const size = img.getSize()
  if (size.width < 1 || size.height < 1) {
    throw new WxDraftError('COVER_DOWNLOAD_FAIL', '封面无法解码，请换一张 jpg/png')
  }
  if (!coverNeedsUpscale(size.width, size.height)) {
    const sniff = sniffImage(buffer, src)
    return {
      buffer,
      mime: sniff.mime,
      ext: sniff.ext,
      crops: coverCropList(size.width, size.height),
    }
  }
  const jpeg = new Uint8Array(fitNativeCover(buffer, WX_COVER_WIDE_MIN.width, WX_COVER_WIDE_MIN.height).toJPEG(88))
  return {
    buffer: jpeg,
    mime: 'image/jpeg',
    ext: '.jpg',
    crops: coverCropList(WX_COVER_WIDE_MIN.width, WX_COVER_WIDE_MIN.height),
  }
}

export class WxDirectClient {
  constructor(private readonly opts: WxDirectClientOptions) {}

  /** 建草稿全流程:封面→正文图→draft/add。返回 { draftMediaId, coverMediaId } */
  async createDraft(input: WxCreateDraftInput): Promise<WxCreateDraftResult> {
    this.throwIfAborted()
    this.progress('上传封面', '正在下载并上传封面')
    const cover = await this.uploadCover(input.coverImageUrl)
    this.throwIfAborted()
    this.progress('上传正文图片', '正文图片已就绪')
    this.throwIfAborted()
    this.progress('写入草稿箱', '正在写入公众号草稿箱')
    const draftMediaId = await this.addDraft(input, cover.mediaId, cover.crops)
    return { draftMediaId, coverMediaId: cover.mediaId }
  }

  /**
   * 先把本地图解析到磁盘并 uploadimg，再把 html 里的 __WXIMG_<token>__ 回填为微信返回的 mmbiz URL。
   * URL 只来自接口，不用模型编造。
   */
  async resolveBodyImages(
    html: string,
    images: WxBodyImage[],
    ctx: LocalImageResolveContext = {},
  ): Promise<string> {
    const urls = await this.mapBodyImageUrls(images, html, ctx)
    let next = html
    for (const item of images) {
      const url = urls.get(item.src)
      if (url) {
        next = next.split(`__WXIMG_${item.token}__`).join(url)
      }
    }
    return next
  }

  /** 上传正文图，返回「原文 src → 微信 URL」。缺本地文件时立刻失败，不跳过。 */
  async mapBodyImageUrls(
    images: WxBodyImage[],
    html: string,
    ctx: LocalImageResolveContext = {},
  ): Promise<Map<string, string>> {
    this.throwIfAborted()
    const urls = new Map<string, string>()
    for (let i = 0; i < images.length; i++) {
      this.throwIfAborted()
      const item = images[i]
      const index = i + 1
      const alt = altForToken(html, item.token) || item.src
      let resolvedSrc: string
      try {
        resolvedSrc = resolveBodyImageSrc(item.src, ctx).path
      } catch (error) {
        throw new WxDraftError('IMAGE_FETCH_FAIL', `第 ${String(index)} 张图(${alt})：${(error as Error).message}`)
      }
      this.progress('上传正文图片', `正在上传第 ${String(index)} 张图`)
      const url = await this.uploadBodyBuffer(resolvedSrc, index, alt)
      urls.set(item.src, url)
    }
    return urls
  }

  private async uploadBodyBuffer(src: string, index: number, alt: string): Promise<string> {
    const buffer = await this.readImageBuffer(src, index, alt)
    if (buffer.byteLength > UPLOADIMG_MAX_BYTES) {
      throw new WxDraftError(
        'IMAGE_FETCH_FAIL',
        `第 ${String(index)} 张图(${alt})：超过 uploadimg 1MB 限制（${String(buffer.byteLength)} 字节）`,
      )
    }
    let sniff: { mime: string; ext: string }
    try {
      sniff = sniffImage(buffer, src)
    } catch (error) {
      const reason = error instanceof WxDraftError ? error.message : (error as Error).message
      throw new WxDraftError('IMAGE_FETCH_FAIL', `第 ${String(index)} 张图(${alt})：${reason}`)
    }
    const filename = `wximg${String(index)}${sniff.ext}`
    const payload = await wxSend(
      (token) => `${UPLOADIMG_URL}?access_token=${encodeURIComponent(token)}`,
      { method: 'POST', body: mediaForm(buffer, sniff.mime, filename) },
      this.opts.appid,
      this.opts.secret,
      this.opts.signal,
    )
    const url = asString(payload.url)
    if (!url) {
      throw new WxDraftError('IMAGE_FETCH_FAIL', `第 ${String(index)} 张图(${alt})：uploadimg 未返回 url`)
    }
    return url
  }

  private throwIfAborted(): void {
    throwIfAborted(this.opts.signal)
  }

  private progress(nodeTitle: string, delta: string): void {
    this.opts.onProgress?.({
      stage: 'node',
      nodeTitle,
      delta,
      at: nowIso(),
    })
  }

  private async uploadCover(coverImageUrl: string): Promise<CachedCover> {
    const url = coverImageUrl.trim()
    if (!url) {
      throw new WxDraftError('COVER_DOWNLOAD_FAIL', '封面地址为空')
    }
    const cached = coverMediaCache.get(url)
    if (cached) {
      return cached
    }
    let buffer: Uint8Array
    try {
      buffer = await this.readCoverBuffer(url)
    } catch (error) {
      this.throwIfAborted()
      if (error instanceof WxDraftError) {
        throw error
      }
      throw new WxDraftError('COVER_DOWNLOAD_FAIL', `封面读取失败：${(error as Error).message}`)
    }
    let prepared: ReturnType<typeof prepareCover>
    try {
      sniffImage(buffer, url)
      prepared = prepareCover(buffer, url)
    } catch (error) {
      if (error instanceof WxDraftError) {
        throw error
      }
      throw new WxDraftError('COVER_DOWNLOAD_FAIL', `封面不是 jpg/png：${(error as Error).message}`)
    }
    const filename = `cover${prepared.ext}`
    const payload = await wxSend(
      (token) => `${ADD_MATERIAL_URL}?access_token=${encodeURIComponent(token)}&type=image`,
      { method: 'POST', body: mediaForm(prepared.buffer, prepared.mime, filename) },
      this.opts.appid,
      this.opts.secret,
      this.opts.signal,
    )
    const mediaId = asString(payload.media_id)
    if (!mediaId) {
      throw new WxDraftError('WX_AUTH_40007', explainWeixinAuthError(40007, asString(payload.errmsg)))
    }
    const next = { mediaId, crops: prepared.crops }
    coverMediaCache.set(url, next)
    return next
  }

  private async addDraft(input: WxCreateDraftInput, thumbMediaId: string, crops: CoverCrop[]): Promise<string> {
    const article = {
      article_type: 'news',
      title: input.title,
      author: input.author,
      digest: input.digest,
      content: input.contentHtml,
      content_source_url: input.contentSourceUrl,
      thumb_media_id: thumbMediaId,
      need_open_comment: input.needOpenComment,
      only_fans_can_comment: input.onlyFansCanComment,
      cover_info: { crop_percent_list: crops },
    }
    const payload = await wxSend(
      (token) => `${DRAFT_ADD_URL}?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles: [article] }),
      },
      this.opts.appid,
      this.opts.secret,
      this.opts.signal,
    )
    const draftMediaId = asString(payload.media_id)
    if (!draftMediaId) {
      throw new WxDraftError('NO_DRAFT_ID', '微信 draft/add 未返回草稿 media_id')
    }
    return draftMediaId
  }

  private async readCoverBuffer(src: string): Promise<Uint8Array> {
    if (/^https?:\/\//i.test(src)) {
      try {
        return await downloadHttp(src, composeSignal(this.opts.signal, COVER_TIMEOUT_MS))
      } catch (error) {
        throw new WxDraftError('COVER_DOWNLOAD_FAIL', `封面下载失败：${(error as Error).message}`)
      }
    }
    const path = src.startsWith('file://') ? fileURLToPath(src) : src
    try {
      const buf = await readFile(path)
      return new Uint8Array(buf)
    } catch (error) {
      const reason = (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? `找不到本地封面「${path}」`
        : (error as Error).message
      throw new WxDraftError('COVER_DOWNLOAD_FAIL', reason)
    }
  }

  private async readImageBuffer(src: string, index: number, alt: string): Promise<Uint8Array> {
    try {
      if (/^https?:\/\//i.test(src)) {
        return await downloadHttp(src, composeSignal(this.opts.signal))
      }
      const buf = await readFile(src)
      return new Uint8Array(buf)
    } catch (error) {
      this.throwIfAborted()
      if (error instanceof WxDraftError) {
        throw error
      }
      const reason = (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? `找不到本地图片「${src}」`
        : (error as Error).message
      throw new WxDraftError('IMAGE_FETCH_FAIL', `第 ${String(index)} 张图(${alt})：${reason}`)
    }
  }
}
