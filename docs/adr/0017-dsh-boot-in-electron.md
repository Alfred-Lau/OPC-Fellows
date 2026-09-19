# 官方 boot 进 Electron：先过 asar 门闩

官方入口是 `dsh-app-boot` 的 `boot()` + `$DSH_HOME/profiles/desktop`。asar 里动态 import 会失败，所以 host 放 extraResources / `build/dsh-host`。

产品入口先 `loadLayeredEnv` + `installFailLoud`，再 `boot()`。失败不再吞掉改走自建树。

花名册让出官方槽位：`ctx.roster` / `ctx.opcTools` / `ctx.completions` / `ctx.moduleStore`。`dsh-base` 持有 `ctx.agents` / `ctx.tools` / `ctx.llm` / `ctx.sessions` / `ctx.storage`。开发态可以把仓库当 host；缺 host（asar 且没有 extraResources）才自建 Context + spawn `dsh --profile opc`。能 in-process 时对话走 `ctx.agents.create`，不并行跑第二套 agent loop。签名身份不进仓库。
