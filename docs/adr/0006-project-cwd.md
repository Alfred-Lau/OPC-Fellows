# 项目工作目录就是 dsh 的 cwd

中栏海框（`+` 和本机名那一粒）点开后可以选文件夹、选文件、引用技能。选中的文件夹是该项目的工作目录：对话、dsh-fs、终端、工作区文件树、会话里写下的文档都落在里面。权威业务数据仍在 `module-data/`。

本 ADR 叠在 [0005](./0005-dsh-as-composition-host.md) 和 [工作台设计 A4](../agent-workspace-design.md) 上，不改口 CONTEXT.md 的「项目 / Workspace File / Artifact」。

## 为什么这样

dsh 在 `initialize` 时把 `cwd` 交给 `@deepseek-ai/dsh-fs` / `dsh-shell` / `dsh-code-runtime`。官方桌面也是「一条会话一个工作目录」，不是再包一层虚拟盘。OPC 之前把 cwd 写死成 `userData/workspaces/<成员>`，而且 SDK 进程 boot 之后换目录也不会重启，选了文件夹等于没选。

文件引用对齐 `@deepseek-ai/dsh-attachment`：路径进这一轮 prompt，不复制第二份真相。`/` 引用技能仍是 Trigger，只是海框给一条不用先敲斜杠的入口。

## 落点

| OPC | 落在 |
|---|---|
| 项目文件夹 | `ThreadRecord.folderPath`；`DshRuntimeService.prompt({ cwd })`；cwd 变了就停掉 SDK 再 `initialize` |
| 引用文件 | `ThreadRecord.attachedFiles`；路径指针进 prompt，由 dsh-fs 读正文 |
| 引用技能 | 海框第三项 → 现有 `listComposerSkills` / `/` 插入 |
| Workspace File | 右栏树和 dsh-fs 都读这个文件夹；随手记 JSON 仍是 Artifact，项目会话里会多写一份 `notes/*.md` |
| 成员默认工作区 | 没选文件夹时回落身份目录 `~/OPC-Fellows/agents/{标题}`；旧 `userData/workspaces` 不自动搬家 |

今日（inbox）不是项目，海框里选文件夹 / 文件会提示去开项目；引用技能仍可用。

## 不做

- 不把收款台账、监控快照搬进项目文件夹。
- 不做云盘同步。
- 不在这一刀做右栏完整编辑器。
