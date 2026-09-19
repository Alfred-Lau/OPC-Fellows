<p align="center">
  <img src="docs/cover.png" alt="OPC-Fellows — Local-first workbench for a one-person company" width="100%">
</p>

<p align="center">
  <strong>OPC-Fellows</strong> · a local-first workbench for a one-person company<br>
  A small kernel (shell, todos, module contract) plus occupation plugins.
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
  <a href="#why">Why</a> ·
  <a href="#download">Download</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#write-a-module">Write a module</a> ·
  <a href="#built-in-occupations">Built-in occupations</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#ecosystem">Ecosystem</a> ·
  <a href="#contributing">Contributing</a>
</p>

A local-first Electron workbench for a one-person company. Built on [Cordis](https://github.com/cordiverse/cordis) / [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

> Product catalogs, social signatures, and author names are filled in by the user under Work situation and module settings. Repository defaults stay empty.

## Why

A one-person company gets one workbench. You pick a **member** (an occupation) or a **project** (a multi-member job), push the work in a session, and the right pane is the Panel that identity is watching. New features are modules. The kernel union types stay small.

| Concept | Meaning |
| --- | --- |
| **Kernel** | Always on: shell, todos, search, settings, module registry, members / projects |
| **Module** | One Cordis plugin + one manifest. Enable / disable. Install from a local folder or Git |
| **Member** | One embodiment of a module: persona, home Panel, recommended Skills. The UI never says Agent |
| **Todo** | A kernel service. Any module writes through `todos.ingestAgent`, deduped by `dedupeKey` |

Vocabulary lives in [CONTEXT.md](CONTEXT.md). Modular design lives in [docs/module-architecture-design.md](docs/module-architecture-design.md).

### Why this split

The popular desktop workbenches on [dsh-plugin](https://github.com/topics/dsh-plugin) — [OpenDesign](https://github.com/nexu-io/open-design), [iPolloWork](https://github.com/Devin-AXIS/iPolloWork), [dsh-desktop](https://github.com/anywhere-labs/dsh-desktop), [dsh-web](https://github.com/zhu1090093659/dsh-web) — treat **Harness as the runtime and capabilities as plugins**. OPC-Fellows walks the same road. The shell is a one-person-company roster, not another dsh web skin.

H1–H8 already send the center-pane chat through `dsh --profile opc`. Scratch notes `notes_add` hang on opc's dsh `ctx.tools`; payments / monitor / micro-sourcing still run on Electron `ctx.tools`. See [ADR 0005](docs/adr/0005-dsh-as-composition-host.md).

- **Local first**: business data stays in `userData`; model keys go through Settings → Model and `safeStorage`
- **Everything plugs in**: occupations, Panels, and Skills are modules; the kernel only keeps contracts
- **Capability allow-list**: a module may call only what its manifest declares; dangerous ones confirm at install
- **Contracts match dsh**: `apply(ctx)`, custom package.json fields, layered capabilities — easy to port from the Harness ecosystem

## What this repository includes

```
src/kernel/          trunk: boot, IPC bridge, storage, todos, nav, module registry, members
src/modules/         built-in occupations (reference implementations)
examples/            smallest third-party module
docs/                architecture and ADRs
```

| Stays in the trunk | Stays out of defaults |
| --- | --- |
| Module contract, capabilities, install | Personal site catalog (fill in Work situation) |
| Todos / reminders / agent inbox | Social signatures, WeChat author, Coze workflow IDs |
| Local storage and `safeStorage` | Packaging identity, notarization Team ID |
| `examples/hello-module` | Real product catalog (see `examples/catalog.example.json`) |

Credentials travel as env vars or on-device `safeStorage`. The repo has no hardcoded keys. Legacy `~/.dsh` is still readable; new keys should be entered in Settings. After launch the product catalog, social signature, and WeChat author are empty until you fill them in. See [`examples/catalog.example.json`](examples/catalog.example.json).

## Download

A local-first desktop workbench: data stays on your own machine. Latest build: [v0.7.3](https://github.com/Alfred-Lau/OPC-Fellows/releases/tag/v0.7.3).

| Platform | Availability |
| --- | --- |
| macOS (Apple Silicon) | ✅ Available |
| Windows | ❌ Not available yet |
| Linux | ❌ Not available yet |

Direct downloads:

- [OPC.Agent.Team.-.Solokit-0.7.3-mac-arm64.dmg](https://github.com/Alfred-Lau/OPC-Fellows/releases/download/v0.7.3/OPC.Agent.Team.-.Solokit-0.7.3-mac-arm64.dmg) — disk image; drag the app into Applications.
- [OPC.Agent.Team.-.Solokit-0.7.3-mac-arm64.zip](https://github.com/Alfred-Lau/OPC-Fellows/releases/download/v0.7.3/OPC.Agent.Team.-.Solokit-0.7.3-mac-arm64.zip) — zip archive; unzip and run.

**First open: you must allow the app.** The current build is not Apple-signed or notarized — the certificate pipeline is not wired up yet. That is not a broken installer. After you put the app in Applications, run:

```sh
xattr -cr "/Applications/OPC Agent Team - Solokit.app"
```

Then right-click the app → Open.

The on-screen name is still **OPC Agent Team - Solokit**. Renaming it would migrate the data directory, so that waits for a later release.

[`latest-mac.yml`](https://github.com/Alfred-Lau/OPC-Fellows/releases/download/v0.7.3/latest-mac.yml) is the update manifest for a future auto-update source.

To run from source, see [Quick start](#quick-start) below.

## Quick start

Needs Node.js `^22.19.0` or `>=24.0.0`, and pnpm 10+. Electron 42+ no longer downloads its binary in its own `postinstall`; this repo uses `postinstall: install-electron`, so the first `pnpm install` takes a while.

```sh
pnpm install
pnpm dev
```

The workbench starts maximized.

Optional:

```sh
export DEEPSEEK_API_KEY=sk-...   # optional; overrides the key saved in Settings → Model
pnpm test                        # kernel + shared unit tests
pnpm dsh                         # local DeepSeek Harness CLI
```

Copy [`.env.example`](.env.example) if you prefer a dotenv file. Never commit a real `.env`.

Package locally with `pnpm pack` (dir), `pnpm dist`, or `pnpm dist:mac` to produce a macOS installer. The current CI / release pipeline has **not** wired up Apple signing and notarization, so published release artifacts need the Gatekeeper workaround above.

## Write a module

A third-party module is an npm package. The desktop workbench reads the `ownworkbuddy` field (main-process `apply(ctx)`, optional UI `mount(root, api)`); the agent runtime reads the official `dsh.bundle`. Write both during the transition. You do not need to touch preload.

Minimal sample: [`examples/hello-module`](examples/hello-module).

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

Install from a local folder or Git on the Extensions page. To join the dsh stack (this initializes `$DSH_HOME/profiles/opc`):

```sh
pnpm dsh plugin --profile opc add ./examples/hello-module
pnpm dsh plugin --profile opc add ./packages/opc-kernel
pnpm dsh plugin --profile opc add ./packages/occupation-notes
pnpm dsh plugin --profile opc add ./packages/occupation-monitor
pnpm dsh plugin --profile opc add ./packages/occupation-payments
pnpm dsh plugin --profile opc add ./packages/occupation-micro
```

Disabling a module that has `dsh.bundle` writes `{ id: opc-<module>, disabled: true }` into the opc profile `cordis.patch.yml`.

A module may only use capabilities declared in its manifest (`storage` / `todos:write` / `secrets` / `subprocess` …). Undeclared calls are rejected. `subprocess` and `secrets` prompt at install.

Built-in modules register statically at build time (`builtin:<id>`) so asar does not have to dynamic-import them. Modules must not reach into each other's stores; cross-module traffic goes through kernel services.

## Built-in occupations

These occupations live in the current product to prove the contract. They are not the kernel. Without keys they degrade to local features and do not send unauthenticated requests.

| Module | What it does |
| --- | --- |
| Notes | Local notes |
| Companion | Standalone reminder window; due todos jump to screen center |
| Project monitor | Repo / site posture; optional `GET /api/stats` |
| Social ammo | Multi-platform copy from product capabilities |
| Micro sourcing | Public-forum pain points clustered into product ideas |
| Growth hacker | Experiments, loops, and channels; no copy, no traffic refresh |
| Creator accounts | Domestic-platform accounts and day logs (manual data) |
| WeChat intel | Local read-only bridge to [WeChat Intelligence Hub](https://github.com/Rion-Wu-tech/wechat-intelligence-hub); never sends WeChat, chats stay on device |
| Mail triage | Local Mail.app + iCloud / Gmail / QQ IMAP; triage and drafts only, no sending |
| Payments | Local ledger; optional [Creem](https://creem.io) sync |
| DeepSeek Harness | Center-pane chat and Local API share one SDK session; not a hireable occupation |

Site stats, sourcing proxies, and Creem keys are **module settings**. Env-var cheat sheet:

| Variable | Use |
| --- | --- |
| `DEEPSEEK_API_KEY` | LLM (overrides Settings → Model; still reads legacy `~/.dsh`) |
| `OPC_USER_DATA` | userData passed to the opc child (notes `notes.json`) |
| `OWNWORKBUDDY_STATS_KEY` | Shared secret for monitor `GET /api/stats` |
| `CREEM_API_KEY` | Payments override for the on-device key |
| `HTTPS_PROXY` | Sourcing scan proxy (Reddit from mainland China) |

## Architecture

```
Target (ADR 0005)
  Thin Electron shell (window / tray / companion)
    dsh --profile opc
      dsh-base (llm / tools / sessions / agent-loop)
      OPC kernel bundle (todos, members, projects)
      Occupation bundles → ctx.tools + right-pane Panel

Today (H8)
  Electron main
    applyOpcKernel (cordis.patch.yml order)
      services: modules / workbench / bridge / storage / secrets
                todos / llm / tools / dshRuntime / scheduler / notify / search / repository / agents
      built-in modules (in-process) + installed third-party modules
    Same dsh --profile opc for center-pane chat and Local API /agent/task
  preload: workbench.invoke / subscribe (checked per module)
  renderer: left members & projects · center session · right Panel
```

Shell mental model: [docs/agent-workspace-design.md](docs/agent-workspace-design.md). Runtime host: [docs/adr/0005-dsh-as-composition-host.md](docs/adr/0005-dsh-as-composition-host.md).

## Ecosystem

The module contract follows DeepSeek Harness community conventions. For discovery and comparison, start with the official topic and the starred desktop / plugin projects:

| Project | Role next to this repo |
| --- | --- |
| [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | Runtime. Local `pnpm dsh`; today one `dsh --profile opc` process |
| [nexu-io/open-design](https://github.com/nexu-io/open-design) | Local-first desktop + dsh as a first-class runtime |
| [Devin-AXIS/iPolloWork](https://github.com/Devin-AXIS/iPolloWork) | Member / project / plugin lifecycle to compare |
| [anywhere-labs/dsh-desktop](https://github.com/anywhere-labs/dsh-desktop) | Harness inside a shippable client |
| [zhu1090093659/dsh-web](https://github.com/zhu1090093659/dsh-web) | Web GUI plugin family |
| [liustack/modlens](https://github.com/liustack/modlens) | Single-capability plugin README / install UX |
| [dsh-market/dsh-market](https://github.com/dsh-market/dsh-market) | In-app plugin market |
| [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) | Curated plugin list |

Full list: [github.com/topics/dsh-plugin](https://github.com/topics/dsh-plugin).

## Contributing

This repository is the public trunk: [Alfred-Lau/OPC-Fellows](https://github.com/Alfred-Lau/OPC-Fellows). Chinese docs: [README.zh-CN.md](README.zh-CN.md).

PRs against the **trunk contract** are welcome: kernel services, module manifests, capabilities, sample modules, docs. Do not add real site catalogs, signing identities, or secret defaults to `src/shared`.

- [CONTRIBUTING.en.md](CONTRIBUTING.en.md) · [CONTRIBUTING.md](CONTRIBUTING.md) (中文)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)

By submitting a pull request you license your contribution under the [MIT License](LICENSE).

Good first cuts: English UI strings, an `examples/` module, tests for one occupation, or issues labeled `good first issue`.

UI copy is still hardcoded Chinese. The i18n plan is [docs/i18n-plan.md](docs/i18n-plan.md) — help here travels far.

## Security

- Business data stays in on-device `userData`. There is no first-party backend for it.
- WeChat intel is a local read-only index. Chats are not uploaded, keys do not leave the machine, messages are not sent.
- Mail triage reads the inbox and writes local drafts. Online mailboxes use app-specific passwords in `safeStorage`. The app does not send mail.
- Third-party modules run on a capability allow-list. Dangerous permissions confirm at install.
- Report vulnerabilities in private. Do not paste credentials or user data into a public issue. See [SECURITY.md](SECURITY.md).

## License and thanks

[MIT License](LICENSE). Runtime depends on [Cordis](https://github.com/cordiverse/cordis) and [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Cover and badges follow the usual desktop-workbench look on [dsh-plugin](https://github.com/topics/dsh-plugin).

Website: [OPC-Fellows](https://opc-fellows.solokit.run/)
