# Contributing

[中文](CONTRIBUTING.md)

Please change the **trunk contract**. Do not add real site catalogs, signing identities, or secret defaults to the code.

Vocabulary follows [CONTEXT.md](CONTEXT.md): the UI says “member”, never Agent; it says “project”, never Team / Workspace. Modular boundaries: [docs/module-architecture-design.md](docs/module-architecture-design.md). The agent runtime lives in dsh; Electron stays a thin shell. See [ADR 0005](docs/adr/0005-dsh-as-composition-host.md). Defaults and identity stay out of trunk code — [ADR 0007](docs/adr/0007-opensource-sanitization.md). The default identity directory is `~/OPC-Fellows/agents/{title}`.

## Contributor statement

1. Opening a pull request licenses that contribution to this project under the [MIT License](LICENSE), and you confirm you have the right to grant that license.
2. You warrant the contribution contains **no** third-party secrets, chat logs, payment ledgers, unlicensed copyrighted material, or your own production credentials.
3. You agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
4. Copyright stays with each author. The license requires keeping the copyright and permission notices. The maintainer is [bitou.tech](https://pen.bitou.tech/).

There is no separate CLA. The MIT text is the license.

## Environment

- Node.js `^22.19.0` or `>=24.0.0`
- pnpm 10+

```sh
pnpm install
cp .env.example .env   # optional; never commit a real .env
pnpm dev
pnpm test
```

`pnpm test` covers `src/shared`, `src/kernel`, and `src/main`. After toolbar / home-board / calendar / packs-dialog layout changes, also run `pnpm test:layout`, `test:home-board`, `test:calendar`, `test:packs`.

Do not commit `.env`, on-device `userData`, certificates, notarization identities, or signed `.app` / `.dmg` files under `dist/`.

## Where to change what

| Scope | Path | Good PRs |
| --- | --- | --- |
| Kernel | `src/kernel/` | Shell, todos, IPC bridge, module registry, capabilities, members / projects |
| Built-in occupations | `src/modules/`, `packages/occupation-*`, leftover `src/main` / `src/renderer` | Panels and `ctx.tools` in `src/modules`; dsh stack is a marked bundle |
| Examples | `examples/` | Smallest third-party module that actually runs |
| Docs | `README.md` (English default), `README.zh-CN.md`, `docs/`, `CONTEXT.md` | Contract text; do not add a personal runbook |

New features are modules. Do not grow the kernel view union. Cross-module traffic goes through kernel services (`todos.ingestAgent` and the like). Do not reach into another module's store.

Third-party shape: [`examples/hello-module`](examples/hello-module) — `ownworkbuddy` (workbench Panel) + `dsh.bundle` (`dsh plugin --profile opc add`) + `apply(ctx)` with `defineTool` + optional `mount(root, api)`. Declare only the capabilities you use. Keep `@deepseek-ai/dsh-tools` as a peer. `subprocess` / `secrets` / `net:listen:*` are dangerous; skip them if you can.

## Good first issues

- Extract English strings per [docs/i18n-plan.md](docs/i18n-plan.md) (UI copy is still hardcoded Chinese)
- Add another `examples/` module and prove the third-party install path
- Add `*.test.ts` for one occupation
- Triage a vague issue into `good first issue` with an acceptance line

## Do not

- Keep growing `products.ts`, social signatures, default project tags, or sourcing lists as if they were “the product's own data”. Those are user configuration and should stay empty by default.
- Paste API keys, chat logs, payment ledgers, or user data into a public issue / PR.
- Change preload or the kernel nav allow-list for one occupation. Modules register their own nav / IPC.
- Call a member an Agent, or a project a team, in UI copy.
- Commit machine-absolute paths, an Apple Team ID, or a notarization keychain profile.
- Add a real catalog, deploy target, design system, or non-public brand path to the trunk. Mechanisms may be aligned; content must be rewritten.

A change that breaks the `ownworkbuddy` manifest or the `Capability` union must describe the migration in the PR.

## Pull requests

1. Branch from latest `main`. Say in the title whether this is kernel, one module, or docs.
2. In the body: behavior change, whether the manifest / capability is breaking, how you verified.
3. Open the PR only after `pnpm test` passes locally.
4. One PR, one job. Do not mix a contract change with an occupation feature.
5. Tick the PR template box: no secrets, no personal catalog defaults.

Issues need the same scope. Security bugs are not public issues: follow [SECURITY.md](SECURITY.md).

## License

Contributions are licensed under the [MIT License](LICENSE). Copyright belongs to each author and [bitou.tech](https://pen.bitou.tech/).
