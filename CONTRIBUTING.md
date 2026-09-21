# 贡献指南

[English](CONTRIBUTING.en.md)

欢迎改**主干契约**。不要把真实站点目录、签名或密钥默认值写进默认代码。

词表以 [CONTEXT.md](CONTEXT.md) 为准：界面写「成员」不写 Agent，写「项目」不写 Team / Workspace。模块化边界见 [docs/module-architecture-design.md](docs/module-architecture-design.md)。Agent 运行时进 dsh、Electron 只留薄壳，见 [docs/adr/0005-dsh-as-composition-host.md](docs/adr/0005-dsh-as-composition-host.md)。默认值与身份标识的边界见 [docs/adr/0007-opensource-sanitization.md](docs/adr/0007-opensource-sanitization.md)。身份目录默认落在 `~/OPC-Fellows/agents/{标题}`。

## 贡献声明

1. 提交 Pull Request 即表示你把该次贡献按 [MIT License](LICENSE) 授权给本项目，并确认你有权这样授权。
2. 你保证贡献里**没有**别人的密钥、聊天记录、收款流水、未授权的版权材料，也没有你自己的生产凭据。
3. 你同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
4. 版权仍归各位作者；许可证要求保留版权与许可声明。维护者是 [bitou.tech](https://pen.bitou.tech/)。

不另签 CLA。许可条件以 MIT 全文为准。

## 环境

- Node.js `^22.19.0` 或 `>=24.0.0`
- pnpm 10+

```sh
pnpm install
cp .env.example .env   # 可选；不要提交真实 .env
pnpm dev
pnpm test
```

`pnpm test` 覆盖 `src/shared`、`src/kernel` 与 `src/main` 单测。改到工具栏 / 首页 / 日历 / 工具包弹窗布局时，再跑对应的 `pnpm test:layout`、`test:home-board`、`test:calendar`、`test:packs`。

不要提交 `.env`、本机 `userData`、证书、公证身份，或 `dist/` 里已签名的 `.app` / `.dmg`。

## 改哪里

| 范围 | 目录 | 适合的 PR |
| --- | --- | --- |
| 内核 | `src/kernel/` | 外壳、待办、IPC 桥、模块仓库、capability、成员 / 项目 |
| 内置职业 | `src/modules/`、`packages/occupation-*`，以及仍散落的 `src/main` / `src/renderer` | Panel 与 `ctx.tools` 在 `src/modules`；dsh 层栈是标记 bundle |
| 示例 | `examples/` | 第三方模块最小可运行样例 |
| 文档 | `README.md`、`README.zh-CN.md`、`docs/`、`CONTEXT.md` | 契约说明；不要把个人操作手册写进文档 |

新功能加模块，不改内核的视图联合类型。跨模块只走内核服务（例如 `todos.ingestAgent`），不要直连对方 store。

第三方模块的形状见 [`examples/hello-module`](examples/hello-module)：`ownworkbuddy`（工作台 Panel）+ `dsh.bundle`（`dsh plugin --profile opc add`）双写 + `apply(ctx)` + 可选 `mount(root, api)`。只声明用得到的 capability；`subprocess` / `secrets` / `net:listen:*` 是高危项，能不用就不用。

## 好上手的第一刀

- 按 [docs/i18n-plan.md](docs/i18n-plan.md) 抽英文词条（界面现在全是中文硬编码）
- 再写一个 `examples/` 模块，验证第三方安装路径
- 给某个职业补 `*.test.ts`
- 把含糊的 Issue 标成 `good first issue` 并写清验收标准

## 不要做

- 把 `products.ts`、社媒签名、默认项目标签、选品来源清单当成「项目自带的数据」继续加长。这些是用户配置，应保持默认值为空。
- 在公开 Issue / PR 里贴 API key、聊天记录、收款流水或用户数据。
- 为了一个职业去改 preload 或内核导航白名单。模块自己注册 nav / IPC。
- 在界面文案里把成员写成 Agent、把项目写成团队。
- 把本机绝对路径、Apple Team ID、公证钥匙串 profile 写进仓库。
- 把真实 catalog、上线目标、设计系统或非公开品牌路径写进主干。机制可以对齐，内容必须重写。

破坏 `ownworkbuddy` manifest 或 `Capability` 联合类型的改动，PR 里必须写清迁移方式。

## Pull Request

1. 从最新 `main` 开分支。标题说清改的是内核、某个模块，还是文档。
2. 描述里写：行为变化、是否破坏 manifest / capability、怎么验证。
3. 本地 `pnpm test` 通过后再开 PR。
4. 一个 PR 只做一件事。契约变更和某个职业的功能不要混在一起。
5. 勾选 PR 模板里的「没有密钥 / 没有个人目录默认值」。

Issue 同样写清范围。安全漏洞不要开公开 Issue：走 [SECURITY.md](SECURITY.md)。

## 许可

提交即按 [MIT License](LICENSE) 授权。版权归各位作者与 [bitou.tech](https://pen.bitou.tech/)。
