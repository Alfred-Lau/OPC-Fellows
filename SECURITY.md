# Security Policy

[中文](#中文) · [English](#english)

## 中文

### 信任边界

OPC-Fellows 是本地优先桌面工作台。

- 业务数据只写本机 `userData`，不经过本项目自己的服务器。
- 模型密钥、邮箱专用密码、Creem key 走 Electron `safeStorage` 或环境变量，**仓库里不得出现真值**。
- 微信情报只读本机索引：不上传聊天、不把 key 送出本机、不代发消息。
- 邮件整理只读收件箱并写本机草稿，不代发。
- 第三方模块只能调用 manifest 声明的 capability。`secrets` / `subprocess` / `net:listen:*` 安装前必须确认。

请不要把已签名的 `.app` / `.dmg`、`.env`、本机 `userData` 或 Apple 公证凭据推进 git。

### 如何披露

请**不要**开公开 Issue，也不要在 PR / Discussion 里贴凭据、聊天或用户数据。

1. 优先用 GitHub **[Private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)**（仓库 Security 页）。
2. 若 Advisories 尚未打开，发一封不带机密附件的私信给维护者 GitHub [@Alfred-Lau](https://github.com/Alfred-Lau)，说明影响面，等回复后再传细节。

我们会确认影响范围、修主干、再公开摘要。第三方模块的漏洞请同时通知该模块作者。

### 不在范围内

- 用户自己填进「设置 → 模型」或模块设置的密钥保管（那是本机钥匙串问题）
- 用户安装的、声明了高危 capability 的第三方模块主动作恶
- DeepSeek Harness / Cordis / Electron 上游漏洞（请向上游披露）

---

## English

### Trust boundary

OPC-Fellows is a local-first desktop workbench.

- Business data stays in on-device `userData`. There is no first-party backend for it.
- Model keys, mailbox app passwords, and Creem keys go through Electron `safeStorage` or environment variables. **Real values must never land in the repo.**
- WeChat intel is a local read-only index: no upload, no key exfil, no sending.
- Mail triage reads the inbox and writes local drafts. It does not send mail.
- Third-party modules may call only capabilities declared in their manifest. `secrets` / `subprocess` / `net:listen:*` confirm at install.

Do not push signed `.app` / `.dmg` files, `.env`, on-device `userData`, or Apple notarization credentials.

### Reporting

Do **not** open a public issue, and do not paste credentials, chats, or user data into a PR / Discussion.

1. Prefer GitHub **[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)** on this repository's Security tab.
2. If Advisories are not enabled yet, send a non-secret ping to maintainer [@Alfred-Lau](https://github.com/Alfred-Lau) describing impact, then share details after a reply.

We will confirm scope, patch the trunk, then publish a short advisory. For a third-party module, notify that module's author as well.

### Out of scope

- How a user stores keys they typed into Settings → Model or a module settings page (that is the local keychain)
- A third-party module the user installed that declared a dangerous capability and then misbehaves
- Upstream DeepSeek Harness / Cordis / Electron issues (report those upstream)
