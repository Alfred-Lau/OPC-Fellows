import {
  COZE_STREAM_URL,
  WxDraftError,
  type WxDraftInput,
  type WxDraftProgress,
  type WxDraftRunResult,
  buildWorkflowParameters,
  absorbWorkflowMessage,
  extractFinalOutput,
  parseSseBlock,
  pickString,
  splitSseBlocks,
} from '../shared/wx-draft'

export interface RunWxDraftOptions {
  token: string
  workflowId: string
  input: WxDraftInput
  onProgress: (progress: WxDraftProgress) => void
  /** 外部取消信号（渲染层点「停止」时 abort）。 */
  signal?: AbortSignal
}

/** 整体最长执行时间：四个插件串联且含微信接口调用，给足 5 分钟。 */
const OVERALL_TIMEOUT_MS = 300_000

const now = (): string => new Date().toISOString()

/**
 * 以 SSE 流式方式执行扣子工作流，逐节点回调进度，最终返回草稿/封面 media_id。
 * 本工作流是插件串联、无流式输出节点，因此进度主要体现为节点推进，而非逐字。
 */
export async function runWxDraftStream(options: RunWxDraftOptions): Promise<WxDraftRunResult> {
  const { token, workflowId, input, onProgress, signal } = options
  if (!token) {
    throw new WxDraftError('NO_TOKEN', '未配置扣子访问令牌（PAT），请先在设置里保存')
  }
  if (!workflowId) {
    throw new WxDraftError('NO_WORKFLOW', '缺少工作流 ID')
  }
  if (!input.markdownContent.trim()) {
    throw new WxDraftError('NO_CONTENT', '正文 Markdown 为空')
  }
  if (!input.title.trim()) {
    throw new WxDraftError('NO_TITLE', '标题为空')
  }
  if (!input.appid.trim() || !input.secret.trim()) {
    throw new WxDraftError('NO_WX_CREDENTIALS', '未配置公众号 AppID 或 AppSecret，工作流无法取 token / 建草稿')
  }

  const timeoutSignal = AbortSignal.timeout(OVERALL_TIMEOUT_MS)
  const composedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal

  let response: Response
  try {
    response = await fetch(COZE_STREAM_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: workflowId,
        parameters: buildWorkflowParameters(input),
      }),
      signal: composedSignal,
    })
  } catch (error) {
    if (signal?.aborted || (error as Error).name === 'AbortError') {
      throw new WxDraftError('ABORTED', '执行已取消')
    }
    throw new WxDraftError('NETWORK', `网络请求失败：${(error as Error).message}`)
  }

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '')
    throw new WxDraftError(
      `HTTP_${response.status}`,
      `扣子接口返回 ${response.status}：${text.slice(0, 300)}`,
    )
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let output: Record<string, unknown> | null = null
  let debugUrl = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      buffer += decoder.decode(value, { stream: true })
      const split = splitSseBlocks(buffer)
      buffer = split.rest
      for (const block of split.blocks) {
        const event = parseSseBlock(block)
        if (!event) {
          continue
        }
        switch (event.event) {
          case 'PING':
            onProgress({ stage: 'ping', at: now() })
            break
          case 'Message': {
            const data = (event.data ?? {}) as Record<string, unknown>
            output = absorbWorkflowMessage(output, data)
            const nodeTitle = typeof data.node_title === 'string' ? data.node_title : ''
            const content = typeof data.content === 'string' ? data.content : ''
            if (nodeTitle) {
              onProgress({ stage: 'node', nodeTitle, delta: content, at: now() })
            } else if (content && !extractFinalOutput(data)) {
              onProgress({ stage: 'delta', delta: content, at: now() })
            }
            break
          }
          case 'Error': {
            const data = (event.data ?? {}) as Record<string, unknown>
            const code = String(data.error_code ?? 'STREAM_ERROR')
            const message = String(data.error_message ?? '工作流执行出错')
            throw new WxDraftError(code, message)
          }
          case 'Interrupt':
            throw new WxDraftError('INTERRUPT', '工作流触发了人工确认节点，请检查工作流是否配置了需要中断的节点')
          case 'Done': {
            const data = (event.data ?? {}) as Record<string, unknown>
            if (typeof data.debug_url === 'string') {
              debugUrl = data.debug_url
            }
            onProgress({ stage: 'done', message: '执行完成', at: now() })
            break
          }
          default:
            break
        }
      }
    }
  } catch (error) {
    if (signal?.aborted || (error as WxDraftError).code === 'ABORTED') {
      throw new WxDraftError('ABORTED', '执行已取消')
    }
    throw error
  } finally {
    reader.releaseLock()
  }

  // 容错：处理流末尾未以空行收尾的最后一个事件。
  const tail = parseSseBlock(buffer)
  if (tail?.event === 'Message') {
    output = absorbWorkflowMessage(output, tail.data)
  }

  return {
    output,
    draftMediaId: pickString(output, 'draft_media_id'),
    coverMediaId: pickString(output, 'cover_media_id'),
    debugUrl,
  }
}
