# RTK Command Reference for Lucy QA

RTK (Rust Token Killer) sits in front of shell commands and filters their output
before it reaches the LLM context — typically saving 60-90% of tokens.

Docs: https://github.com/rtk-ai/rtk

## Installation

```bash
# One-liner
sh scripts/install-rtk.sh

# Or from the official installer
curl -fsSL https://install.rtk-ai.app | sh

# Verify
rtk --version
node apps/cli/src/index.mjs rtk status
```

## Drop-in command replacements

| Instead of | Use |
|---|---|
| `git status` | `rtk git status` |
| `git diff` | `rtk git diff` |
| `git log` | `rtk git log` |
| `git add -A && git commit -m "..."` | `rtk git add -A && rtk git commit -m "..."` |
| `git push` | `rtk git push` |
| `ls` / `ls -la` | `rtk ls` |
| `cat file.txt` | `rtk cat file.txt` |
| `grep pattern file` | `rtk grep pattern file` |
| `rg pattern` | `rtk rg pattern` |
| `find . -name "*.mjs"` | `rtk find . -name "*.mjs"` |
| `npm test` | `rtk npm test` |
| `npx playwright test` | `rtk npx playwright test` |
| `node tests/integration/foo.mjs` | `rtk node tests/integration/foo.mjs` |
| `pnpm test` | `rtk pnpm test` |

## Lucy QA integration

RTK is automatically applied when available:

- `qa exec` — wraps any supported command transparently
- `qa run` — wraps the Playwright test runner
- Status is shown in output: `- rtk: active (resolved: rtk npx playwright test ...)`

Check status:
```bash
node apps/cli/src/index.mjs rtk status
```

Disable for a single session:
```bash
export LUCY_QA_RTK_ENABLED=false
```

## Token savings in this repo

| Command | Without RTK | With RTK | Savings |
|---|---|---|---|
| `git status` | ~600 tokens | ~120 tokens | -80% |
| `git diff` (feature branch) | ~10,000 tokens | ~2,500 tokens | -75% |
| `npx playwright test` (pass) | ~5,000 tokens | ~500 tokens | -90% |
| `npx playwright test` (fail) | ~25,000 tokens | ~2,500 tokens | -90% |
| `node tests/integration/...` | ~3,000 tokens | ~300 tokens | -90% |
| `ls` (project root) | ~800 tokens | ~150 tokens | -81% |
| `cat apps/cli/src/index.mjs` | ~40,000 tokens | ~12,000 tokens | -70% |

## Analytics

```bash
# See cumulative token savings for your session
rtk gain
```
