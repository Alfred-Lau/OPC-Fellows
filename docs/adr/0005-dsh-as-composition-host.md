# dsh 当组合宿主：Electron 是薄壳，不是第二套内核

顺序搞反了，但反的是 **Agent 运行时**，不是整颗桌面产品。OPC 不该把 DeepSeek Harness 当成内置模块 iframe 进去；对话、工具循环、会话日志、模型适配应活在 dsh 的那棵 Cordis 树上。Electron 只保留窗、托盘、通知、台伴这些本机壳，职业 Panel 作为 dsh 的 client 插件挂上，而不是再造一套 `ctx.llm` / `ctx.agents`。

本 ADR 取代 [模块化架构 §2.1](../module-architecture-design.md) 的「选 C，以 A 为承重」和 [工作台设计 A6 / 风险「两套对话后端」](../agent-workspace-design.md)。产品心智（成员 / 项目 / 职业 Skill / Panel）仍以 [CONTEXT.md](../../CONTEXT.md) 为准，不改口。

## 为什么这样

README 已经对外写「Harness 当运行时、能力当插件」。代码却是反过来的：Electron 自己 `new Context()`，再 `spawn dsh web` 当 sidecar，中栏用 `<webview>` 把官方 UI 嵌进去。这不是融合，是两套产品叠在一起。

dsh 的官方架构是 **Everything is a Plugin**：一次 `dsh --profile …` 启动，从有序 patch 层组成一棵 Cordis 树。`ctx.llm`、`ctx.tools`、`ctx.sessions`、`ctx.agents`、`ctx.agentLoop` 已经是稳定缝。官方桌面应用也是「Electron 薄生命周期 + 打包进去的 dsh host」，不开 loopback Web 服务。社区 `dsh-desktop` 同一方向：Electron 是 dsh 的一种 surface，不是在 Electron 里再包一个 dsh。

旧方案 B 被否，是因为当时把「进 dsh」理解成「职业模块跑进 `dsh web` 浏览器页、拿不到 `BrowserWindow`」。这个否决仍然成立。真正该翻的是另一面：不要为了保住 Electron API，就把 Agent 循环、会话、模型调用全部重写一遍。

## 现在实际挂着什么

启动链仍是 `src/main/index.ts` → `bootKernel()` → `applyOpcKernel()`（顺序来自 `src/kernel/cordis.patch.yml`）。H2 之后，Agent 循环只剩一棵 SDK 进程。H4 补上 `opc` profile 与 `dsh.bundle`。H5 让内核组合与 opc 用户层对齐 patch。

```
Electron 主进程
  applyOpcKernel（src/kernel/cordis.patch.yml）
    ctx.modules / ctx.workbench / ctx.bridge / ctx.todos
    ctx.llm          ← 分类 / 拆解仍 fetch api.deepseek.com（H3）
    ctx.agents       ← 花名册 + threads.json；chat() 走 dshRuntime
    ctx.dshRuntime   ← 唯一 spawn：dsh --profile opc（in-box 含 dsh-sdk-app）
    内置职业模块（notes / payments / …）Panel 仍在进程内
    harness 模块     ← background 占位，不再起 dsh web
  中栏闲聊 + Local API /agent/task → 同一棵 SDK session 树
  第三方 dsh.bundle 启停 → $DSH_HOME/profiles/opc/cordis.patch.yml
```

对照官方 dsh 树，内核加载器和职业 tool 仍是自造的：

| dsh 已有 | 本仓库自造 | 现状 |
|---|---|---|
| `dsh --profile` + bundle patch | `workbench.yml` + `ModulesService` | 桌面 Panel 仍读 `workbench.yml`；第三方 `dsh.bundle` 停用回写 opc `cordis.patch.yml`；内核顺序在 `src/kernel/cordis.patch.yml` |
| `ctx.llm` 适配器缝 | `LlmService.complete` | 拆解、选品、弹药、公众号都走它；中栏闲聊仍走 SDK |
| `ctx.agents` + `ctx.agentLoop` | `AgentsService` 花名册 + `dshRuntime.prompt` | 闲聊和 `/agent/task` 进同一 SDK；模型点名 `ctx.tools` 后再跑一轮 |
| `ctx.sessions` 追加日志 | `kernel/threads.json` + dsh session id `opc:<thread>:<agent>` | 中栏已不再 iframe 官方 UI |
| `ctx.tools` + `tools/*` 管道 | OPC `ToolsService`：`notes_add` / `monitor_refresh` / `payments_sync` / `micro_scan` | 口令仍走 bridge；说不清的话进 dsh + JSON 工具协议 |
| `dsh.bundle` / `dsh.profile` | package.json 的 `ownworkbuddy` 字段 | 过渡期双写；`hello-module` 与 `packages/occupation-*` 可 `dsh plugin --profile opc add` |
| 官方 desktop host | `DshRuntimeService` spawn `dsh --profile opc` | `host.ts` 只解析 CLI；不再 `dsh web --port 0`；opc in-box 对齐官方 sdk 模板 |

`@deepseek-ai/dsh` 在 `package.json` 里是依赖，源码里仍通过 `require.resolve('@deepseek-ai/dsh/lib/bin.js')` 拉 CLI。没有直接 `import` `dsh-base` / `dsh-agent-loop`。协议是自写的 stdio JSON-RPC。对话 spawn 是 `--profile opc`（层栈含 `@deepseek-ai/dsh-sdk-app`）。

## 对上官方缝之后，OPC 概念怎么放

界面词表不动。代码里的 Agent 记录也不改名（见 [0003](./0003-member-not-agent.md)）。变的是运行时落点：

| OPC（用户语言） | 今天落在 | 应该落在 |
|---|---|---|
| 成员 | `AgentRecord` + 自建 `chat()` | dsh agent preset / `ctx.agents`；花名册仍是 OPC 投影 |
| 主对话 / 项目 | `threads.json` | `ctx.sessions` 的 Session；项目元数据可挂在 session meta |
| Skill / Tool | 分类器 + bridge action | `ctx.tools` 注册，schema 进 prompt |
| Panel | 右栏模块 HTML | dsh client 插件或 Conversation node，仍渲染职业表 |
| 待办 | 内核 `ctx.todos` | 继续是 OPC 服务，挂在同一棵 dsh Context 上 |
| 窗身份（台伴） | Electron `BrowserWindow` | 仍由 desktop host 插件开窗，不进 `dsh web` 页 |
| DeepSeek 工作台 | 内置模块 `harness` | 不再是职业；中栏就是 dsh 会话表面 |

增长黑客、财务顾问这些职业仍然是能力包，不是再做一个通用 Agent 皮肤。它们要做的是：在 dsh 树上 `inject` 工具和 Panel，而不是在自建树上再挂一个 iframe。

## 目标拓扑

不要把整颗渲染层塞进 `dsh web` 当一个大插件。也不要继续「自建内核 + sidecar 桥」。

```
Electron 薄壳（窗 / 托盘 / 台伴 / 通知 / safeStorage）
  └── 启动 dsh --profile opc（或官方 desktop host 同款：进程内 host，不开 :port）
        ├── @deepseek-ai/dsh-base          llm / tools / sessions / agent-loop / credentials
        ├── @deepseek-ai/dsh-web-app       或 OPC 自己的 client 面
        ├── ownworkbuddy-kernel            todos、成员花名册、项目、workbench chrome
        └── occupation-*                   收款 / 监控 / 选品 / … → ctx.tools + client Panel
```

组合根是 dsh 的 Context。OPC 内核变成 bundle，不是第二棵树。职业模块的 package.json 主字段从 `ownworkbuddy` 迁到 `dsh`（过渡期可以双写）。Electron 只做官方 desktop 已经做过的事：生命周期、安全协议、本机能力。

这比旧方案 C 多了一条硬约束：**禁止再 `new Context()` 当产品内核。** 官方明确：自定义组合是 profile + 有序 patch，不是再写一个可执行文件去内嵌 dsh 插件树。sidecar `dsh web` 和 headless 再 spawn 一次，都属于绕开 launcher。

## 考虑过但没选

- **维持 C，做 P6 双向桥。** 模块工具注入 sidecar、待办经 ingest 回来。两棵 Context 永远对不齐：会话、密钥解析、模型流、tool 审批各做一份。README 的「Harness 当运行时」会一直是文案。
- **整应用改写成 dsh web 插件，丢掉 Electron。** 台伴、托盘、到点通知、`safeStorage`、微信情报本机索引都会丢。旧方案 B 的否决仍然对。
- **中栏继续 iframe 官方 UI。** 花名册、项目、职业 Panel 和 Harness 会话还是两个产品。用户点成员说话走一次 complete，点 Harness 进另一套循环。
- **进程内直接 `ctx.plugin(dsh packages)`。** 官方把这条列为非应用入口。升级、profile 愈合、`dsh plugin add` 都会和我们分叉。
- **只用 dsh SDK / ACP profile 当 RPC 后端，内核仍自建。** 能消掉自制 `complete()`，但模块加载器和会话还是第二份。适合当迁移中的一步，不适合当终点。

## 迁移（按运行时切开，不按再拆职业）

每一阶段可跑、可发版。不在本 ADR 里重写 payments / monitor。

**H0 · 决策落地（本文）**  
文档承认顺序反了。`harness` 从「实验职业」降级为「过渡期入口」，不再新增对 iframe 的依赖。

**H1 · 对话改走 dsh，停掉自制 chat（已落地）**  
`AgentsService.chat` / `skillChat` 改为 `dsh --profile sdk` 的 JSON-RPC session，不再 `ctx.llm.complete`。中栏 `#harness-frame` 已删；`harness` 模板 `inRoster: false`，不再当可雇职业。分类器和待办拆解仍走原来的 Completions，留给 H3。

**H2 · 一个 SDK 进程，停掉双 spawn（已落地）**  
不再 `dsh web --port 0`，不再 fork `dsh --profile headless`。Local API `/agent/task` 走 `ctx.dshRuntime.prompt()`，请求里的 `profile` 忽略。对话唯一进程是 `--profile sdk`。`harness` 模块改为 `background` 占位，打开只回到工作台。

**H3 · 职业模块改注册 `ctx.tools`（已落地）**  
记下、刷新态势、收款同步、选品扫描挂在 OPC `ctx.tools`。中栏对话把工具目录写进人设；模型用 JSON 点名，主进程执行后再送回同一棵 SDK session。口令命中仍走原来的 bridge。Skill Route 不再额外一次 Completions 分类。五处 DeepSeek `fetch` 收口到 `ctx.llm.complete`。

**H4 · `dsh.bundle` / opc profile（已落地）**  
`examples/hello-module` 双写 `ownworkbuddy` 与 `dsh.bundle`。仓库里有 `profiles/opc/` 模板；`ensureOpcProfile` 落到 `$DSH_HOME/profiles/opc`。

**H5 · 内核按 bundle patch 组合（已落地）**  
`bootKernel` 不再手写 plugin 列表，顺序以 `src/kernel/cordis.patch.yml` / `applyOpcKernel` 为准。`packages/opc-kernel` 是可 `dsh plugin --profile opc add` 的标记 bundle（dsh 树上是空入口，避免碰 Electron API）。第三方 `dsh.bundle` 在工作台停用时，回写 `$DSH_HOME/profiles/opc/cordis.patch.yml` 的 `{ id: opc-<模块>, disabled: true }`。仍 `new Context()`：官方 `boot()` 进 Electron 会撞 asar 动态解析，留给下一刀。

**H6 · 职业工具包进 opc 层栈（已落地）**  
记下 / 刷新态势 / 收款同步 / 选品扫描做成 `packages/occupation-*` 标记 bundle（dsh 树上空入口，业务仍在 `src/modules/*.ts`）。内置 manifest 带 `dshBundle`，工作台停用回写 `opc-<id>`。首次对话会 `dsh plugin --profile opc add` 缺的职业包。

**H7 · 对话改走 `--profile opc`，对齐 0.1.5-rc.2（已落地）**  
`DshRuntimeService` spawn `dsh --profile opc`（不再 `--profile sdk`）。in-box 是官方 sdk 模板的 `[dsh-base, dsh-sdk-app]`；旧 opc 或 `dsh plugin` 按无名模板 init 后，`healOpcProfileManifest` 会补上 `dsh-sdk-app`。`@deepseek-ai/dsh` 锁在 `0.1.5-rc.2`。

**H8 · 随手记挂上 dsh `ctx.tools`（已落地）**  
`packages/occupation-notes` 用官方 `defineTool` 注册 `notes_add`。落盘是不碰 Electron 的 `note-file.js`；工作台把 `OPC_USER_DATA` 传给 opc 子进程，Panel 读同一份 `userData/notes.json`。不在这一刀重写收款 / 监控。Electron 仍保留 JSON 点名作为模型不用 native tool 时的退路。

**H8.1 · 工作台工具经 opc-kernel 代理上 dsh `ctx.tools`（已落地）**  
`packages/opc-kernel` 用 `defineTool` 把 Electron 工具目录挂上 dsh，执行 POST Local API `/agent/tools/invoke`。JSON 点名只作一轮退路。

**H9 · 续聊 resume，人设只在新建时塞一次（已落地）**  
会话 id 稳定为 `opc:<thread>:<agent>`。人设写进 preset，由 opc-kernel `systemPrompt.section` 读。进程重启先 `session/resume`，没有则 `session/load`。

**H10–H12 · dsh-base 当唯一文件系统 / 网页工具（已落地）**  
默认 `workspace-write`。Electron 不再注册撞名的 `fs_*` / `bash` / `web_fetch`。opc-kernel 覆盖 `subagent` 为只读、`maxDepth: 1`。

**0017 · extraResources host 门闩 + 让出官方槽位（已落地）**  
花名册是 `ctx.roster`，职业工具是 `ctx.opcTools`，分类 Completions 是 `ctx.completions`，模块 JSON 库是 `ctx.moduleStore`。官方 `boot()` 不再被花名册 / 模块库撞名。见 [0017](0017-dsh-boot-in-electron.md)。

**0023 · 弹药手当官方职业 bundle（已落地）**  
`packages/occupation-social-ammo` 用 `defineTool` 注册本职工具；in-process 不再教 JSON 点名；`tools/pre-execute` + `ctx.tools.restrict` 裁可见集。见 [0023](0023-dsh-native-occupation-tools.md)。

约束：

- H1 之前不要删职业 Panel，用户仍要能从左栏点到收款和监控。
- 待办仍是 OPC 内核服务，不做成可删职业（模块化 §5.1 仍成立）。
- 台伴继续独立窗。
- 权威业务数据仍在 `module-data/`，不拷进 dsh session 目录。

## 风险

| 风险 | 说明 | 对策 |
|---|---|---|
| dsh 仍是 rc，API 会变 | `@deepseek-ai/dsh@0.1.5-rc.2` 跟官方迭代 | 职业只依赖 `ctx.tools` / `ctx.llm` / `ctx.sessions` 这些公开缝；锁版本；profile 愈合走官方 launcher |
| 职业 Panel 在 dsh client 里变窄 | 台账、态势不是聊天气泡 | 右栏继续是 Panel 槽；client 插件渲染现有模块 UI，不把表塞进 assistant message |
| 花名册和 dsh agent 双份身份 | 成员 id 与 session agent 对不上 | OPC `AgentRecord` 继续当花名册；运行时 id 写进 preset / session meta，启动时同步 |
| 打包 asar 与 profile node_modules | 官方 desktop 用链接进 `$DSH_HOME/profiles/desktop` | 跟随官方 desktop 的资源布局，不把 dsh 核心塞进 asar 再动态 import |
| 迁移期三套对话 | 自制 chat + webview + headless job | H1 已砍自制 chat 和 iframe；H2 已合并 spawn |

## 验收

1. 中栏对成员说话时，模型可见上下文来自 dsh session 日志，而不是只读 `threads.json` 再一次 `chat/completions`。
2. 进程列表里，正常使用不再同时出现「工作台自建内核 + `dsh web` sidecar + headless job」三套 Agent 循环。
3. 职业能力至少有一条以 `ctx.tools` 注册，能在对话里被模型选中（例如记下、刷新态势），而不是只能走固定 bridge 回复。
4. `harness` 不再作为左栏可雇职业出现；DeepSeek 工作台不是第三种产品入口。
5. 台伴、托盘、待办到点、微信情报本机只读，行为不回归。
6. 包可以声明 `dsh.bundle` 并装进 `opc` profile；`ownworkbuddy` 不再是唯一模块形状。
