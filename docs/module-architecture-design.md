# OPC Agent Team - Solokit 模块化架构 — 功能拆解与系统设计

> 目标：把现在「功能硬编码往上挂」的工作台，改造成**内核 + 可插拔模块**的架构。
> 每个模块都能独立 enable / disable，用户在设置里按自己的工作情况配置；
> 另有一个模块仓库可以浏览、安装、更新第三方模块。
> 底层复用 **dsh（DeepSeek Harness）的技术框架** —— 即 Cordis 插件体系与 dsh 的 manifest / profile / patch 约定。

本文只做功能拆解与系统设计，不含实现代码。

已定的三条前提（§18）：**待办上收为内核服务**、**首版做完整形态**（含第三方模块仓库与隔离）、**开源另起新仓库、本轮不做**。

外壳心智的下一层（模块 = 新建 Agent 时的职业模板，工作台改为左栏身份 / 中栏会话 / 右栏工作区）见 [agent-workspace-design.md](./agent-workspace-design.md)。**组合根已改判**：Agent 运行时进 dsh 的 Context，Electron 只留薄壳，见 [adr/0005-dsh-as-composition-host.md](./adr/0005-dsh-as-composition-host.md)。本文仍描述模块契约与仓库隔离；§2.1 的「选 C」已被 0005 取代。

---

## 1. 现状与问题

当前 7 个功能模块（待办、随手记、项目监控、Micro 选品、自媒体账号、收款管理、Harness）都是直接焊在骨架上的。新增一个功能要改 5 个地方，删一个功能几乎不可能。

具体的耦合点：

| 耦合点 | 位置 | 症状 |
|---|---|---|
| 闭合的视图联合类型 | `src/shared/features.ts` 的 `WorkbenchView` | 视图 id 是写死的字符串联合，main 的托盘 / 菜单、preload、renderer 的 `showView`、search 的 `SearchTarget` 全都依赖它。模块动态增减时这个类型无法成立 |
| 静态视图骨架 | `src/renderer/index.html` 850 行 | 每个模块一个写死的 `<section id="view-xxx">`，模块禁用后 DOM 仍在 |
| 静态样式与入口 | `src/renderer/src/app.ts` 顶部 8 行 CSS import（6 个属于模块） | 所有模块的 CSS 与激活函数（`activateTodos` / `activateMonitor` / …）静态引入，禁用不会减少体积 |
| 硬编码启动序列 | `src/main/index.ts` | `loadTodos()` / `registerTodoIpc()` / `schedulePaymentHeartbeat()` / `setMicroNotifyClickHandler()` 逐个手写；托盘菜单和应用菜单各抄一份模块清单 |
| 巨型静态桥 | `src/preload/index.ts` 250 行 | `contextBridge` 一次性暴露 `todos` / `notes` / `monitor` / `micro` / `accounts` / `payments` / `xPush` / `xBridge` / `pet` 全部命名空间，禁用模块也照样暴露 |
| 硬编码搜索索引 | `src/shared/search.ts` 的 `buildSearchIndex` | 函数内部 `if (feature.id === 'accounts')` 逐个分支拼关键词，模块的搜索贡献无法自带 |
| 跨模块直连 | `monitor` 直接写待办、`payments` 直接发通知 + 写待办、`micro` 写待办、`x-push` 读 social 草稿 | 依赖关系存在但不显式，禁用被依赖方会静默出错 |

已经存在的**唯一一个好范式**是 Agent 收件箱（`todos.ingestAgent` + `dedupeKey` 去重）：任意模块通过一个稳定接口写待办，不直接碰 todo store。这个模式正是本设计要推广到所有跨模块交互的形态。

---

## 2. 为什么底层用 dsh 的技术框架

dsh 的核心不是"一个 Agent CLI"，而是它下面那套 **"Everything is a Plugin"** 的组合框架 —— [Cordis](https://github.com/cordiverse/cordis)。dsh 自己的模型适配器、工具注册表、会话日志、甚至 Agent 主循环，全都是挂在同一棵插件树上的可替换插件。这套能力和我们要做的事情几乎逐条对应：

| 我们要的能力 | Cordis / dsh 现成提供 |
|---|---|
| 模块可随时 enable / disable | `Fiber` 生命周期状态机：`PENDING → LOADING → ACTIVE / FAILED`、`ACTIVE → UNLOADING → DISPOSED`，`fiber.dispose()` 保证注册全部回滚 |
| 禁用后不留残留（定时器、监听、IPC、导航项） | **反向副作用**：`ctx.on()` / `ctx.effect()` / 服务注册全部记账，卸载时逆序回收。不需要每个模块自己写 `clearInterval` |
| 模块间依赖（monitor 依赖 todos） | `inject` 依赖驱动加载：依赖服务未就绪则停在 `PENDING`；依赖消失则自动卸载，依赖回来自动重载 |
| 用配置文件描述"装了哪些模块、哪些开着" | `@deepseek-ai/cordis-plugin-loader` 的 entry tree：每个 entry 有 `id` / `name` / `config` / `group` / **`disabled`** / `inject`，且 `entry.update()` 会自动重启并回写配置文件 |
| 模块自带配置表单 | 插件的 `Config` 标准 schema（dsh 用 `@deepseek-ai/schemastery`），设置页可由 schema 直接渲染表单 |
| 模块分发与安装 | dsh 的 manifest 约定（package.json 的 `dsh` 字段）+ `dsh plugin --profile web add <spec>`（本质是 pnpm 转发）+ 社区插件面板 / 插件注册表 |
| 开发期热更新 | `@deepseek-ai/cordis-plugin-hmr` |

**依赖体积可接受**：`@deepseek-ai/cordis@4.0.2` 的运行时依赖只有 `@standard-schema/spec` 和 `@deepseek-ai/cosmokit`，loader 也只多一个可选的 `node-addon-require-builtin`。挂进 Electron 主进程没有负担。

### 2.1 关键抉择：内核挂在哪里

有三种走法：

| 方案 | 做法 | 问题 |
|---|---|---|
| A. 主进程直接挂 Cordis | Electron 主进程 `new Context()`，模块是 Cordis 插件 | 需要自己实现工作台侧的服务层 |
| B. 把 dsh 进程当内核 | 模块写成 dsh bundle，跑在 `dsh web` 里 | 模块拿不到 Electron API（`BrowserWindow` / `Notification` / `safeStorage` / 托盘），工作台 UI 无法贡献 |
| C. 混合 | 主进程挂 Cordis 内核；dsh 作为可选 sidecar 保留为 Agent 运行时；模块可同时贡献工作台 UI 和 dsh 工具 | 两套运行时需要定义清楚边界 |

**已改判为 D（见 [ADR 0005](./adr/0005-dsh-as-composition-host.md)）：dsh profile 当组合根，Electron 当薄壳。** 旧建议「选 C，以 A 为承重」让我们抄了一份 `ctx.llm` / `ctx.agents`，再把真正的 Agent 循环降级成 sidecar iframe。B 的否决仍然成立——职业 Panel 和台伴不能寄生在 `dsh web` 浏览器页里——但 Electron API 的需求只证明需要 desktop host，不证明需要第二棵 Cordis 树。

---

## 3. 总体架构

```
┌──────────────────────── Electron 主进程 ────────────────────────┐
│                                                                  │
│  ┌──────────────── Cordis 内核 (Context) ────────────────────┐   │
│  │                                                            │   │
│  │  内核服务层（不可禁用，模块通过 inject 使用）                  │   │
│  │   ctx.modules   模块注册表 / 启停 / 状态                     │   │
│  │   ctx.workbench 视图 · 导航 · 托盘 · 菜单 · 快捷键 贡献点     │   │
│  │   ctx.bridge    IPC 通道注册表 + 权限校验                    │   │
│  │   ctx.storage   按模块隔离的 JSON / 文件存储                  │   │
│  │   ctx.secrets   safeStorage 加密凭据                        │   │
│  │   ctx.llm       DeepSeek 调用（复用 credentials.ts 的解析）   │   │
│  │   ctx.scheduler 心跳 / 定时任务                             │   │
│  │   ctx.notify    桌面通知 + 点击路由                          │   │
│  │   ctx.search    搜索索引贡献                                │   │
│  │   ctx.todos     待办 · 标签 · 提醒 · ingest 收件箱 seam       │   │
│  │   ctx.settings  设置卡片贡献                                │   │
│  │   ctx.repository 模块仓库：检索 / 安装 / 更新 / 卸载          │   │
│  │                                                            │   │
│  │  ┌────────── Loader entry tree (workbench.yml) ─────────┐  │   │
│  │  │  - id: notes      name: cordis:module-notes          │  │   │
│  │  │  - id: monitor    name: cordis:module-monitor        │  │   │
│  │  │  - id: payments   name: cordis:module-payments       │  │   │
│  │  │    disabled: true          ← 用户关掉的模块            │  │   │
│  │  │  - id: my-crm     name: ./modules/my-crm/lib/index.js│  │   │
│  │  └──────────────────────────────────────────────────────┘  │   │
│  │                                                            │   │
│  │  内置模块（打包在 asar 内，in-process）                       │   │
│  │  notes · pet · monitor · social-ammo · micro ·             │   │
│  │  accounts · payments · x-push · pet · harness              │   │
│  │                                                            │   │
│  └────────────────────────────────────────────────────────────┘   │
│            │                          │                            │
│            │ capability RPC           │ ipcMain（统一通道）          │
│            ▼                          │                            │
│  ┌──────────────────────┐             │                            │
│  │ utilityProcess       │             │                            │
│  │ 第三方模块沙箱         │             │                            │
│  │ (userData/modules/)  │             │                            │
│  └──────────────────────┘             │                            │
└───────────────────────────────────────┼────────────────────────────┘
                                        │
┌───────────────── preload（统一泛化桥）─┼────────────────────────────┐
│  workbench.invoke(moduleId, action, payload)                       │
│  workbench.subscribe(moduleId, event, cb)                          │
│  内核按模块注册表校验：模块未启用 / 未声明该 action → 直接拒绝         │
└────────────────────────────────────────────────────────────────────┘
                                        │
┌──────────────────────── 渲染进程 ──────┼────────────────────────────┐
│  工作台外壳（rail 导航 / 搜索 / 主题 / 设置）  ← 内核，永远在          │
│  模块视图运行时：按启用清单动态挂载 <section>、动态加载 CSS            │
│   · 内置模块：打包内静态注册表按需 import()                          │
│   · 第三方模块：sandboxed <iframe> + postMessage RPC                │
└────────────────────────────────────────────────────────────────────┘
```

---

## 4. 模块契约（Module Contract）

一个 OPC Agent Team - Solokit 模块 = **一个 Cordis 插件 + 一份 manifest**，可选带一个渲染侧入口。

### 4.1 Manifest

对齐 dsh「唯一 manifest 是 package.json 的自定义字段」的做法。第三方模块写在 package.json 的 `ownworkbuddy` 字段，内置模块写成同构的 `manifest.ts`：

```jsonc
{
  "name": "@owb/module-payments",
  "version": "1.2.0",
  "ownworkbuddy": {
    "id": "payments",                    // 全局唯一，作为存储目录与 IPC 命名空间
    "title": "收款管理",
    "mark": "收",                         // rail 导航上的单字印
    "description": "Creem + 国内手工入账的财务台账",
    "kind": "view",                      // view | window | background
    "main": "./lib/main.js",             // 主进程插件入口（apply(ctx, config)）
    "client": "./lib/client.js",         // 渲染进程入口（可选）
    "style": "./lib/client.css",         // 模块样式（可选）
    "inject": ["todos", "notify"],       // 硬依赖：不满足则停在 PENDING
    "optional": ["x-push"],              // 软依赖：有就增强，没有也能跑
    "provides": ["payments"],            // 对外提供的服务名
    "capabilities": ["net:creem.io", "secrets", "notify", "todos:write", "fs:export"],
    "config": "./lib/config-schema.js",  // 标准 schema，设置页据此渲染表单
    "removable": true,                   // 内核模块为 false
    "engines": { "ownworkbuddy": ">=0.3.0" }
  }
}
```

### 4.2 主进程侧插件

标准 Cordis 插件三形态（函数 / 对象 / class）任选，与 dsh 插件写法完全一致：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const inject = ['storage', 'bridge', 'workbench', 'notify', 'todos']

export function apply(ctx: Context, config: PaymentsConfig) {
  const store = ctx.storage.open('payments')           // userData/module-data/payments/

  ctx.bridge.handle('state', () => store.state())      // → 前端 invoke('payments','state')
  ctx.bridge.handle('sync', () => syncPayments(ctx))

  ctx.workbench.view({ mark: '收', title: '收款管理', order: 60 })
  ctx.workbench.command({ id: 'open', accelerator: 'CommandOrControl+5' })

  ctx.scheduler.every(config.heartbeatMinutes, async () => {
    const events = await syncPayments(ctx)
    for (const e of events) {
      ctx.notify.push({ title: e.title, onClick: () => ctx.workbench.open('payments') })
      ctx.todos.ingest({ agentId: 'payments', items: [...] })   // 经收件箱 seam，不直接碰 store
    }
  })

  ctx.search.contribute(() => store.searchDocs())
}
```

**关键点：整个 `apply` 里没有一行清理代码。** `bridge.handle` / `workbench.view` / `scheduler.every` / `search.contribute` 全部实现为 `ctx.effect()`，模块被禁用时 Cordis 逆序回收：IPC 通道注销、导航项消失、定时器停掉、搜索文档从索引移除。这正是选 Cordis 的核心收益。

### 4.3 渲染进程侧入口

```ts
export function mount(host: ModuleHost) {
  // host.root  —— 内核分配的 <section>，模块只能操作它内部
  // host.api   —— 绑定到本模块命名空间的 invoke / subscribe
  // host.theme —— 当前明暗主题 + 变化订阅
  host.root.append(renderPaymentsView(host.api))
  return () => { /* 可选的卸载钩子 */ }
}
```

### 4.4 生命周期

```
未安装 ──install──> 已安装(禁用) ──enable──> PENDING ──依赖就绪──> LOADING ──> ACTIVE
                         ▲                    │                        │
                         └──── disable ───────┴──────────────┬─────────┘
                                                             │ apply 抛错
                                                             ▼
                                                          FAILED（设置页显示错误 + 重试）
已安装(禁用) ──uninstall──> 未安装（数据默认保留，二次确认可一并清除）
```

补一个 dsh 没有、但我们需要的状态：**`NEEDS_CONFIG`** —— 模块启用了但必填配置缺失（比如 payments 没填 Creem key、monitor 没配 `OWNWORKBUDDY_STATS_KEY`）。此时模块以「降级模式」加载（只做本地台账、不发请求），设置页与导航项上打一个提示角标。这比直接 FAILED 更贴合现状：现在的代码本来就是"没 key 就静默跳过"。

---

## 5. 内核服务层详解

内核 = 不可禁用的那部分。判断标准：**移除它之后工作台无法作为工作台存在**。

| 服务 | `ctx` 键 | 职责 | 从现有代码提取自 |
|---|---|---|---|
| 模块注册表 | `ctx.modules` | 列举 / 启停 / 状态 / 依赖图 / 错误日志 | 新建 |
| 工作台外壳 | `ctx.workbench` | 视图槽位、rail 导航、托盘菜单、应用菜单、快捷键、窗口路由 | `workbench-window.ts` + `index.ts` 的菜单/托盘 + `features.ts` |
| IPC 桥 | `ctx.bridge` | 通道注册表、按模块命名空间派发、启用态与权限校验 | 全部 `*-ipc.ts` |
| 存储 | `ctx.storage` | 按模块隔离的 JSON 读写、原子落盘、schema 版本迁移 | 8 个 `*-store.ts` 里重复的 `readFileSync`/`writeFileSync` 模式 |
| 凭据 | `ctx.secrets` | `safeStorage` 加密存取、环境变量覆盖 | `credentials.ts` + `payment-store.ts` 的 key 加密 |
| 模型 | `ctx.llm` | DeepSeek 调用、key 解析（env → 设置页 `safeStorage` → `~/.dsh` 遗留）、失败回退 | `credentials.ts` + `decompose.ts` / `micro-sourcing-llm.ts` / `social-copy-llm.ts` 里三份重复的调用逻辑 |
| 调度 | `ctx.scheduler` | 心跳、定时任务、休眠唤醒补偿 | `payment-sync.ts` / `micro-sourcing-sync.ts` / `todo-notify.ts` 里三套各写各的 `setTimeout` |
| 通知 | `ctx.notify` | 桌面通知、点击路由到模块视图 | `todo-notify.ts` + 各模块的 `setXxxNotifyClickHandler` |
| 搜索 | `ctx.search` | 索引贡献注册、聚合查询 | `shared/search.ts` 的 `buildSearchIndex` 拆掉硬编码分支 |
| **待办** | `ctx.todos` | 待办数据、到点提醒调度、LLM 拆解、`ingest()` 收件箱 seam、sink/source 扩展点 | `shared/todo.ts`、`shared/agent-inbox.ts`、`main/agent-inbox.ts`、`main/todo-{store,ipc,notify,broadcast}.ts`、`decompose.ts`、`time.ts` |
| 设置 | `ctx.settings` | 设置卡片贡献、schema 表单渲染 | 新建 |
| 仓库 | `ctx.repository` | 源管理、检索、安装、更新、校验 | 新建 |
| 主题 | `ctx.theme` | 明暗主题、系统跟随 | `main/theme.ts` + `renderer/theme.ts` |
| 标签 | `ctx.tags` | 标签解析（`#OPC项目`）、合并、归一 | `shared/tags.ts`、`renderer/tags-ui.ts` |

`ctx.tags` 独立于 `ctx.todos`：标签是工作台的横切词汇，现在被 12 个文件引用（`monitor-ipc.ts`、`social-todos.ts`、`monitor-todos.ts`、`renderer/monitor.ts`、`app.ts` 等），不只是待办在用。`ctx.todos` 依赖它，模块也能直接用它解析标签。

### 5.1 待办为什么上收内核（已定）

`todos` 不做成模块，整体上收为内核服务，**视图也是内核自带的固定视图，不可禁用**。理由：

- 它是工作台的语义中心。首页「今日态势」、`#OPC项目` 标签语法、全局搜索、桌面通知、台伴提醒全都以它为轴；`monitor` / `micro` / `payments` / `social-ammo` 四个模块的产出最终都落成待办。
- 做成可禁用模块的话，这四个模块要么硬依赖一个会消失的服务（禁用待办就级联停掉半个工作台），要么各自准备降级路径 —— 两种都比"它就是内核"更复杂，收益却接近于零：不用待办的人不会用这个工作台。
- 上收之后依赖图显著变简单：模块依赖的是**永远在**的内核服务，不再有「等待 待办拆解 模块」这种 PENDING 态。

被替换的可能性通过**扩展点**保留，而不是通过"整个模块可拔"：

```ts
ctx.todos.source(feishuSource)   // 外部任务系统 → 工作台（拉取 / 双向同步）
ctx.todos.sink(feishuSink)       // 工作台 → 外部任务系统（写回 / 镜像）
ctx.todos.view(alternativeView)  // 贡献一个替代/并列的待办视图
```

想接飞书任务、滴答清单、Things 的人写一个**同步模块**挂在这些扩展点上，而不是把内核的待办整个换掉。这比"待办可禁用"更实用，也更容易保证数据一致。

---

## 6. 现有功能拆解

### 6.1 模块清单

内核固定部分（不可禁用）：工作台外壳、**待办**、搜索、主题、设置、模块管理与仓库。

可插拔模块 9 个 —— 硬依赖一律指向内核服务（`todos` / `llm` / `secrets` 等），因此不存在「被依赖方被禁用」的级联问题；模块之间只有软依赖：

| 模块 id | 标题 | 类型 | 硬依赖（内核） | 软依赖（模块） | 存储 |
|---|---|---|---|---|---|
| `notes` | 随手记 | view | — | — | `notes.json` |
| `pet` | 台伴（桌面小鹿） | window | `todos` | — | — |
| `monitor` | 项目监控 | view | `todos` | `llm` | `monitor-cache.json` |
| `social-ammo` | 社媒弹药 | view | `todos` `llm` | `monitor` `accounts` | `social.json` |
| `micro` | Micro 选品 | view | `todos` `llm` | — | `micro-sourcing.json` |
| `accounts` | 自媒体账号 | view | — | `social-ammo` | `accounts.json` |
| `payments` | 收款管理 | view | `todos` `secrets` | — | `payments.json` |
| `x-push` | X 推送通道 | background | `todos` | `social-ammo` `accounts` | — |
| `harness` | DeepSeek Harness | background | — | — | `~/.dsh`（SDK 进程） |

### 6.2 逐模块的文件归属

改造后每个模块自成一个目录，`main` / `client` / `shared` 三段收在一起，不再散落在三个顶层目录：

```
src/modules/payments/
  manifest.ts          ← 模块元数据
  main.ts              ← apply(ctx, config)
  client.ts            ← mount(host)
  client.css
  shared/payments.ts   ← 纯逻辑 + 类型（现有单测直接平移）
  shared/payments.test.ts
```

| 模块 | 现有文件 |
|---|---|
| **内核 · 待办** | `shared/todo.ts`、`shared/agent-inbox.ts`、`main/agent-inbox.ts`、`main/todo-store.ts`、`todo-ipc.ts`、`todo-notify.ts`、`todo-broadcast.ts`、`decompose.ts`、`time.ts`、`renderer/todos.ts`、`todos.css` |
| **内核 · 外壳** | `renderer/index.html` 的 `view-home`（今日态势 / 收件框 / 提醒列表 / 最近模块）、`app.ts`、`app.css`、`search.ts`、`theme.ts`、`theme.css`、`shared/{features,search,datetime,theme}.ts`、`main/{workbench-window,app-icon,theme,cli-path}.ts`、`preload/index.{ts,d.ts}` |
| **内核 · 标签** | `shared/tags.ts`、`renderer/tags-ui.ts` |
| `notes` | `shared/note.ts`、`main/note-store.ts`、`note-ipc.ts`、`renderer/notes.ts`、`notes.css` |
| `pet` | `shared/pet.ts`、`main/pet-window.ts`、`renderer/pet.ts`、`pet.css`、`pet.html` |
| `monitor` | `shared/monitor.ts`、`monitor-todos.ts`、`products.ts`、`project-users.ts`、`traffic-insights.ts`、`web-analytics.ts`、`main/monitor-ipc.ts`(611 行，需拆)、`monitor-cache.ts`、`renderer/monitor.ts`(1056 行)、`monitor.css` |
| `social-ammo` | `shared/social.ts`、`social-copy.ts`、`social-todos.ts`、`main/social-store.ts`、`social-copy-llm.ts`、**`renderer/social.ts`(355 行，现被 `monitor.ts` import)** |
| `micro` | `shared/micro-sourcing.ts`(1035 行)、`micro-sourcing-todos.ts`、`main/micro-sourcing-{store,sync,fetch,llm,ipc}.ts`、`renderer/micro-sourcing.ts`、`.css` |
| `accounts` | `shared/accounts.ts`、`main/account-store.ts`、`account-ipc.ts`、`renderer/accounts.ts`、`accounts.css` |
| `payments` | `shared/payments.ts`(1471 行)、`main/payment-{store,ipc,sync}.ts`、`creem-client.ts`、`renderer/payments.ts`(1439 行)、`payments.css` |
| `x-push` | `shared/x-push.ts`、`main/x-push.ts`、`x-bridge.ts` |
| `harness` | `modules/harness.ts`（background 占位）；运行时在 `kernel/main/services/dsh-runtime.ts`、`main/host.ts`（只解析 CLI） |

### 6.3 需要顺手拆开的两处

**（a）`monitor` 目前是个筐。** 它同时干了：项目健康度、Vercel 流量分析、Top Pages 归因、后台用户统计、生成明日待办、生成六平台社媒弹药。其中社媒弹药和监控没有本质关系（只是共用一次刷新），应该独立成 `social-ammo` 模块 —— 只做自媒体的人可以关掉 `monitor` 单留 `social-ammo`，反之亦然。

⚠ **这一拆不是搬文件。** 社媒弹药的 UI 现在是 `renderer/monitor.ts` 通过 `import { bindSocial, renderSocial } from './social'` 渲染在监控视图**内部**的，`monitor-ipc.ts` 的刷新流程里也顺带生成弹药。拆分要做三件事：把 `renderer/social.ts` 从监控视图里剥出来挂到自己的 view；把「刷新监控」和「生成弹药」两条流程解耦（改为 `monitor` 刷新完发事件、`social-ammo` 订阅）；`social-ammo` 在 `monitor` 被禁用时要能独立触发生成。这是 P3 里工作量最大的一块，评估排期时不要按"移动文件"估。

monitor 内部再按子模块组织（同一模块内的 group，不单独安装）：

- `monitor.projects` 项目健康度与部署状态
- `monitor.web-analytics` Vercel 流量与曲线
- `monitor.speed-insights` Vercel 全球 Web Vitals（LCP / TTFB 按国家）
- `monitor.top-pages` 页面级双窗口对比与归因
- `monitor.project-users` `/api/stats` 注册 / 付费统计

**（b）跨模块直连全部改走内核 seam。**

| 现在 | 改造后 |
|---|---|
| `monitor` → 直接写 todo store | `ctx.todos.ingest({ agentId: 'monitor', ... })` |
| `payments` → 直接 `new Notification()` + 写待办 | `ctx.notify.push()` + `ctx.todos.ingest()` |
| `micro` → 写 `#选品` 待办 | `ctx.todos.ingest({ agentId: 'micro', tags: ['选品'] })` |
| `x-push` → 读 social 草稿 | 软依赖：`ctx.inject(['social-ammo'], …)` 包住这段增强逻辑 |
| `search` → 硬编码 4 类文档 | 每个模块 `ctx.search.contribute()` |

前三条走的都是同一个 `ingest` seam（现有 `agent-inbox.ts` 的 `dedupeKey` 去重逻辑原样保留），模块从此不知道 todo store 长什么样。

---

## 7. Enable / Disable 的确切语义

### 7.1 禁用时发生什么

用户在设置里关掉 `payments`：

1. `ctx.modules.disable('payments')` → 找到 loader entry → `entry.update({ disabled: true })`
2. Loader 回写 `workbench.yml`（`EntryTree.write()`），配置持久化
3. `fiber.dispose()` 逆序回收：
   - `ctx.bridge.handle` 注册的 21 个 `payments:*` 通道注销 → 前端再调直接拿到 `MODULE_DISABLED` 错误
   - `ctx.workbench.view` 的导航项、托盘条目、`⌘5` 快捷键移除
   - `ctx.scheduler.every` 的 60 分钟心跳停止
   - `ctx.search.contribute` 的文档从索引移除
   - `ctx.storage.open('payments')` 的文件句柄关闭（**数据文件保留**）
4. 内核向渲染进程广播 `modules:changed`，rail 导航重渲染，若当前正停在该视图则回落到「今日」

### 7.2 数据处理原则

| 操作 | 配置 | 数据 | 凭据 |
|---|---|---|---|
| 禁用 | 保留（`disabled: true`） | 保留 | 保留 |
| 启用 | 恢复 | 原样接上 | 原样接上 |
| 卸载（第三方模块） | 移除 entry | 默认保留，二次确认可勾选一并删除 | 随卸载删除 |

「禁用不丢数据」是必须的 —— 用户这个月不看收款，下个月打开还要看到全部台账。

### 7.3 依赖处理

- **硬依赖（`inject`）**：内置模块的硬依赖一律指向内核服务，而内核永不消失，所以**内置模块之间不存在级联停用**。这条规则只对第三方模块生效：若某模块硬依赖另一个第三方模块，被依赖方禁用时依赖方自动进 `PENDING`（不是 FAILED，不报错），设置页画出依赖链并在禁用时弹「以下 N 个模块会一起停用」的确认。
- **软依赖（`optional`）**：用 `ctx.inject([...], cb)` 包住那段增强逻辑，服务在就跑、不在就跳过。例如 `accounts` 少了 `social-ammo` 只是不显示"关联选材"，主体功能不受影响。
- **循环依赖**：manifest 校验期直接拒绝安装。

---

## 8. 设置 · 模块管理

设置本身是内核的一个固定视图（不可禁用），rail 底部常驻入口。分四个页签：

### 8.1 已装模块

列表，每行：

```
┌────────────────────────────────────────────────────────────────┐
│ [收] 收款管理                    v1.2.0 · 内置          [ ●━ ] │
│      Creem + 国内手工入账的财务台账                              │
│      运行中 · 上次心跳 12 分钟前                                 │
│                                        [配置]  [日志]          │
├────────────────────────────────────────────────────────────────┤
│ [选] Micro 选品                  v1.0.0 · 内置          [ ━○ ] │
│      已停用 · 数据保留（本地 138 条 idea）                       │
├────────────────────────────────────────────────────────────────┤
│ [X ] X 推送                      v0.9.0 · 内置          [ ●━ ] │
│      ⚠ 需要配置：浏览器插件未连接            [去配置]            │
├────────────────────────────────────────────────────────────────┤
│ [飞] 飞书任务同步                v0.3.1 · 第三方        [ ●━ ] │
│      运行中 · 沙箱进程 · 权限：联网(feishu.cn) 读写待办           │
│                                 [配置]  [日志]  [更新]  [卸载] │
└────────────────────────────────────────────────────────────────┘
```

交互点：

- **开关**：即时生效，无需重启（Cordis 的 fiber 热插拔）。若有第三方模块硬依赖它，先弹确认。
- **配置**：抽屉展开，由模块的 `config` schema 自动渲染表单（对齐 dsh 的 schemastery 设置卡片做法）。模块也可以提供自定义配置视图（现在的「Creem 设置」「金矿配置」页签就是这种）。
- **状态**：`ACTIVE` / `PENDING(等待依赖)` / `NEEDS_CONFIG` / `FAILED` / `DISABLED` 五态，各带一句人话解释。
- **日志**：该模块 fiber 的加载 / 卸载 / 报错记录，排查第三方模块用。
- **排序**：拖拽调整 rail 里的顺序（写回 entry 顺序）。
- **分组**：按「核心 / 项目 / 内容 / 财务 / 实验」分组，对应 loader 的 `group` entry。

### 8.2 模块仓库

见 §9。

### 8.3 全局设置

主题、启动视图、rail 默认状态、快捷键表、DeepSeek key、代理设置（现在散在「金矿配置」里的 mixed 口配置上收到这里，所有模块共享）。

### 8.4 开发者

- 加载本地目录作为模块（`link:` 形态，配 HMR 后改代码即时重载）
- 导出当前 entry tree（等价 `dsh --dump-config`），用于排查"到底加载了什么"
- 权限审计：每个模块声明了哪些 capability、实际调用了几次

---

## 9. 模块仓库

### 9.1 四种源

| 源 | 形态 | 适用 |
|---|---|---|
| 内置 | 随 app 打包在 asar 内 | 官方 9 个模块，只能禁用不能卸载 |
| 官方仓库 | 一个静态 `index.json` + 托管的 tarball | 官方增补模块、精选社区模块 |
| npm / Git | 任意 pnpm 可识别的 spec | 用户自己找到的模块 |
| 本地目录 | 绝对路径 | 开发调试 |

### 9.2 仓库索引格式

```jsonc
{
  "version": 1,
  "updatedAt": "2026-09-08T00:00:00Z",
  "modules": [
    {
      "id": "feishu-tasks",
      "title": "飞书任务同步",
      "description": "把工作台待办和飞书任务双向同步",
      "author": "someone",
      "homepage": "https://github.com/...",
      "latest": "0.3.1",
      "engines": { "ownworkbuddy": ">=0.3.0" },
      "capabilities": ["net:open.feishu.cn", "todos:write", "secrets"],
      "dist": {
        "tarball": "https://.../feishu-tasks-0.3.1.tgz",
        "integrity": "sha512-..."
      },
      "category": "效率",
      "verified": true
    }
  ]
}
```

### 9.3 安装流程

```
浏览仓库 → 选中模块 → 展示权限清单（这个模块要联网访问 X、要读写你的待办、要存凭据）
        → 用户确认 → 下载 tarball → 校验 integrity → 解压到 userData/modules/<id>/
        → 校验 manifest（id 冲突？引擎版本？循环依赖？capability 是否在白名单？）
        → 写入 workbench.yml 一条 entry（默认 disabled: false）
        → loader 加载 → ACTIVE
```

**一个关键约束：模块必须自带构建产物、零运行时依赖（或只依赖内核已提供的 peer）。**

理由：dsh 用 `dsh plugin add` 转发 pnpm，前提是「pnpm 在 PATH 上」。桌面应用不能假设用户装了 pnpm，也不适合在用户机器上跑一次完整的依赖解析（慢、可能失败、可能拉进任意 postinstall 脚本）。dsh 社区文档本身也把「产物入库、git 源一行安装」列为推荐做法。我们把推荐变成硬性要求，安装器就退化成「下载 + 校验 + 解压」，可控、可离线、可审计。

需要第三方依赖的模块作者自己 bundle 进产物即可（tsdown / esbuild 一行的事）。

### 9.4 更新

- 启动时（或手动点检查）拉一次 index.json，对比版本号，设置页显示可更新角标
- 更新 = 下载新 tarball → 解压到 `<id>@<新版本>/` → `entry.update({ name: 新路径 })` 热切换 → 成功后删旧目录，失败则回滚 entry 指回旧目录
- 内置模块随 app 版本更新，不单独更新

### 9.5 安全模型

第三方代码跑在自己电脑上，这是必须认真对待的部分：

| 层 | 措施 |
|---|---|
| 安装前 | 权限清单明示 + 用户确认；官方仓库的模块标 `verified`；非官方源二次警告 |
| 完整性 | tarball `integrity` 校验；官方仓库全站 HTTPS + 索引签名 |
| 隔离 | **第三方模块主进程侧跑在 `utilityProcess`**，不直接持有 `BrowserWindow` / `app` / `ipcMain`，只能通过 capability RPC 向内核请求能力；内置模块 in-process（性能优先，代码可信） |
| 运行时强制 | 内核按 manifest 的 `capabilities` 校验每次能力调用：没声明 `net:x.com` 就发不出去这个域的请求；没声明 `todos:write` 就调不了 `ctx.todos.ingest()` |
| 渲染侧 | 第三方模块 UI 跑在 sandboxed `<iframe>`（无 node、无 `contextBridge` 直连），只通过 postMessage 走内核代理的 RPC |
| 可观测 | 开发者页签的权限审计表，能看到每个模块实际发起了哪些请求 |

首版这五层一次做齐 —— **安全机制和安装功能同期上线**，不能出现「先做成能装、隔离以后再补」的窗口期：一旦有用户在无隔离的版本上装过第三方模块，后面再收紧就是破坏性变更。

capability 采取白名单枚举而非自由字符串：

| capability | 含义 | 现有使用者 |
|---|---|---|
| `net:<域名>` | 出站请求，按域名逐个声明 | payments(creem.io)、monitor(vercel + 各站点)、micro(reddit / HN) |
| `net:listen:<端口>` | **监听本地端口** | `x-push` 的本地桥 `127.0.0.1:18753` |
| `storage` | 自己命名空间下的读写 | 全部 |
| `secrets` | `safeStorage` 凭据 | payments |
| `notify` | 桌面通知 | payments、micro、pet |
| `todos:read` / `todos:write` | 读 / 经 `ingest` 写待办 | monitor、micro、payments、social-ammo、x-push |
| `search` | 贡献搜索索引 | notes、accounts |
| `fs:export` | 导出文件到用户选定路径 | payments(CSV) |
| `clipboard` | 写剪贴板 | payments |
| `window` | 开独立窗口 | pet |
| `subprocess` | 起子进程 | （H2 起 dsh 由内核 `dshRuntime` 拉起，不再是 harness 模块能力） |

`net:listen` 和 `subprocess` 是两个最高危项 —— 前者把模块变成本地服务端（`x-push` 的浏览器插件桥就是这个形态），后者可执行任意二进制。官方仓库默认不收录声明了 `subprocess` 的第三方模块；`net:listen` 需在安装确认时单独高亮端口号。

### 9.6 与 dsh 生态的关系

- 模块 manifest 与 dsh 的 `dsh` 字段并存不冲突：一个包可以**同时**是 OPC Agent Team - Solokit 模块和 dsh bundle（`ownworkbuddy` 字段给工作台，`dsh.bundle` 给 Agent 运行时）。
- 第三方示例：`dsh plugin --profile opc add ./examples/hello-module`。已有 `ctx.tools` 的内置职业有 `packages/occupation-*` 标记 bundle（Panel 仍在 `src/modules`）。`workbench.yml` 继续管桌面 Panel 启停；dsh 层栈的权威文件是 `$DSH_HOME/profiles/opc/cordis.patch.yml`（工作台停用会回写 `disabled: true`）。内核服务顺序见 `src/kernel/cordis.patch.yml`。
- `dsh plugin --profile web add` 仍是官方 web 面自己的插件槽，不要和工作台模块混装。

---

## 10. IPC 与 preload 的泛化改造

这是整个改造里技术难度最高的一处，因为 **preload 是静态打包的沙箱脚本，没法按模块动态注入**。

### 10.1 方案

从「每模块一个 contextBridge 命名空间」改为「内核一个统一通道 + 主进程侧注册表校验」：

```ts
// preload —— 从此不再随模块增减而改动
contextBridge.exposeInMainWorld('workbench', {
  // 内核能力（固定）
  modules: { list, enable, disable, install, uninstall, configure },
  theme: { get, set, onChanged },
  search: { query },
  // 模块通道（泛化）
  invoke: (moduleId, action, payload) => ipcRenderer.invoke('module:invoke', moduleId, action, payload),
  subscribe: (moduleId, event, cb) => { /* 'module:event' 单通道按 moduleId+event 分流 */ },
})
```

主进程 `ctx.bridge` 持有 `Map<`${moduleId}:${action}`, handler>`，`module:invoke` 到达时：

1. 模块存在且 `ACTIVE`？否 → `MODULE_DISABLED`
2. action 已注册？否 → `UNKNOWN_ACTION`
3. 调用方是否有权（第三方模块只能调自己的命名空间）？否 → `FORBIDDEN`
4. 派发

### 10.2 类型安全怎么保住

泛化通道天然会丢类型。补偿手段：

- 模块的 `shared/` 里导出 `ActionMap` 类型（action 名 → 入参/出参），主进程 `handle` 和渲染侧 `api` 两边都用它约束
- 渲染侧拿到的 `host.api` 是 `ModuleApi<PaymentsActions>` 泛型，`api.invoke('sync')` 的返回值仍然是 `PaymentsState`
- 内置模块因为在同一个仓库里，类型直接 import，零成本；第三方模块由模块作者自己导出 `.d.ts`

结论：**内置模块的类型安全等价于现在，第三方模块降级为运行时校验**，这个取舍是必要的。

### 10.3 迁移兼容

`window.ownworkbuddy.*` 保留为一层薄适配（内部转调 `workbench.invoke`），让现有 6 个渲染视图能一个个迁移，不必一次性重写。全部迁完后删掉。

---

## 11. dsh sidecar 的升级（已被 ADR 0005 取代）

原先计划把 `harness` 从「另开窗口跑 dsh web」升级成双向桥（模块 tools 注入 sidecar、产出走 `todos.ingest`、密钥继续读 `~/.dsh`），并标成 P6 加分项。

这套桥默认两棵 Context 长期并存。0005 改成：职业模块直接挂上 dsh 的 `ctx.tools` / client Panel，Electron 只做 host，不再以 sidecar iframe 为融合终点。密钥共用仍然成立：DeepSeek key 在工作台「设置 → 模型」填写（`credentials.ts` 用 `safeStorage`），启动 opc 进程时注入同一把 `DEEPSEEK_API_KEY`。环境变量优先；仍可读 `~/.dsh` 遗留配置。迁移步骤见 ADR 的 H1–H7。

---

## 12. 存储与配置布局

```
userData/
  workbench.yml                 ← 桌面 Panel 启停（过渡；dsh.bundle 层在 opc profile）
  workbench.local.yml           ← 机器本地覆盖（不同步）
  kernel/
    todos.json                  ← 待办是内核服务，不在 module-data 下
    theme.json
  llm.json                      ← 设置 → 模型保存的 DeepSeek API Key（safeStorage）
  module-data/
    notes/notes.json
    monitor/cache.json
    micro/state.json
    accounts/accounts.json
    payments/payments.json
    social-ammo/social.json
    <third-party-id>/...
  modules/                      ← 第三方模块解压目录
    feishu-tasks/
      package.json
      lib/{main,client}.js
  secrets.enc                   ← safeStorage 加密的凭据
  logs/modules.log
```

`workbench.yml` 示例（就是 Cordis loader 的 entry tree 格式）：

```yaml
- id: group-core
  name: cordis:group
  group: true
  config:
    - id: notes
      name: cordis:module-notes
    - id: pet
      name: cordis:module-pet

- id: group-project
  name: cordis:group
  group: true
  config:
    - id: monitor
      name: cordis:module-monitor
      config:
        refreshMinutes: 60
    - id: micro
      name: cordis:module-micro
      disabled: true              # ← 用户关掉的
      config:
        heartbeatHours: 24
        proxy: http://127.0.0.1:7890

- id: feishu-tasks
  name: ./modules/feishu-tasks/lib/main.js   # 第三方，绝对/相对路径
  config:
    appId: cli_xxx
```

内置模块用 `cordis:` 前缀 —— loader 的 `import()` 见到 `cordis:xxx` 会直接从 `loader.builtins` 取已注册的模块对象，**不走动态 import**。这正好解决 electron-vite 打包后无法动态 import asar 内文件的问题：内置模块在 boot 时静态 import 并注册进 `builtins`，第三方模块走真实路径的动态 import（`userData/modules/` 在 asar 外，可以直接 import）。

需要现有数据的一次性迁移：把 `userData/*.json` 分别搬到 `userData/kernel/`（todos、theme）和 `userData/module-data/<id>/`（其余 6 个），首次启动时自动完成并备份原文件。

---

## 13. 渲染进程的模块运行时

### 13.1 视图挂载

删掉 `index.html` 里 7 个写死的 `<section id="view-*">`，改成一个空的 `<main id="stage">`。**`view-home`（今日态势 / 收件框 / 今日提醒 / 未完成待办 / 标签筛选 / 最近模块）不在此列 —— 它是内核外壳自带的首页**，其中「最近模块」一栏由模块注册表驱动，会随模块启停变化。

内核启动时：

1. `workbench.modules.list()` 拿到启用清单（含 `mark` / `title` / `order`）
2. 渲染 rail 导航
3. 切到某个视图时按需 `import()` 该模块的 client 入口，创建 `<section>`，调 `mount(host)`
4. 模块被禁用 → 调用 `unmount`，移除 `<section>`，卸载其样式表

### 13.2 内置模块的按需加载

内置模块的 client 入口在打包产物里，用一张静态映射表（构建期生成）保证 Rollup 能做代码分割：

```ts
const BUILTIN_CLIENTS = {
  todos: () => import('../../modules/todos/client'),
  payments: () => import('../../modules/payments/client'),
  // ... 构建期从 modules/ 目录扫描生成
}
```

副产物：现在 `app.ts` 顶部的 6 个模块 CSS import 和 6 个 `activateXxx` 全部消失，首屏只加载外壳 + 当前视图。`payments.ts`(1439 行) 和 `monitor.ts`(1056 行) 不再进首屏 bundle。

### 13.3 样式隔离

模块 CSS 通过 `<link>` 动态挂载/卸载。内置模块沿用现在的 CSS 变量主题体系（`theme.css` 留在内核）；第三方模块的 UI 在 iframe 内，天然隔离，内核通过 postMessage 下发主题变量。

### 13.4 window 类模块的独立入口

`pet` 是 `kind: 'window'`，不挂在 stage 里，而是独立开窗。`harness` 在 H2 改为 `background` 占位，不再 `loadURL` 官方 UI。`pet` 现在有自己的 HTML 入口，写死在构建配置：

```ts
// electron.vite.config.ts —— 现状
input: { index: 'src/renderer/index.html', pet: 'src/renderer/pet.html' }
```

模块化之后这张表不能再手写，否则每加一个 window 类模块都要改构建配置 —— 正是要消灭的那种耦合。做法：

- manifest 增加 `window` 字段声明入口（`{ "window": { "entry": "./client/pet.html", "frame": false, "alwaysOnTop": true } }`）
- 构建期扫描 `src/modules/*/manifest.ts`，**自动生成** Rollup 的 `input` 表
- 内核 `ctx.workbench.window(spec)` 按 manifest 创建 `BrowserWindow`，模块禁用时窗口自动关闭（同样走 `ctx.effect()` 回收）
- 第三方 window 类模块的入口在 asar 外，`loadFile` 直接指向 `userData/modules/<id>/`，并强制 sandbox + 无 node 集成

`harness` 不再走这条 window 入口：对话在中栏 / Local API 的 SDK session 上，不嵌官方页。

---

## 14. 迁移路径

首版目标是**完整形态**：内核 + 9 个模块 + 设置管理 + 模块仓库（含第三方安装与隔离）。下面是构建顺序而不是删减范围 —— 每一阶段都能跑、都能发版，不做大爆炸式重写。

**P0 · 内核骨架**
挂上 Cordis + loader，实现 `ctx.modules` / `ctx.bridge` / `ctx.storage` / `ctx.workbench` 四个最小服务；`workbench.yml` 读写；`builtins` 注册机制。此时不动任何现有功能，它们仍走老路径，内核空转。风险最低，可独立验证。

**P1 · 内核服务补齐 + 待办上收**
`ctx.todos`（待办 + 标签 + 提醒 + `ingest` seam + sink/source 扩展点）、`ctx.llm`（合并三份重复的 DeepSeek 调用）、`ctx.scheduler`（合并三套各写各的定时器）、`ctx.notify`、`ctx.secrets`、`ctx.search`。待办先上收是因为后面每个模块迁移都要用到它，顺带消掉现有代码里的重复。

**P2 · 单模块试点**
拿 `notes` 开刀（最小：5 个文件、3 个 IPC、1 个 store）。跑通全链路：manifest → apply → bridge → 动态视图挂载 → 设置里能开关。这一步会暴露所有设计漏洞，成本可控。**试点通过前不要批量迁移。**

**P3 · 存量模块迁移**
`pet` → `accounts` → `micro` → `payments` → `monitor` + 拆出 `social-ammo` → `x-push` → `harness`。每迁一个删一份老代码。`monitor`（611 行 ipc + 1056 行 renderer）和 `payments`（1471 行 shared + 1439 行 renderer）是两块硬骨头，放在手感成型之后。现有单测随 `shared/` 平移，是迁移正确性的安全网。

**P4 · 设置 · 模块管理**
模块列表、开关、状态五态、schema 配置表单、日志、排序分组、开发者页签。此时全部模块已是标准形态，这一步基本纯 UI。

**P5 · 模块仓库全链路**
本地目录加载（开发用）→ 官方索引 + 下载安装 + integrity 校验 → `utilityProcess` 隔离 + capability 白名单强制 → iframe 渲染沙箱 → 更新与回滚。安全机制和安装功能**同期上线**，不留「先能装、隔离以后再补」的窗口期。

**P6 · dsh 双向融合（已被 ADR 0005 的 H1–H4 取代）**
不再给 sidecar 注入工具。组合根改成 dsh profile，职业模块直接注册 `ctx.tools`。详见 [ADR 0005](./adr/0005-dsh-as-composition-host.md)。

---

## 15. 硬编码常量的配置化

用户的工作情况走「工作情况」设置，不焊进代码。启动默认是空目录。

| 现在 | 行为 |
|---|---|
| `shared/products.ts` 的 `OPC_PRODUCTS` | 默认 `[]`。用户在设置里增删，示例见 `examples/catalog.example.json` |
| `shared/tags.ts` 的 `OPC_PROJECT_TAG = 'OPC项目'` | 内核默认标签，设置里可改 |
| `shared/social-copy.ts` 的社媒签名 | 默认空字符串，设置里可填 |
| `micro` 的 subreddit / 领域清单 | 通用公开源，不是某个人的站点清单 |
| `main/micro-sourcing-fetch.ts` 的 User-Agent | 只用产品名和版本，不带个人站点 |

`products.ts` 里那套 `statsStatus`（`live` / `pending` / `unavailable`）仍是通用能力。

直接收益：换一批产品、加一个监控站点，都不用改代码重新打包。

### 15.1 开源快照

- 没有任何硬编码的 API key / token。凭据走「设置 → 模型」的 `safeStorage`、环境变量，或 `~/.dsh` 遗留配置。
- 打包签名身份不进仓库：`electron-builder.yml` 不写姓名 / Team ID；`scripts/sign-mac.sh` 要求 `CODESIGN_IDENTITY`；公证脚本帮助文本用 `<TEAM_ID>`。
- 另需补齐的：i18n（UI 仍是中文硬编码，方案见 `docs/i18n-plan.md`）、`SECURITY.md`、CI 扩到 typecheck / lint / 构建冒烟。

---

## 16. 风险与权衡

| 风险 | 说明 | 对策 |
|---|---|---|
| Cordis 仍在 rc 阶段 | `@deepseek-ai/cordis@4.0.2` 跟随 dsh 迭代，API 可能变 | 内核服务层包一层自己的 facade，模块只依赖 `ctx.xxx`，不直接依赖 Cordis 细节；锁版本 |
| preload 泛化丢类型 | 第三方模块只能运行时校验 | 内置模块保持编译期类型（见 §10.2）；第三方模块提供 `.d.ts` 约定 |
| 主进程跑第三方代码 | 全权限风险 | `utilityProcess` 隔离 + capability 白名单 + 安装前确认（§9.5） |
| electron-vite 与动态 import | 打包后无法动态 import asar 内文件 | 内置模块走 `cordis:` builtins（静态 import 注册），第三方模块在 asar 外（§12） |
| 迁移期两套并存 | 老 `window.ownworkbuddy` 与新 `window.workbench` 同时存在 | 薄适配层过渡（§10.3），P3 结束统一删除 |
| 模块粒度拆过头 | 拆成 20 个模块反而增加配置负担 | 首版 9 个模块 + 分组；monitor 的 4 个子模块放在模块内部，不单独安装 |
| 现有数据迁移 | 8 个 json 换位置 | 首启自动迁移 + 备份原文件 + 失败回滚 |
| **首版范围偏大** | 内核 + 9 模块 + 仓库 + 隔离一起做，战线长 | P0–P2 是承重结构，必须先把 `notes` 试点跑通再批量迁移；P4/P5 依赖 P3 完成，但彼此独立可并行；任何一阶段结束都是可发版状态 |
| **模块 API 定型过早** | 一旦有模块在仓库里分发，内核 API 的破坏性变更就会打碎它们 | 先把 9 个内置模块全迁完、API 经过 9 次真实检验后，再开放仓库安装；`engines.ownworkbuddy` 作加载期兼容闸门 |
| 配置化改动数据模型 | §15 的配置化会动 `monitor` / `micro` / `social-ammo` 的数据结构 | 在 P3 迁移这三个模块时**一并**做，别迁完再返工动第二遍 |

---

## 17. 目录结构（改造后）

```
src/
  kernel/                    ← 内核，不可禁用
    main/
      boot.ts                ← Cordis 上下文 + loader + builtins 注册
      services/
        modules.ts  bridge.ts  storage.ts  workbench.ts
        secrets.ts  llm.ts     scheduler.ts notify.ts
        search.ts   settings.ts repository.ts
        theme.ts
        todos/               ← 待办：store / 提醒 / 拆解 / 标签 / ingest / 扩展点
      windows/               ← workbench-window / app-icon
    preload/
      index.ts               ← 统一泛化桥（不再随模块变动）
    renderer/
      shell.ts               ← rail / 搜索 / 主题 / 设置外壳
      module-host.ts         ← 视图挂载运行时
      todos/                 ← 内核自带的待办视图
      settings/              ← 模块管理 + 仓库 UI
    shared/
      module.ts              ← Manifest / 生命周期 / 能力 类型定义
      datetime.ts
  modules/                   ← 内置模块，每个自成一体
    notes/  pet/  monitor/  social-ammo/
    micro/  accounts/  payments/  x-push/  harness/
packages/
  module-sdk/                ← Manifest 类型 / ModuleHost / 内核服务 d.ts，模块的唯一依赖
  create-module/             ← 脚手架 + 示例模块
```

---

## 18. 决策记录与待定项

### 已定

1. **`todos` 上收为内核服务**，不做成可禁用模块；视图也是内核固定视图。可替换性通过 `ctx.todos` 的 sink / source / view 扩展点保留（§5.1）。
2. **首版做完整形态**：内核 + 9 模块 + 设置管理 + 模块仓库（含第三方安装、`utilityProcess` 隔离、capability 强制、iframe 渲染沙箱）。安全机制与安装功能同期上线，不留窗口期（§14 P5）。
3. **开源另起新仓库，本轮不做**。§15 正文的「硬编码常量配置化」保留，但理由是模块化本身要求可配置，与开源无关；许可证、i18n、治理文件、身份参数化全部推迟到新仓库时处理（§15.1 备查）。

4. **模块粒度**：`social-ammo` 独立成模块，但首版 UI 仍挂在监控页里；`monitor` 的 4 个子模块不做成独立开关，避免配置项翻倍。
5. **模块产物约束**：第三方模块必须自带构建产物、安装器只做复制，不在用户机器上跑 `pnpm install`。
6. **仓库托管**：首版只做本地目录 + Git 源，不做官方 `index.json`。
7. **配置格式**：`workbench.yml` 用 YAML，对齐 dsh 的 `cordis.yml`，方便手改。
8. **dsh 融合深度（已被 [ADR 0005](./adr/0005-dsh-as-composition-host.md) 取代）**：不再把 Harness 当独立窗模块、把工具注册留到 P6。组合根改为 dsh profile；Electron 薄壳。
9. **第三方隔离**：首版用进程内 capability 代理 + IPC 命名空间校验，不在首版上 `utilityProcess` / iframe。内置模块与现有 IPC 路径保持一套，避免为隔离把原有功能拆两套。

### 待定

无。首版按上面的推荐落地。
