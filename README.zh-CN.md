<p align="center">
  <img src="docs/cover.png" alt="OPC-Fellows — 一人公司的本地优先工作台" width="100%">
</p>

<p align="center">
  <strong>OPC-Fellows</strong> · 把职业做成能对话的成员，接到你自己的业务上<br>
  内核只留外壳、待办与契约；开源花名册默认是主理人和社媒弹药手。
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">中文</a>
</p>

<p align="center">
  <a href="https://github.com/Alfred-Lau/OPC-Fellows/stargazers"><img src="https://img.shields.io/github/stars/Alfred-Lau/OPC-Fellows?style=flat-square" alt="GitHub stars"></a>
  <a href="https://github.com/Alfred-Lau/OPC-Fellows/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Alfred-Lau/OPC-Fellows/ci.yml?style=flat-square&label=CI" alt="CI"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-1f6feb?style=flat-square" alt="dsh-plugin"></a>
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/runtime-DeepSeek%20Harness-000?style=flat-square" alt="DeepSeek Harness"></a>
  <a href="https://github.com/cordiverse/cordis"><img src="https://img.shields.io/badge/kernel-Cordis-6f42c1?style=flat-square" alt="Cordis"></a>
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/desktop-Electron%2043-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-e8bc6c?style=flat-square" alt="MIT License"></a>
</p>

<p align="center">
  <a href="#十五分钟接到你的业务">接到你的业务</a> ·
  <a href="#你的活对应哪个职业">职业对照</a> ·
  <a href="#下载安装包">安装包</a> ·
  <a href="#缺能力就写模块">写模块</a> ·
  <a href="#架构">架构</a> ·
  <a href="#贡献">贡献</a>
</p>

你是开发者，同时一个人扛销售、内容、研究和账。这张工作台不是再介绍一遍「本地优先桌面应用」，而是让你 **clone 之后，把成员雇到自己的文件夹和站点上，当天就能干活**。

数据在本机 `userData`，模型密钥走「设置 → 模型」的 `safeStorage`，没有账号、不上传、无遥测。默认产品目录是空的——填你自己的站，不要用别人的。

## 十五分钟接到你的业务

需要 Node.js `^22.19.0` 或 `>=24.0.0`，pnpm 10+。第一次 `pnpm install` 会下载 Electron，会多等一会儿。

```sh
git clone git@github.com:Alfred-Lau/OPC-Fellows.git
cd OPC-Fellows
pnpm install
pnpm dev
```

然后按这个顺序接到**你的**业务，不要先读架构：

1. **钥匙** — 设置 → 模型，粘贴 DeepSeek API Key。也可以 `export DEEPSEEK_API_KEY=…`（环境变量优先）。没 key 成员开不了口。
2. **雇人** — 开源花名册默认只有 **主理人** 和 **社媒弹药手**。点开即进主对话。左栏 `+` 目前只能再打开社媒弹药手（单例）。
3. **绑目录** — 雇进来时选定身份目录。默认 `~/OPC-Fellows/agents/{标题}`，更好的做法是绑到你真正改代码、写稿、对账的文件夹。之后可改绑，不自动搬家。
4. **登记你的站** — 设置 → 工作情况 → 添加产品。社媒弹药认的是这里，不是仓库里的示例。形状见 [`examples/catalog.example.json`](examples/catalog.example.json)。
5. **开口** — 输入框三档：**问**（只读）、**计划**（先方案，回复「按计划执行」才改文件）、**动手**（直接改工作区）。先用「问」摸底，确认后再动手。

可选：

```sh
cp .env.example .env          # 不要把真实 .env 提交上去
pnpm test                     # 内核与 shared 单测
pnpm dsh                      # 本机 DeepSeek Harness CLI
```

打包用 `pnpm run pack`（目录）或 `pnpm dist:mac`。不要写 `pnpm pack`，那会打出 npm tarball。

词表（成员 / 项目 / 身份目录 / 开口模式）见 [CONTEXT.md](CONTEXT.md)。

## 你的活对应哪个成员

开源版本花名册只留两个身份。其它职业模块还在仓库里，默认停用，不会再自动长成成员。

| 你手头的事 | 谁来做 |
| --- | --- |
| 读改工作区、跑命令、先计划再动手 | 主理人（每个项目的默认主成员） |
| 按产品能力出多平台文案 | 社媒弹药手（先在工作情况里登记你的站） |

工作情况里登记站点后，弹药手才认你的产品。环境变量备忘：

| 变量 | 用途 |
| --- | --- |
| `DEEPSEEK_API_KEY` | 覆盖「设置 → 模型」；仍可读 `~/.dsh` 遗留 |
| `OPC_USER_DATA` | 传给运行时的 userData |

多人合作的一件事走**项目**：至少一名成员，没 @ 时只有主成员听见。今日是全局收件箱，不是项目。

## 下载安装包

不想跑源码时，用 [v0.8.1](https://github.com/Alfred-Lau/OPC-Fellows/releases/tag/v0.8.1)（目前只有 macOS Apple Silicon）。

- [dmg](https://github.com/Alfred-Lau/OPC-Fellows/releases/download/v0.8.1/OPC-Fellows-0.8.1-mac-arm64.dmg) — 拖进「应用程序」
- [zip](https://github.com/Alfred-Lau/OPC-Fellows/releases/download/v0.8.1/OPC-Fellows-0.8.1-mac-arm64.zip)

构建已做 Apple 签名与公证，拖进「应用程序」后直接打开即可；若因离线等原因首次启动被拦，执行一次：

```sh
xattr -cr "/Applications/OPC-Fellows.app"
```


**从 v0.7.3 升级注意：** 本版的应用名是 **OPC-Fellows**，因此会以全新的工作区启动 —— 旧版把数据放在 `~/Library/Application Support/OPC Agent Team - Solokit`，新名字不会去读它。

屏幕上的名字仍是 **OPC Agent Team - Solokit**（改名会迁移 `userData`，留到后续版本）。接到业务的步骤和从源码启动相同：模型 key → 雇成员 → 绑目录 → 工作情况。

## 扩展花名册：加你自己的成员

本主干只带两个成员，但那是**默认配置而不是上限**：一个成员 = 一个职业 + 它背后的模块，内核里没有任何一处是为某个职业特写的。遇到没有的职业，请加一个成员，而不是去改内核。

内置职业盖不住你的业务时，加一个 npm 包，不要改内核联合类型。工作台读 `ownworkbuddy`（`apply(ctx)` + 可选 `mount`）；运行时读 `dsh.bundle`。过渡期两份都写。最小示例：[`examples/hello-module`](examples/hello-module)。

```json
{
  "main": "dsh-plugin.js",
  "ownworkbuddy": {
    "id": "hello",
    "title": "你好",
    "kind": "view",
    "main": "index.js",
    "capabilities": [],
    "ui": "ui.js"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" }
  }
}
```

```js
export default function apply(ctx) {
  ctx.workbench.nav({ id: 'hello', title: '你好', mark: '你', kind: 'view', order: 200 })
  ctx.bridge.handle('hello:ping', () => ({ ok: true, at: new Date().toISOString() }))
}
```

「扩展」页从本地目录或 Git 安装。进 Harness 层栈：

```sh
pnpm dsh plugin --profile opc add ./examples/hello-module
```

模块只能调用 manifest 声明的 capability。未声明的调用会被拒绝；`subprocess` / `secrets` 安装时单独确认。跨模块不要直连 store，只走内核服务（例如 `todos.ingestAgent`）。

## 架构

Electron 是薄壳。对话和工具走 DeepSeek Harness；内核花名册、待办、模块仓库挂在同一棵树上。设计见 [ADR 0005](docs/adr/0005-dsh-as-composition-host.md) 和 [docs/module-architecture-design.md](docs/module-architecture-design.md)。外壳心智（成员 / 项目 / Skill）见 [docs/agent-workspace-design.md](docs/agent-workspace-design.md)。

```
src/kernel/     启动、IPC、存储、待办、导航、模块仓库、成员
src/modules/    内置职业（参考实现）
examples/       第三方模块最小示例
server/         可选自托管参考后端（独立包）
docs/           架构与 ADR
```

`server/` 是可选的自托管参考后端：给想把自己的全栈应用部署起来的用户一份起步模板。它刻意不在桌面端构建里 —— 有自己的 `package.json`、不在任何 pnpm workspace、桌面端没有任何代码 import 它。见 [server/README.md](server/README.md)。

运行时是 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)。同类桌面宿主见 [github.com/topics/dsh-plugin](https://github.com/topics/dsh-plugin)。

作者用这张台跑 [SoloKit](https://www.solokit.run/) 和 [榆关](https://pen.bitou.tech/)。那是一份配置，不是主干默认值。

## 贡献

公开主干：[Alfred-Lau/OPC-Fellows](https://github.com/Alfred-Lau/OPC-Fellows)。欢迎改内核服务、模块 manifest、capability、示例和文档。

不要把个人站点清单、签名身份、真实密钥或本机绝对路径写进 `src/shared`。身份目录默认 `~/OPC-Fellows/agents/{标题}`。对齐私有参考树只复制机制，见 [ADR 0007](docs/adr/0007-opensource-sanitization.md)。

- [贡献指南](CONTRIBUTING.md) · [Contributing (English)](CONTRIBUTING.en.md)
- [行为准则](CODE_OF_CONDUCT.md) · [安全披露](SECURITY.md)
- 好上手：补英文词条、写 `examples/` 模块、给某个职业加测试

UI 仍是中文硬编码，方案见 [docs/i18n-plan.md](docs/i18n-plan.md)。提交即按 [MIT License](LICENSE) 授权。

## 安全

- 业务数据在本机 `userData`，不经过项目自己的服务器。（`server/` 是**你自己**部署、自己掌控的可选示例，它不接收桌面端数据。）
- 微信情报只读本机索引；邮件只整理、写草稿，不代发。
- 第三方模块按 capability 白名单运行。
- 漏洞走 [SECURITY.md](SECURITY.md)，不要在公开 Issue 里贴凭据。

## 许可

[MIT License](LICENSE)。运行时依赖 [Cordis](https://github.com/cordiverse/cordis) 与 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。

站点：[OPC-Fellows](https://opc-fellows.solokit.run/) · 维护者 [bitou.tech](https://pen.bitou.tech/)
