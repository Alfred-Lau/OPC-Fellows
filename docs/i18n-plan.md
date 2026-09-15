# OPC-Fellows 国际化改造方案

状态：待评审。本轮只定方案，不改代码。
默认语言：`zh-CN`（现有文案即源语言）。第一批目标语言：`en`。
产品词表以 [CONTEXT.md](../CONTEXT.md) 为准，英文界面不得把「成员」译成 Agent、把「项目」译成 Thread。

---

## 1. 为什么现在做

架构文档已点名：**UI 文案 100% 中文硬编码**，公开仓库需要补 i18n。当前仓库已经不是单页待办：左栏身份、中栏会话、右栏 Panel、托盘菜单、桌面通知、Skill Route 回复都在对人说话。不做统一词表，后面每加一个模块都会再复制一份中文。

已有的双语只出现在业务数据里，不是界面 i18n：

| 现状 | 说明 |
|---|---|
| `OpcProduct.name` / `nameEn`、`pitch` / `pitchEn`、`tagsZh` / `tagsEn` | 社媒弹药按平台选中英，和 UI 语言无关 |
| `localeCompare(..., 'zh')`、`toLocaleDateString('zh-CN')` | 排序和日期写死中文 |
| `src/main/time.ts` 的「明天 / 小时后 / 周X」 | 待办自然语言解析，是中文 NLP，不是 UI |
| 无 `i18n` 依赖、无 locale 偏好、设置里没有语言项 | 从零建 |

---

## 2. 目标与非目标

### 目标

1. 界面、菜单、托盘、系统通知、对话框、空态、报错、成员模板、模块 manifest、Skill Route **回复** 全部走词表。
2. 用户可在设置里选「跟随系统 / 中文 / English」，切换后立即生效，不必重启（对齐主题）。
3. 词条类型安全：写错 key 编译失败。
4. 主进程和渲染进程共用同一套词表与 `t()`，避免两套翻译。
5. 第一批只做 `zh-CN` + `en`。词表结构按命名空间拆，方便以后加语言。

### 非目标（本轮不做）

| 不做 | 原因 |
|---|---|
| 用户自己写的内容（待办、笔记、项目名、成员显示名、手录财务） | 数据，不是 UI |
| 已雇佣成员落库的 `title` / `persona` | 雇佣当下按当时语言生成；已有中文名不回写 |
| 默认标签 `#OPC项目`、社媒签名 | 用户可改的工作情况，不是界面词 |
| 产品目录里的站点中英名字 | 已是内容字段；设置页标签才走 i18n |
| 代码注释、ADR、CONTEXT.md、README | 内部文档继续中文 |
| 第三方模块自带文案 | 它们自己的 `title` 原样显示；内置模块才收进词表 |
| 把 LLM 系统提示全翻译 | 模型指令另议；UI 语言和提示语言可以不同 |
| i18next / FormatJS / 云翻译平台 | 对本仓库过重，见 §4 |
| 繁体、日语等第三语言 | 结构预留，本轮不译 |

---

## 3. 文案盘点（按层）

数字是「含中文的行数」粗估，用来排期，不是精确 key 数。

| 层 | 规模 | 典型内容 | 优先级 |
|---|---|---|---|
| `src/renderer/index.html` | ~400 处 | 侧栏、设置、今日、新任务、右栏、各模块静态壳 | P0 外壳 + 按模块拆 |
| `src/renderer/src/*.ts` | 约 600+ | `createElement` 动态文案、hint、空态 | 跟对应页面 |
| `src/renderer/pet.html` + `pet.ts` | 少 | 台伴独立窗 | P1 |
| `src/kernel/main/shell.ts` | 菜单 / 托盘 | 「打开工作台」「退出」 | P0 |
| `src/kernel/main/boot.ts` | 导航贡献 | 「待办拆解」「扩展」 | P0 |
| `src/kernel/shared/templates.ts` | 12 个职业模具 | role / description / persona / mark / group | P1 |
| `src/modules/*.ts` | 12 个 manifest + nav | title / description / group / mark | P1 |
| `src/kernel/shared/agent.ts` `module.ts` | 状态句 | 「可用」「运行中」「需要配置」 | P1 |
| `src/shared/skill-route.ts` | ~129 | Skill 回复、表格表头 | P2 |
| `src/shared/*.ts` 标签表 | 中等 | 订阅状态、idea 管线、微信分流 | P2 |
| `src/main/*-sync.ts` `todo-notify.ts` | 通知 / 对话框 | 桌面通知标题、选文件、导出 | P2 |
| `src/main/time.ts` `decompose.ts` | NLP / 拆解 | **不进词表**，见 §6.4 | — |
| `scripts/*-fixture.html` | 布局夹具 | 只跟测试走，最后同步 | P3 |
| `electron-builder.yml` | 1 句 | 通知权限说明 | P3 |

渲染层按文件（含中文行， ripgrep 计数）：

| 文件 | 行 | 文件 | 行 |
|---|---|---|---|
| `index.html` | 402 | `monitor.ts` | 141 |
| `payments.ts` | 115 | `micro-sourcing.ts` | 67 |
| `studio.ts` | 42 | `social.ts` | 40 |
| `wx-draft.ts` | 39 | `settings.ts` | 28 |
| `app.ts` / `todos.ts` / `wechat-hub.ts` / `skill-invoke.ts` | 22 | 其余 | <20 |

`shared` 里最重的是 `skill-route.ts`、`payments.ts`、`micro-sourcing.ts`、`products.ts`（产品内容）、`traffic-insights.ts`。

---

## 4. 技术方案

### 4.1 不引入 i18next

本仓库是 Electron + 原生 DOM，没有 React/Vue。i18next 的插值、命名空间、ICU 用得上的部分，几十行类型安全封装就能覆盖。多一个运行时依赖，还要同时进 main / renderer / 测试，不值。

自研内核要求：

- 嵌套对象词表，点号 key：`t('rail.search')`
- `{name}` 插值，不支持 HTML 插值（调用方自己拼 DOM）
- 复数：本轮只用「带数量的整句」`t('prefs.modules.allOn', { count })`，不引入 ICU
- `zh-CN.ts` 是 **key 的唯一类型源**；`en.ts` 必须 `satisfies` 同一形状，缺 key 编译失败
- 主进程、渲染进程、`shared` 纯函数都能 `import { t } from '../shared/i18n'`

### 4.2 目录

```
src/shared/i18n.ts              ← Locale、resolveLocale、t、setLocale
src/shared/locales/zh-CN.ts     ← 源语言词表（类型源）
src/shared/locales/en.ts        ← 英文，satisfies Messages
src/shared/i18n.test.ts         ← 两边 key 对齐、插值、回落
src/main/locale.ts              ← 持久化 + IPC，镜像 theme.ts
src/renderer/src/i18n-dom.ts    ← 扫 [data-i18n] / [data-i18n-attr]
```

词表按命名空间拆对象，单文件先可接受；超过 ~400 key 再按 `locales/zh-CN/shell.ts` 切开，对外仍 `export const zhCN = { ...shell, ...todos }`。

建议首批命名空间：

```
shell          侧栏、用户中心、托盘、应用菜单、搜索
prefs          设置页（我 / 外观 / 工作情况 / 关于）+ 语言项
studio         中栏会话、新任务、雇成员、今日
todos          待办、拆解、标签空态
calendar       日程
modules        扩展页、模块状态
occupation     职业模板、分组、单字印
monitor / micro / payments / social / accounts / wxhub / mail / wxdraft / notes / pet / harness
notify         桌面通知、系统对话框
skill          Skill Route 回复与表头
```

### 4.3 Locale 生命周期（抄主题）

主题已经是「主进程落盘 → IPC → 全窗广播 → 渲染层改 DOM」。语言走同一条路：

```
userData/locale.json     { "preference": "system" | "zh-CN" | "en" }
app.getLocale()          preference === system 时映射：zh* → zh-CN，其余 → en
html[lang]               zh-CN | en
document.documentElement.dataset.locale
```

IPC（与 `theme:*` 并列）：

- `locale:get` → `{ preference, locale }`
- `locale:set(preference)`
- `locale:changed` 广播到所有 `BrowserWindow`（含台伴）

启动顺序：

1. `initLocale()` 在建窗之前跑，菜单 / 托盘第一次就能用对的语言。
2. `index.html` 里现有 theme 的 inline script 旁加：读不到偏好时先用 `navigator.language`，避免中文闪一下再切英文。
3. preload 暴露 `window.ownworkbuddy.locale`，对齐 `theme`。

设置页：「外观」下增加语言三项——跟随系统 / 中文 / English。不要单独开一节。

### 4.4 HTML 静态文案

`index.html` 体量大，不把整页改成 JS 拼接。约定：

```html
<span class="nav-label" data-i18n="shell.rail.search">搜索</span>
<button title="搜索" data-i18n-attr="title:shell.rail.search"></button>
<input data-i18n-attr="placeholder:studio.composer.placeholder" />
```

- 元素**文本**用 `data-i18n`
- `title` / `placeholder` / `aria-label` 用 `data-i18n-attr="attr:key"`
- HTML 里保留中文，作为无 JS / 测试夹具的回落
- `hydrateI18n(root)` 在 locale 就绪和 `locale:changed` 时各跑一次
- 动态节点（`createElement`）禁止再写中文，一律 `t('...')`

`pet.html` 同样处理。

### 4.5 动态文案与「会说话的 shared」

三类函数必须改成读当前 locale，而不是返回写死中文：

| 函数 | 现在 | 改法 |
|---|---|---|
| `describeAgentStatus` / `describeStatus` / `describeAgentKind` | 中文 switch | `t('occupation.status.ready')` |
| `STATUS_LABEL`、`SUBSCRIPTION_STATUS_LABEL`、`WECHAT_TRIAGE_LABELS` 等 | `Record<Enum, string>` | 改成 `label(enum)` 函数，内部 `t()`；或 `Record<Enum, MessageKey>` |
| `formatMonitorRefresh`、`formatWxToday`、`closedIdeaReply` 等 | 拼中文 Markdown | 用 `t()` 拼；表格表头也走词表 |

这些函数在 main（Skill Route）和 renderer（面板）都会调用，所以必须放在 `shared`，依赖 `getLocale()`，不能只在 renderer 里包一层。

`getLocale()` 实现：

- 渲染进程：内存里的当前 locale（IPC 灌入）
- 主进程：`locale.ts` 里的权威值
- 单测：`setLocale('zh-CN')` 固定，默认中文，现有断言少改

### 4.6 模块 manifest 与导航

现在 title / mark / description / group 在 `src/modules/*.ts` 和 `ctx.workbench.nav({ title })` 各写一次。改成：

```ts
titleKey: 'modules.monitor.title'
markKey: 'occupation.monitor.mark'
descriptionKey: 'modules.monitor.description'
groupKey: 'occupation.group.project'
```

渲染和菜单在**读的时候** `t(titleKey)`。`NavEntry.title` 仍可以是已翻译字符串（主进程发给渲染层的快照），locale 变更时重算导航并广播 `workbench:changed`（现有通道已能刷新侧栏）。

第三方模块没有 key：继续用它们自带的 `title` 字符串。

### 4.7 职业模板

`BUILTIN_TEMPLATES` 的 `role` / `description` / `persona` / `mark` / `workspaceName` / `group` 改为 key，或保留中文字段作回落、另加 `*Key`。雇佣时：

- 新成员的 `title` 写成 **当时 UI 语言** 的 `role`
- 已存在成员不改名
- 雇成员面板上的模具列表始终按当前语言显示（读模板 key，不读已落库实例）

单字印（`监` / `选` / `收`）：英文用短拉丁（`Mo` / `Mi` / `$`）或保留汉字作视觉符号。**推荐英文也给 1–2 个字母印**，避免侧栏中英混排。产品词（OPC、Skill、Panel）两语都不译；用户目录里的产品线名称保持原样。

### 4.8 日期、数字、排序

| API | 现状 | 目标 |
|---|---|---|
| `toLocaleDateString('zh-CN', …)` | 写死 | `toLocaleDateString(intlLocale())` |
| `localeCompare(..., 'zh')` | 写死 | `localeCompare(..., intlLocale())` |
| 日历星期 `['日','一',…]` | 写死 | `t('calendar.weekday.sun')` 等 |
| `Intl` 货币 | 财务已有 CNY 格式 | 标签走 i18n，数字格式可继续 `zh-CN` 或随 locale |

`intlLocale()`：`zh-CN` → `zh-CN`，`en` → `en`。

周起始：中文习惯周一，英文习惯周日。现有 `startOfWeek` 按周一。**本轮不改周起始**，只译文案，避免日历测试和「本周」语义分叉。

### 4.9 Skill Route：匹配双语，回复随界面

匹配规则（见 `docs/adr/0002-skill-route-matching.md`）今天按中文口语。英文 UI 下用户会说 `refresh snapshot` / `scan pain`。

本轮约定：

1. **触发词表双语并存**，匹配不看 UI 语言。中文「刷新态势」和英文 `refresh` 都能命中同一条 Skill。
2. **回复跟 UI 语言**。`formatMonitorRefresh()` 等走 `t()`。
3. 用户原文、Idea 标题、站点名、金额原文插入，不翻译。
4. 中文 NLP（`parseNotifyAt`、拆解、微信分流正则 `未成交|lost`）保持中英都认；英文补 `in 10 minutes` / `tomorrow` 放到 **单独一期**，不阻塞 UI i18n。

口语 Trigger 的英文写法写进 `src/shared/locales/en.ts` 的 `skill.trigger.*`，匹配器读「当前语言 + 中文源」两套，避免只会英文的用户唤不出来。

---

## 5. 产品词英译（必须先钉）

界面英译以 CONTEXT.md 的 _Avoid_ 为准。下面是本轮锁定的对照，实现时放进 `occupation` / `studio` 词表，不允许临场发挥。

| 中文（界面） | English | 不要写成 |
|---|---|---|
| OPC | OPC | team, workspace, org |
| 成员 | Member | Agent, bot |
| Template / 职业模具 | Template | marketplace, module switch |
| 主对话 | Home chat | thread, default session |
| 项目 | Project | thread, chat, repo |
| 主成员 | Lead member | main agent |
| 今日 | Today | Inbox, Home |
| Skill | Skill | command, plugin |
| Kernel Skill「拆成待办」 | Break into todos | write todos |
| Trigger | Trigger | slash command |
| Panel | Panel | stage, page |
| Artifact | Artifact | file, result |
| 雇成员 | Hire | new agent |
| 台伴 | Desk companion | pet（代码 id 可仍叫 pet） |
| 待办 | Todos | tasks（日历用 Schedule） |
| 扩展 | Extensions | plugins |
| 工作情况 | Catalog | workspace settings |
| 自媒体运营达人 | Creator hire | fourth content job |

品牌名不译：OPC-Fellows、DeepSeek、Creem、Vercel、微信、小红书、抖音、视频号。用户填写的产品线名称保持原样。

---

## 6. 分层改造规则

### 6.1 渲染层

- 静态：`data-i18n` + hydrate
- 动态：`t()`
- `confirm()` / `placeholder` / `title` 全部 key 化
- locale 变更时：已挂载的 view 再 `render*()` 一遍；`app.ts` 听 `locale:changed` 调现有 activate 函数，不要发明第二套路由

### 6.2 主进程

- `shell.ts` 菜单 / 托盘 label 用 `t()`，`locale:changed` 时走现成的 `rebuild`
- `Notification({ title, body })` 用 `notify.*`
- `dialog.showOpenDialog({ title })` 用 `notify.dialog.*`
- `electron-builder.yml` 的 `NSUserNotificationsUsageDescription` 最后再改；英文包可用 `mac.extendInfo` 或接受中文一句（个人包可延后）

### 6.3 内核

- `registerKernelNav`、各模块 `ctx.workbench.nav` 只存 key 或在注册时翻译
- `needsConfig('缺少 OWNWORKBUDDY_STATS_KEY…')` 改 key；这是给设置页看的
- 仓库 / 模块日志：开发者向的英文 id 可保留，面向用户的一句走 i18n

### 6.4 明确不翻译的主进程逻辑

- `src/main/time.ts`：中文时间口令
- `src/main/decompose.ts`：拆解提示词与中文规则
- `src/main/micro-sourcing-llm.ts`、`social-copy-llm.ts`、`wx-draft-llm.ts`：模型提示
- `src/shared/social-copy.ts`：六平台文案本身已按平台中英分流
- 用户数据 JSON、git 仓库名、URL

---

## 7. 分阶段施工

每一阶段结束都必须：`pnpm test` 绿、中文界面观感不回退、英文能完整点完该阶段页面。

### P0 — 管道（约 1 天）

1. `src/shared/i18n.ts` + `zh-CN.ts` / `en.ts`（先只收 shell + prefs + 语言三项）
2. `src/main/locale.ts` + preload 类型
3. 设置「外观」增加语言开关，广播后改 `document.documentElement.lang`
4. `hydrateI18n` 先覆盖侧栏、用户中心、设置页静态节点
5. `shell.ts` 托盘 / 菜单
6. 单测：key 对齐、system locale 映射

验收：切到 English，侧栏和设置变英文；切回中文与现在一致。模块页仍可以是中文。

### P1 — 工作台外壳（约 2 天）

- 今日看板、新任务、中栏 composer、右栏 tool rail、日程、待办壳、搜索、雇成员面板
- `studio.ts` / `app.ts` / `todos.ts` / `calendar.ts` / `search.ts` / `prefs.ts` 动态句
- 职业模板 + 12 个内置模块 manifest / nav
- `describeAgentStatus` / `describeStatus`

验收：不打开具体业务 Panel 的情况下，英文可完成「雇一个成员 / 开项目 / 写待办 / 改设置」。

### P2 — 业务模块（约 4–5 天，按依赖从浅到深）

建议顺序（后一个常引用前一个的词）：

1. notes、pet  
2. monitor  
3. social-ammo、accounts、x-push（设置页提示即可）  
4. micro  
5. wx-draft  
6. wxhub  
7. mail  
8. payments  
9. harness 状态句  

同时收：各模块 `shared` 标签表、Skill Route 回复、桌面通知。

每个模块：HTML 标 key → TS `t()` → shared formatter → 该模块测试里对 UI 句的断言改为 `t()` 或同时断言中英。

### P3 — 收尾（约 1 天）

- 布局夹具里的中文标题与产品同步（`test:layout` / `test:home-board` / `test:calendar`）
- 过长英文：侧栏 `nav-label`、按钮、财务表格；必要时 CSS `lang=en` 微调，不改中文版
- `electron-builder` 通知权限句
- README 加一句「Settings → Appearance → Language」
- 本方案标为已落地，开 ADR `0004-i18n.md` 只记决策，不抄全文

---

## 8. 测试策略

| 类型 | 做法 |
|---|---|
| 词表契约 | `Object.keys` 深度对比 zh / en，缺 key 失败 |
| 纯函数 | `setLocale` 后断言 `t()`；旧测试默认 `zh-CN`，中文期望可保留 |
| Skill Route | 中文触发回归 + 新增 2–3 条英文触发；回复在 `en` 下抽检一条 |
| 布局 | 夹具仍以中文为主；英文另开不是本轮必须，除非 P3 发现明显溢出 |
| 禁止 | 不要为 i18n 去改 NLP / 拆解 / 选品打分测试的语义 |

现有测试里大量中文期望（`agents.test.ts`、`skill-route.test.ts`、`new-task.test.ts`）。P0 把 `getLocale()` 默认 `zh-CN` 后，这些测试应继续绿。谁改谁的 formatter，谁才改对应断言。

---

## 9. 风险

| 风险 | 对策 |
|---|---|
| `index.html` 400+ 节点漏标 | P0 先做外壳；P2 按 view 扫中文；可用脚本列「仍含 CJK 且无 data-i18n」的节点 |
| 英文比中文长，侧栏 / 按钮挤爆 | P3 用 `lang=en` 样式；单字印改短拉丁 |
| Skill 英文唤不醒 | 匹配双语；CONTEXT 里的 Skill 中文名当规范名，英文是 Trigger 别名 |
| 已雇成员仍是中文名 | 接受。设置里不提供「按语言重命名职业」 |
| 切换语言后右栏 Panel 不刷新 | 一律走现有 `onChanged` / 再调 `activateX()` |
| shared 在测试里未 `setLocale` | `i18n.ts` 默认 `zh-CN` |
| 翻译走样违反 CONTEXT | §5 对照表；英译由人审 occupation / studio，业务模块可先机器再扫 |

---

## 10. 建议决策（评审时拍板）

1. **自研 `t()`，不引入 i18next。**
2. **语言：`system` / `zh-CN` / `en`，持久化抄 `theme.json`。**
3. **zh-CN 为类型源；HTML 留中文作回落。**
4. **Skill 匹配双语，回复跟 UI 语言。**
5. **时间口令、拆解、LLM 提示本轮不动。**
6. **先 P0 管道，再外壳，再按模块收。不一次全仓库替换。**

评审通过后按 P0 → P1 → P2 → P3 开工。若只要英文能用、中文零回归，不要跳过 P0 直接改业务文件。
