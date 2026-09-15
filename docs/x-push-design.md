# OPC Agent Team - Solokit × X(Twitter)推送 — 设计方案

> 目标:让工作台能把内容**直接发给用户的 X 账号**(DM 给自己 / 公开推文),
> 优先走浏览器插件通道(免 X API 成本、复用已登录会话),预留 xurl 官方 API 备选。

## 1. 需求定义

| 场景 | 内容来源 | 发送形态 | 触发方式 |
|---|---|---|---|
| S1 社媒弹药一键发 X | `social-copy` 生成的 X 草稿(`SocialDraft`) | **公开推文**(或 threads) | 手动:工作台「发到 X」按钮 |
| S2 待办到点提醒 | `todo.notifyAt` 到点 | **DM 给自己**(手机触达) | 自动:main 进程定时器(复用 `todo-notify`) |
| S3 日报/周报摘要(可选) | monitor 生成的内容 | DM | 自动/手动 |

**默认形态**:所有 X 通道动作 = **DM 给自己的账号**(草稿审阅模式)。社媒弹药 X 草稿
先以 DM 形式发到自己的 X,用户审阅后再决定是否公开发布;待办提醒直接 DM 触达。

## 2. 技术路线(已定稿:双免费通道)

| 通道 | 用途 | 成本 | 能力边界 |
|---|---|---|---|
| **xurl(官方 CLI)** | 社媒弹药 X 草稿 → **公开发推** | 免费层 1500 条/月 | ⚠ 免费层**不支持 DM**,仅公开推文 |
| **mcn-browser-ext 插件** | todo 提醒 / 草稿审阅 → **DM 给自己** | 零(复用 X 登录态) | 发推/DM 全支持,依赖登录态 |

- 发送形态:私密内容(todo 提醒、审阅草稿)= 插件 **DM 给自己**;
  公开内容(社媒弹药)= xurl **公开发推**。
- 社媒弹药流程:生成草稿 → 插件 DM 给自己审阅 → 确认后 xurl 公开发推。
- 不做付费订阅;xurl 免费层发推 + 插件免费 DM。

## 3. 总体架构

```
┌───────────────────────── OPC Agent Team - Solokit (Electron) ─────────────────────────┐
│ renderer                                                                │
│  ├─ X 推送面板(新 view 或并入 accounts)                                   │
│  │    · X 通道状态:插件在线?登录态?最近发送历史                           │
│  │    · 草稿预览 + 发送按钮(社媒弹药卡片上)                               │
│  └─ 设置:DM 推送开关、默认收件人(自己)、xurl 备选开关                     │
│                                                                          │
│ main(新模块 src/main/x-push.ts)                                          │
│  ├─ LocalBridge:起本地 HTTP server(localhost:18753)                      │
│  │    · POST /x/send  { action:'post'|'dm', payload }                    │
│  │    · 转发给插件(见下),回执 { ok, id, url }                            │
│  ├─ XSender 抽象:                                                         │
│  │    · PluginSender(默认):local bridge → 插件                            │
│  │    · XurlSender(备选):spawn `xurl post/dm`                            │
│  └─ 复用 todo-notify 定时器:到点 → 桌面通知 + (可选)X DM                  │
│                                                                          │
│ shared(新 src/shared/x-push.ts)                                          │
│  · XSendRequest/XSendResult 类型、配置、SocialDraft → 推文负载转换        │
│  · 发送历史(localStorage 或 json 文件)                                    │
└───────────────────────────────────────────────────────────────────────────┘
                                   │ POST http://127.0.0.1:18753/x/send
                                   ▼
┌───────────────── 浏览器插件(新:ownworkbuddy-x-bridge) ───────────────────┐
│ manifest(MV3)                                                           │
│  · host_permissions: https://x.com/* , http://127.0.0.1/*               │
│  · background: service worker —— 桥接端                                  │
│  · content_scripts: x.com 页面注入(MAIN world,复用 mcn-browser-ext 先例) │
│                                                                          │
│ 发推流程:                                                                 │
│  background 收到本地请求 → 查 x.com tab → 向 content script 发消息         │
│  → content script 调 X 网页端 GraphQL CreateTweet(带页面 cookies/CSRF)    │
│  → 回传 { tweet_id, url } → background 回执本地 server                    │
│ DM 流程:同理,GraphQL CreateDM(给自己)                                    │
│ 降级模式:未登录/接口变动 → 打开 x.com 预填文本,用户手点发布               │
└───────────────────────────────────────────────────────────────────────────┘
```

## 4. 关键设计点

### 4.1 桥接协议(本地 server ↔ 插件)
```
POST http://127.0.0.1:18753/x/send
{ action: 'post'|'dm', text, media?: [base64] , inReplyTo?: string }
→ { ok: true, id: '1900...', url: 'https://x.com/...' }
   | { ok: false, error: 'not_logged_in'|'bridge_offline'|..., hint }
```
- 插件 background 用 `fetch` 主动向本地 server 注册(`POST /x/register {plugin:'ownworkbuddy-x-bridge'}`),Electron 据此显示「插件在线」。
- 端口固定 18753(避免与其他本地服务冲突);仅监听 127.0.0.1。

### 4.2 插件发送实现(两条子路径)
1. **GraphQL(主)**:content script 在 x.com 页内 `fetch('/i/api/graphql/...', {method:'POST'})`,构造 CreateTweet / CreateDM 请求体(参考现有网页请求,cookies 自动携带)。
2. **DOM 降级(备)**:直接操作 composer(填文本 → 点发布),慢但接口变了也能用。
- 模块结构对齐 mcn-browser-ext:`src/platforms/x/{api.ts, dom.ts}`。

### 4.3 与既有模块的接入点
| 模块 | 改动 |
|---|---|
| `src/shared/features.ts` | 新增 view `x-push`(或并入 `accounts`),注册 mark「X」 |
| `src/shared/social-copy.ts` | X 草稿增加 `sendStatus: 'draft'|'sent'|'failed'` |
| `src/renderer/src/monitor.ts` | 社媒弹药卡片加「发到 X」按钮(仅 X 平台显示) |
| `src/renderer/src/accounts.ts` | X 账号卡片显示桥接状态 + 发送历史 |
| `src/main/todo-notify.ts` | 到点回调追加 `xPush.dm(text)`(开关控制) |
| `src/shared/accounts.ts` | 配置项:`xBridge.enabled / xDmEnabled / xDmReceiver` |

### 4.4 安全与隐私
- 本地桥只收 127.0.0.1,带一次性 token(启动时生成,插件注册时校验)。
- 插件只在收到本地请求时动作,绝不监听/转发用户 X 数据。
- 发送历史仅存本机,支持清空。

## 5. 落地步骤(分阶段)

- **P0 桥接骨架**(0.5 天):Electron main 本地 server + 插件 background 注册握手 + 工作台「X 通道」状态面板(bridge 在线/离线)。
- **P1 发推**(1 天):插件 GraphQL CreateTweet + monitor 草稿「发到 X」按钮 + 发送历史。
- **P2 DM 推送**(0.5 天):插件 DM 给自己 + todo 到点双通道通知 + 设置开关。
- **P3 增强**(可选):图片/threads、失败重试、xurl 备选实现、日报 DM。

## 6. 决策记录(用户已拍板)

1. **DM 收件人**:用户自己的 X 账号 ✓
2. **插件形态**:合入 mcn-browser-ext(不新建独立插件)✓
3. **社媒弹药发送**:先 DM 草稿给自己审阅,不自动公开发布 ✓
4. **xurl 备选**:不要,纯插件零付费 ✓
