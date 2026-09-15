import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import type { IpcRegistrar } from '../kernel/main/ipc'
import { buildXPostText } from '../shared/x-push'
import { getSocialDraft } from './social-store'

/**
 * X 桥接本地服务(127.0.0.1:18753):
 * mcn-browser-ext 插件每隔 30s 轮询 /x/poll 取任务,执行 DM 后回传 /x/result。
 * 任务来源:社媒弹药草稿「DM 草稿给我」按钮、todo 提醒(后续)。
 */

const BRIDGE_PORT = 18753;
const BRIDGE_HOST = '127.0.0.1';
const IN_FLIGHT_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 5;

interface BridgeTask {
  taskId: string;
  action: 'dm' | 'post' | 'search';
  text: string;
  receiver?: string;
  query?: string;
  limit?: number;
  createdAt: number;
  inFlightAt: number | null;
  attempts: number;
}

interface BridgeResult {
  taskId: string;
  ok: boolean;
  error?: string;
  at: string;
  data?: unknown;
}

interface XSearchResult {
  ok: boolean;
  error?: string;
  data?: unknown;
  at: string;
}

const queue: BridgeTask[] = [];
const searchResults = new Map<string, XSearchResult>();
let lastResult: BridgeResult | null = null;
let token = randomBytes(16).toString('hex');
let server: ReturnType<typeof createServer> | null = null;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += String(chunk);
      if (raw.length > 256 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function nextTask(): BridgeTask | null {
  const now = Date.now();
  for (const task of queue) {
    if (task.inFlightAt == null) {
      task.inFlightAt = now;
      task.attempts += 1;
      return task;
    }
    if (now - task.inFlightAt > IN_FLIGHT_TIMEOUT_MS) {
      // 插件超时未回传 → 允许重新领取
      task.inFlightAt = now;
      task.attempts += 1;
      return task;
    }
  }
  return null;
}

function handler(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url || '/', `http://${BRIDGE_HOST}`);
  const requestToken = url.searchParams.get('token') || '';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
    res.end();
    return;
  }

  if (url.pathname === '/x/hello') {
    sendJson(res, 200, { token, app: 'ownworkbuddy', port: BRIDGE_PORT });
    return;
  }

  if (requestToken !== token) {
    sendJson(res, 403, { error: 'bad token' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/x/poll') {
    const task = nextTask();
    if (!task) {
      sendJson(res, 200, { task: null });
      return;
    }
    sendJson(
      res,
      200,
      task.action === 'search'
        ? { task: { taskId: task.taskId, action: task.action, text: task.text, receiver: task.receiver, query: task.query, limit: task.limit } }
        : { task: { taskId: task.taskId, action: task.action, text: task.text, receiver: task.receiver } },
    );
    return;
  }

  if (req.method === 'POST' && url.pathname === '/x/result') {
    void readBody(req).then((body) => {
      const taskId = String(body.taskId || '');
      const ok = body.ok === true;
      const requeue = body.requeue === true;
      const error = body.error ? String(body.error) : undefined;
      const idx = queue.findIndex((task) => task.taskId === taskId);
      const current = idx >= 0 ? queue[idx] : null;
      if (idx >= 0) {
        if (ok || !requeue || queue[idx].attempts >= MAX_ATTEMPTS) {
          queue.splice(idx, 1);
        } else {
          queue[idx].inFlightAt = null;
        }
      }
      const data = Object.prototype.hasOwnProperty.call(body, 'data') ? body.data : undefined;
      lastResult = data !== undefined ? { taskId, ok, error, at: new Date().toISOString(), data } : { taskId, ok, error, at: new Date().toISOString() };
      if (current?.action === 'search' || data !== undefined) {
        searchResults.set(taskId, { ok, error, data, at: lastResult.at });
      }
      sendJson(res, 200, { ok: true });
    });
    return;
  }

  sendJson(res, 404, { error: 'not found' });
}

export function startXBridge(): void {
  if (server) return;
  server = createServer(handler);
  server.listen(BRIDGE_PORT, BRIDGE_HOST);
  server.on('error', () => {
    // 端口占用等:桥不可用,DM 按钮会提示
    server = null;
  });
}

export function stopXBridge(): void {
  server?.close();
  server = null;
}

export function enqueueXTask(task: { action: 'dm' | 'post'; text: string; receiver?: string }): { queued: boolean; queueLength: number } {
  const item: BridgeTask = {
    taskId: `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`,
    action: task.action,
    text: task.text,
    receiver: task.receiver,
    createdAt: Date.now(),
    inFlightAt: null,
    attempts: 0,
  };
  queue.push(item);
  return { queued: Boolean(server), queueLength: queue.length };
}

export function enqueueXSearch(query: string, limit = 20): { taskId: string; queued: boolean; queueLength: number } {
  const n = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 20) : 20;
  const item: BridgeTask = {
    taskId: `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`,
    action: 'search',
    text: query,
    query,
    limit: n,
    createdAt: Date.now(),
    inFlightAt: null,
    attempts: 0,
  };
  queue.push(item);
  return { taskId: item.taskId, queued: Boolean(server), queueLength: queue.length };
}

export function takeXSearchResult(taskId: string): XSearchResult | null {
  const result = searchResults.get(taskId);
  if (!result) {
    return null;
  }
  searchResults.delete(taskId);
  return result;
}

export function xSearchQueueLength(): number {
  return queue.filter((task) => task.action === 'search').length;
}

/** 从队列移除并清 pending 搜索结果；不影响 DM/发帖任务。 */
export function cancelXTask(taskId: string): boolean {
  const id = String(taskId || '');
  if (!id) {
    return false;
  }
  const idx = queue.findIndex((task) => task.taskId === id);
  if (idx >= 0) {
    queue.splice(idx, 1);
  }
  searchResults.delete(id);
  return idx >= 0;
}

export function xBridgeStatus(): { running: boolean; queueLength: number; lastResult: BridgeResult | null } {
  return {
    running: Boolean(server),
    queueLength: queue.length,
    lastResult,
  };
}

/** 社媒弹药 X 草稿 → DM 给自己审阅(草稿模式) */
export function enqueueDraftDm(draftId: string): { ok: boolean; error?: string; queueLength?: number } {
  const draft = getSocialDraft(draftId);
  if (!draft) return { ok: false, error: '草稿不存在' };
  if (draft.platform !== 'x') return { ok: false, error: '仅支持 X 平台草稿' };
  if (draft.publishedAt) return { ok: false, error: '该草稿已发布' };
  const text = buildXPostText(draft);
  const result = enqueueXTask({ action: 'dm', text, receiver: undefined });
  if (!result.queued) return { ok: false, error: '本地桥未启动(端口 18753 不可用)' };
  return { ok: true, queueLength: result.queueLength };
}

export function registerXBridgeIpc(handle: IpcRegistrar): void {
  startXBridge();
  handle('xbridge:dm-draft', (_event, draftId: string) => enqueueDraftDm(String(draftId)));
  handle('xbridge:status', () => xBridgeStatus());
}
