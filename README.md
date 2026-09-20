<p align="center">
  <strong>OPC-Fellows</strong> · hire occupations as members, then point them at <em>your</em> work<br>
  A small kernel (shell, todos, contracts) plus occupation plugins you can enable or write.
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
  <a href="#wire-it-to-your-business-in-15-minutes">Wire it to your business</a> ·
  <a href="#which-occupation-for-which-job">Occupations</a> ·
  <a href="#download-a-build">Download</a> ·
  <a href="#write-a-module-when-the-job-is-missing">Write a module</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#contributing">Contributing</a>
</p>

You are a developer who also is the company: sales, content, research, invoices. This README is not a product brochure. It is how you **clone the repo, hire members onto your own folders and sites, and do real work the same day**.

Business data stays in on-device `userData`. Model keys go through Settings → Model (`safeStorage`). No account, no upload, no telemetry. The default product catalog is empty — fill in *your* sites.

## Wire it to your business in 15 minutes

Needs Node.js `^22.19.0` or `>=24.0.0`, and pnpm 10+. The first `pnpm install` downloads Electron and takes a while.

```sh
git clone git@github.com:Alfred-Lau/OPC-Fellows.git
cd OPC-Fellows
pnpm install
pnpm dev
```

The UI is still hardcoded Chinese. Then attach **your** business, in this order — do not start with the architecture docs:

1. **Key** — 设置 → 模型, paste a DeepSeek API Key. Or `export DEEPSEEK_API_KEY=…` (env wins). Members cannot speak without a key.
2. **Hire** — the open-source roster ships **Host** and **Social ammo** only. Opening a member is their home thread. The left-rail `+` currently reopens Social ammo (a singleton).
3. **Bind a folder** — set the identity directory when you hire. Default is `~/OPC-Fellows/agents/{title}`. Better: bind the folder you actually edit. You can rebind later; files are not moved.
4. **Register your sites** — 设置 → 工作情况 → 添加产品. Social ammo reads this list, not the sample in the repo. Shape: [`examples/catalog.example.json`](examples/catalog.example.json).
5. **Talk** — the composer is **问** (read-only), **计划** (propose first; reply 「按计划执行」 before writes), **动手** (write in the workspace). Ask first, then act.

Optional:

```sh
cp .env.example .env          # never commit a real .env
pnpm test
pnpm dsh                      # local DeepSeek Harness CLI
```

Package with `pnpm run pack` (unpacked dir) or `pnpm dist:mac`. Do not run `pnpm pack` — that emits an npm tarball.

Vocabulary (member / project / identity directory / composer mode): [CONTEXT.md](CONTEXT.md).

## Which member for which job

The public roster keeps two identities. Other occupation modules stay in the tree but start disabled and do not spawn members.

| Your job | Who |
| --- | --- |
| Read/edit the workspace, run commands, plan then act | Host (default lead on every project) |
| Multi-platform copy from product capabilities | Social ammo (register your sites in 工作情况 first) |

Social ammo reads the Work situation catalog. Env cheat sheet:

| Variable | Use |
| --- | --- |
| `DEEPSEEK_API_KEY` | Overrides Settings → Model; still reads legacy `~/.dsh` |
| `OPC_USER_DATA` | userData for the runtime |

A **project** is one multi-member job. With no `@`, only the lead member hears you. Today is the global inbox, not a project.

## Download a build

If you do not want source: [v0.8.0](https://github.com/Alfred-Lau/OPC-Fellows/releases/tag/v0.8.0) (macOS Apple Silicon only).

- [dmg](https://github.com/Alfred-Lau/OPC-Fellows/releases/download/v0.8.0/OPC-Fellows-0.8.0-mac-arm64.dmg) — drag into Applications
- [zip](https://github.com/Alfred-Lau/OPC-Fellows/releases/download/v0.8.0/OPC-Fellows-0.8.0-mac-arm64.zip)

The build is signed and notarized by Apple, so it opens without any extra step. If the first launch is
still blocked (for example while offline), run this once:

```sh
xattr -cr "/Applications/OPC-Fellows.app"
```

Then open the app. **Upgrading from v0.7.3:** this release builds under the name **OPC-Fellows**, so it starts
with a fresh workspace — the previous build kept its data in `~/Library/Application Support/OPC Agent Team - Solokit`
and the new name does not read it. The same first-hour path applies: model key → hire → bind a folder → Work situation.

## Write a module when the job is missing

If a built-in occupation does not cover your business, add an npm package. Do not grow kernel union types. The workbench reads `ownworkbuddy` (`apply(ctx)` + optional `mount`); the runtime reads `dsh.bundle`. Write both during the transition. Smallest sample: [`examples/hello-module`](examples/hello-module).

```json
{
  "main": "dsh-plugin.js",
  "ownworkbuddy": {
    "id": "hello",
    "title": "Hello",
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
  ctx.workbench.nav({ id: 'hello', title: 'Hello', mark: 'Hi', kind: 'view', order: 200 })
  ctx.bridge.handle('hello:ping', () => ({ ok: true, at: new Date().toISOString() }))
}
```

Install from a local folder or Git on the Extensions page. To join the Harness stack:

```sh
pnpm dsh plugin --profile opc add ./examples/hello-module
```

A module may call only capabilities in its manifest. Undeclared calls are rejected. `subprocess` and `secrets` confirm at install. Modules must not reach into each other's stores; cross-module traffic goes through kernel services (for example `todos.ingestAgent`).

## Architecture

Electron is a thin shell. Chat and tools run on DeepSeek Harness; the roster, todos, and module registry hang on the same tree. Design: [ADR 0005](docs/adr/0005-dsh-as-composition-host.md), [docs/module-architecture-design.md](docs/module-architecture-design.md). Shell mental model: [docs/agent-workspace-design.md](docs/agent-workspace-design.md).

```
src/kernel/     boot, IPC, storage, todos, nav, module registry, members
src/modules/    built-in occupations (reference implementations)
examples/       smallest third-party module
docs/           architecture and ADRs
```

Runtime: [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness). Peer desktop hosts: [github.com/topics/dsh-plugin](https://github.com/topics/dsh-plugin).

The author runs this workbench against [SoloKit](https://www.solokit.run/) and [榆关](https://pen.bitou.tech/). That is a configuration, not the trunk defaults.

## Contributing

Public trunk: [Alfred-Lau/OPC-Fellows](https://github.com/Alfred-Lau/OPC-Fellows). PRs against kernel services, manifests, capabilities, samples, and docs are welcome.

Do not weld personal site catalogs, signing identities, secret defaults, or machine-absolute paths into `src/shared`. The default identity directory is `~/OPC-Fellows/agents/{title}`. Aligning a private reference tree copies mechanisms only — [ADR 0007](docs/adr/0007-opensource-sanitization.md).

- [CONTRIBUTING.en.md](CONTRIBUTING.en.md) · [CONTRIBUTING.md](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md) · [Security policy](SECURITY.md)
- Good first cuts: English UI strings, an `examples/` module, tests for one occupation

UI copy is still hardcoded Chinese. Plan: [docs/i18n-plan.md](docs/i18n-plan.md). PRs are licensed under [MIT](LICENSE).

## Security

- Business data stays in on-device `userData`. There is no first-party backend for it.
- WeChat intel is a local read-only index. Mail triage writes local drafts and does not send.
- Third-party modules run on a capability allow-list.
- Report vulnerabilities in private. See [SECURITY.md](SECURITY.md).

## License

[MIT License](LICENSE). Runtime depends on [Cordis](https://github.com/cordiverse/cordis) and [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Site: [OPC-Fellows](https://opc-fellows.solokit.run/)
