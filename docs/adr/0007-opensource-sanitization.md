# 开源清洗：只对齐机制，不带身份

公开主干可以对齐 DeepSeek Harness 组合宿主，但参考实现里的个人默认值、业务清单和身份标识不得进入本仓库。

## 允许复制

- 启动与组合：`boot` / desktop profile / extraResources host 布局
- 工具桥：`opc-kernel` 的 `defineTool` 代理、Local API catalog / invoke / approval
- 执行上下文：session id、preset、cwd header、身份目录算法、附件指针
- 开口三档的数据模型（问 / 计划 / 动手）与写闸
- 官方缝的用法：`ctx.tools`、`ctx.sessions`、`systemPrompt.section`、`tools/pre-execute`

## 禁止进入主干

- 个人站点清单、真实 catalog、社媒签名、公众号作者、工作流 ID
- 打包签名、公证 Team ID、已签名 `.app` / `.dmg`、`.env`、真实 `userData`
- 能标识运营者的默认路径、测试夹具、产品别名
- 参考仓独有职业及其 SOP、上线目标、设计系统、bundled skill 正文
- 参考仓整份产品词表（只吸收运行时词：运行环境、执行上下文、开口模式、身份目录）
- 产品线枚举写成公司名。目录分组用中性 id（`research` / `toolkit`）；旧 catalog 里的 `bitou` / `solokit` 只当读入别名
- 把 `appId`、旧 userData 目录名当成品牌默认值。它们只是安装身份和迁移别名，值不能改，避免拆开已装用户

## 身份目录

默认段是公开产品名：`OPC-Fellows/agents`。测试路径只用 `/tmp/opc-fellows/agents/...` 这类占位。旧 `userData/workspaces` 不自动搬家。

## 落地检查

每阶段合并前用搜索扫品牌私有路径、真实域名、密钥、Team ID。示例数据继续走 [`examples/catalog.example.json`](../../examples/catalog.example.json)。
