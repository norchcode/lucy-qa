# Lucy QA

A personal agentic AI assistant for QA engineers — built around a modular CLI harness with Playwright automation, long-term project memory, and first-class support for multiple AI providers.

---

## What Lucy QA does

- **QA planning** — generate structured test plans from a goal and target URL
- **Atomic test case generation** — black-box E2E cases with positive/negative coverage
- **Playwright E2E starter generation** — scaffold working spec files with recording guidance
- **Playwright test execution** — run specs and collect evidence (traces, screenshots, reports)
- **Run reporting** — summarize results from stored artifacts
- **Bug report drafting** — draft defect-ready bug reports from failed runs or free-form findings
- **Defect tracking integration** — link bugs to Jira/GitHub Issues; file remote issues via Jira API; publish runs to Qase
- **Obsidian-style vault memory** — save QA notes, session context, and journal entries in structured markdown
- **Session resume** — detect and resume interrupted sessions across restarts
- **Context7 doc lookup** — fetch live framework docs before generating specs (3 retries, graceful fallback)
- **Autonomous agent mode** — route natural-language goals into multi-step QA workflows
- **Bilingual** — English and Indonesian supported throughout

---

## Supported AI providers

Lucy QA talks to AI providers through a unified OpenAI-compatible harness. All providers below can be set up with a single command.

| Preset key | Provider | Auth env var |
|---|---|---|
| `openai-codex` | OpenAI Codex (native OAuth) | handled by `codex` CLI login |
| `github-copilot` | GitHub Copilot | `COPILOT_GITHUB_TOKEN` / `GH_TOKEN` / `GITHUB_TOKEN` |
| `adacode` | AdaCODE | `ADACODE_API_KEY` |
| `glm` | Zhipu AI GLM (GLM-4 family) | `ZHIPU_API_KEY` |
| `minimax` | MiniMax (MiniMax-Text-01, M1) | `MINIMAX_API_KEY` |
| `cliproxyapi` | CLIProxyAPI / local gateway | `CLIPROXYAPI_API_KEY` |
| `openai-compatible` | Any OpenAI-compatible endpoint | custom env var |

### GLM (Zhipu AI)

GLM-4 models support Chinese and English natively. Get an API key at [open.bigmodel.cn](https://open.bigmodel.cn).

```bash
export ZHIPU_API_KEY=your_key_here
node apps/cli/src/index.mjs provider setup glm --preset glm --api-key-env ZHIPU_API_KEY --set-default
```

Available models: `glm-4-plus` (balanced), `glm-4-flash` (fast), `glm-4v-plus` (vision), `glm-z1-plus` (reasoning), `glm-4-air` (lightweight).

### MiniMax

MiniMax-Text-01 has 1M context. MiniMax-M1 adds reasoning/thinking capabilities. Get an API key at [minimax.chat](https://www.minimax.chat).

```bash
export MINIMAX_API_KEY=your_key_here
node apps/cli/src/index.mjs provider setup minimax --preset minimax --api-key-env MINIMAX_API_KEY --set-default
```

Available models: `MiniMax-Text-01` (balanced, 1M ctx), `MiniMax-M1` (reasoning), `abab6.5s-chat` (fast).

---

## Token compression with RTK

Lucy QA integrates [RTK (Rust Token Killer)](https://github.com/rtk-ai/rtk) — a Rust binary that filters command output before it reaches the LLM context, reducing token usage by **60-90%** on git, test runs, file reads, and other common commands.

```bash
# Install RTK (Linux / macOS)
sh scripts/install-rtk.sh

# Check status
node apps/cli/src/index.mjs rtk status
```

Once RTK is installed, `qa exec` and `qa run` automatically wrap commands through it. No config needed — it's detected at runtime and falls back gracefully if not installed.

| Command | Without RTK | With RTK | Savings |
|---|---|---|---|
| `git status` | ~600 tokens | ~120 tokens | -80% |
| `npx playwright test` (fail) | ~25,000 tokens | ~2,500 tokens | -90% |
| `git diff` | ~10,000 tokens | ~2,500 tokens | -75% |
| `node tests/integration/...` | ~3,000 tokens | ~300 tokens | -90% |

See `RTK.md` for the full command reference and `AGENTS.md` for AI agent instructions.

---

## Quick start

### 1. Install

```bash
git clone https://github.com/norchcode/lucy-qa.git
cd lucy-qa
pnpm install
```

### 2. Pick a provider

```bash
# GitHub Copilot (if you have a Copilot subscription)
export COPILOT_GITHUB_TOKEN=your_token
node apps/cli/src/index.mjs provider setup github-copilot --preset github-copilot --api-key-env COPILOT_GITHUB_TOKEN --set-default

# GLM (Zhipu AI)
export ZHIPU_API_KEY=your_key
node apps/cli/src/index.mjs provider setup glm --preset glm --api-key-env ZHIPU_API_KEY --set-default

# MiniMax
export MINIMAX_API_KEY=your_key
node apps/cli/src/index.mjs provider setup minimax --preset minimax --api-key-env MINIMAX_API_KEY --set-default

# AdaCODE
export ADACODE_API_KEY=your_key
node apps/cli/src/index.mjs provider setup adacode --preset adacode --api-key-env ADACODE_API_KEY --set-default

# OpenAI Codex (native OAuth via codex CLI)
node apps/cli/src/index.mjs provider use openai-codex
```

### 3. Set up your QA workspace

```bash
# Tell Lucy QA which systems your team uses (conversational)
node apps/cli/src/index.mjs qa onboarding "we use qase project WEB and jira project QA"

# Or use flags
node apps/cli/src/index.mjs qa onboarding \
  --qa-test-management Qase --qa-project WEB \
  --issue-tracker Jira --issue-project QA \
  --jira-base-url https://yourco.atlassian.net \
  --jira-email qa@yourco.com \
  --jira-api-token <token> \
  --qase-api-token <token> \
  --test-connections
```

### 4. Run QA tasks

```bash
# Generate a test plan
node apps/cli/src/index.mjs qa plan "E2E plan for checkout flow" --target-url https://example.com/checkout

# Generate atomic test cases
node apps/cli/src/index.mjs qa cases "Login page — positive and negative coverage" --target-url https://example.com/login

# Generate a Playwright starter
node apps/cli/src/index.mjs qa playwright "Login smoke test with error state coverage" --target-url https://example.com/login

# Run a spec
node apps/cli/src/index.mjs qa run tests/e2e/login.spec.js --base-url https://example.com

# Summarize a run
node apps/cli/src/index.mjs qa report artifacts/playwright/runs/<run-id>

# Draft bugs from a failed run
node apps/cli/src/index.mjs qa bugs --from-run artifacts/playwright/runs/<run-id>

# Draft a single bug from a finding
node apps/cli/src/index.mjs qa bug "Login button unresponsive after failed OTP entry on iOS Safari"

# Publish a run to Qase
node apps/cli/src/index.mjs qa report publish artifacts/playwright/runs/<run-id> --close-run

# File a defect to Jira
node apps/cli/src/index.mjs qa defects file-remote login|assertion|error-surface-missing|login \
  --target-url https://example.com/login

# Autonomous agent mode
node apps/cli/src/index.mjs agent "draft and file bugs from the latest run"
```

---

## Provider management

```bash
# List configured providers
node apps/cli/src/index.mjs provider list

# List available presets
node apps/cli/src/index.mjs provider presets

# Show active provider details
node apps/cli/src/index.mjs provider show

# Switch active provider
node apps/cli/src/index.mjs provider use glm

# Discover available models for a provider
node apps/cli/src/index.mjs provider models glm

# Set a default model for a provider
node apps/cli/src/index.mjs provider default-model glm glm-4-air

# Conversational setup (no flags needed)
node apps/cli/src/index.mjs provider setup "use minimax and make it default"
node apps/cli/src/index.mjs provider setup "use glm"
node apps/cli/src/index.mjs provider setup "use github copilot and make it default"
```

---

## Memory and state

```bash
# Save a QA note to the vault
node apps/cli/src/index.mjs memory save "Checkout regression coverage" \
  --content "Covered: add-to-cart, promo, payment, confirmation" --category regression

# Search notes
node apps/cli/src/index.mjs memory search "checkout"

# View session startup state
node apps/cli/src/index.mjs state startup

# View session state and journal
node apps/cli/src/index.mjs state show
node apps/cli/src/index.mjs state journal

# Resume last session
node apps/cli/src/index.mjs state resume

# Start a new session for a project
node apps/cli/src/index.mjs state new-session --project checkout-web
```

---

## Architecture

```
lucy-qa/
├── apps/
│   └── cli/                    # Main CLI entrypoint
│       └── src/
│           ├── index.mjs       # Command router + startup/first-run logic
│           ├── ask.mjs         # Free-form AI ask
│           ├── qa-agent.mjs    # Autonomous agent
│           ├── qa-plan.mjs     # Test plan generation
│           ├── qa-cases.mjs    # Test case generation
│           ├── qa-playwright.mjs # Playwright spec generation
│           ├── qa-run.mjs      # Test execution
│           ├── qa-report.mjs   # Run report summarization
│           ├── qa-bug.mjs      # Single bug draft
│           ├── qa-bugs.mjs     # Bulk bug drafts from run
│           ├── qa-defects.mjs  # Defect tracking (link/update/file-remote)
│           ├── qa-onboarding.mjs # QA workspace onboarding
│           ├── qa-integrations.mjs # Integration readiness checks
│           ├── qa-qase.mjs     # Qase publish
│           ├── qa-exec.mjs     # Native command execution
│           ├── qa-learning.mjs # Self-improvement loop
│           ├── state.mjs       # Session/journal/startup state
│           ├── memory.mjs      # Vault note save/search
│           └── docs.mjs        # Context7 doc lookup
│
├── packages/
│   ├── harness-adapter/        # Provider loading, model resolution, switching
│   ├── auth-codex/             # OpenAI Codex native OAuth
│   ├── auth-github-copilot/    # GitHub Copilot auth + env detection
│   ├── provider-openai-compatible/ # OpenAI-compatible chat client
│   ├── qa-core/                # Core QA reasoning utilities
│   ├── qa-playwright/          # Playwright runner integration
│   ├── qa-knowledge/           # Durable QA knowledge store
│   ├── context7-client/        # Context7 docs API client
│   ├── research-engine/        # Web research utilities
│   ├── memory-obsidian/        # Obsidian-style vault read/write
│   ├── i18n/                   # Indonesian/English i18n
│   └── shared-types/           # Shared provider schema types
│
├── config/
│   └── providers.example.json  # Example provider config (copy to providers.local.json)
│
├── tests/
│   └── integration/            # 60+ integration smoke tests (no mocking framework needed)
│
└── docs/                       # Architecture, provider, and workflow docs
```

---

## Environment variables

| Variable | Purpose |
|---|---|
| `LUCY_QA_PROVIDER_CONFIG_PATH` | Override path to providers config JSON |
| `LUCY_QA_VAULT_PATH` | Override path to vault directory |
| `ZHIPU_API_KEY` | API key for Zhipu AI GLM |
| `MINIMAX_API_KEY` | API key for MiniMax |
| `ADACODE_API_KEY` | API key for AdaCODE |
| `COPILOT_GITHUB_TOKEN` | GitHub Copilot token (also `GH_TOKEN`, `GITHUB_TOKEN`) |
| `LUCY_GCLI2API_API_KEY` | API key for gcli2api local bridge |
| `QASE_API_TOKEN` / `LUCY_QA_QASE_API_TOKEN` | Qase API token |
| `JIRA_BASE_URL` / `LUCY_QA_JIRA_BASE_URL` | Jira instance base URL |
| `JIRA_EMAIL` / `LUCY_QA_JIRA_EMAIL` | Jira user email |
| `JIRA_API_TOKEN` / `LUCY_QA_JIRA_API_TOKEN` | Jira API token |
| `NO_COLOR` | Disable ANSI coloring |
| `FORCE_COLOR` | Force ANSI coloring |

---

## Running tests

Each smoke test is a self-contained Node.js script — no test runner required.

```bash
# Run a specific test
node tests/integration/provider-glm-smoke.mjs
node tests/integration/provider-minimax-smoke.mjs
node tests/integration/provider-setup-cli-smoke.mjs
node tests/integration/qa-onboarding-iterative-smoke.mjs

# Run a batch (example)
for f in tests/integration/provider-*.mjs; do node "$f"; done
```

---

## License

MIT — see [LICENSE](./LICENSE).
