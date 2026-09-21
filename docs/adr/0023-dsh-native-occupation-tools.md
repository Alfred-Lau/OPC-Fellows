# 职业工具按 dsh cookbook 挂上 ctx.tools

弹药手本职工具做成 `packages/occupation-social-ammo` bundle：`defineTool` + 结构化参数 + `exec.signal`。in-process 人设不再教 JSON 点名；可见集走 `ctx.tools.restrict`；政策走 `tools/pre-execute`。花名册心智不变。

## 为什么这样

[0005](./0005-dsh-as-composition-host.md) 已经把对话推进官方 `boot()` / `ctx.agents`。模块仍挂 `ctx.opcTools`，人设里教 `{"tool":...}`，第三方 `hello-module` 的 dsh 入口是空的。对照官方 Tool authoring / Package and install，职业包应该是 bundle，不是第二套 JSON 协议。

## 落点

- `ownworkbuddy-occupation-social-ammo` 可 `dsh plugin --profile opc add`；desktop 用户层也会 insert 绝对入口。
- Electron 模块继续持有 Panel 与 `opcTools`（口令桥 / Local API）。dsh 树上的 schema 以职业包为准。
- 有 agent 工厂时人设只列工具名，schema 交给 `defineTool`。spawn opc 退路仍保留 JSON 点名。
- `opc-kernel` 的 `@deepseek-ai/dsh-tools` 改为 peer，避免 profile 里双份拷贝。
- afterPack 缺 `dsh-host` 或弹药手职业包直接失败，安装包必须能官方 boot。
- 零歧义写口令优先 `ctx.tools.execute`；没有官方树或工具未挂上再 `opcTools.invoke`。无对话回合时 Local API 只放行本职工具，不开放 fs/bash。

## 考虑过但没选

- 把弹药手改成只注册 `ctx.tools`、删掉 `opcTools`：口令快路径和 Local API catalog 会断。
- 人设里两边都教：模型会绕开 native function calling。
- 审批只留 `approval/request`：官方政策入口是 `tools/pre-execute`。
