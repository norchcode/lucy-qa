# Lucy QA — Agent Instructions

This file is loaded automatically by AI coding agents (Codex, Claude Code, Cursor, etc.)
and provides project-specific guidance for working in this repo.

## RTK — Token Compression

RTK (Rust Token Killer) is integrated into this project to compress command output
before it reaches your context, reducing token consumption by 60-90%.

See `RTK.md` for the full command reference.

**Quick rules:**
- Use `rtk git <args>` instead of `git <args>`
- Use `rtk ls` / `rtk cat <file>` instead of `ls` / `cat`
- Use `rtk grep <args>` / `rtk rg <args>` instead of `grep` / `rg`
- Use `rtk npm <args>` / `rtk npx <args>` instead of `npm` / `npx`
- Use `rtk node <args>` instead of `node <args>` for test runs

If RTK is not installed, fallback to normal commands — they still work.

## Project overview

Lucy QA is a monorepo managed with pnpm + Turbo.

```
apps/cli/src/index.mjs     — main CLI entrypoint
packages/harness-adapter/  — provider loading and model resolution
packages/rtk-filter/       — RTK detection and command wrapping
packages/qa-playwright/    — Playwright runner with RTK integration
tests/integration/         — smoke tests (self-contained .mjs, no test framework)
config/providers.example.json — copy to providers.local.json for local keys
```

## Common commands

```bash
# Install
pnpm install

# Health check
node scripts/doctor.mjs

# RTK status
node apps/cli/src/index.mjs rtk status

# Provider setup
node apps/cli/src/index.mjs provider presets --plain
node apps/cli/src/index.mjs provider setup glm --preset glm --api-key-env ZHIPU_API_KEY --set-default

# Run a single smoke test
node tests/integration/provider-glm-smoke.mjs

# Run multiple tests
for f in tests/integration/provider-*.mjs; do node "$f"; done
```

## Code conventions

- ESM only (`.mjs`, `"type": "module"`)
- No external test framework — smoke tests are plain `node:assert/strict` scripts
- Graceful fallback on all optional dependencies (RTK, Playwright, Obsidian vault, etc.)
- Integration files named `*-smoke.mjs` in `tests/integration/`
- New provider presets go in `packages/harness-adapter/src/provider-config.mjs`
