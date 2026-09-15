## Summary

<!-- 改的是内核、某个职业，还是文档？行为上用户会看到什么？ -->

## Scope

- [ ] Kernel (`src/kernel/`)
- [ ] Built-in occupation (`src/modules/` / `packages/occupation-*`)
- [ ] Example module
- [ ] Docs / i18n

## Test plan

- [ ] `pnpm test`
- [ ] Layout scripts if the toolbar / home board / calendar / packs dialog moved
- [ ] Manual path (what you clicked)

## Trunk check

- [ ] No API keys, chat logs, payment ledgers, or machine-absolute paths
- [ ] No personal site catalog / social signature / Coze workflow / Apple Team ID defaults
- [ ] Breaking manifest or `Capability` changes are described below (or N/A)
