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
lucy provider setup glm --preset glm --api-key-env ZHIPU_API_KEY --set-default
```

Available models: `glm-4-plus` (balanced), `glm-4-flash` (fast), `glm-4v-plus` (vision), `glm-z1-plus` (reasoning), `glm-4-air` (lightweight).

### MiniMax

MiniMax-Text-01 has 1M context. MiniMax-M1 adds reasoning/thinking capabilities. Get an API key at [minimax.chat](https://www.minimax.chat).

```bash
export MINIMAX_API_KEY=your_key_here
lucy provider setup minimax --preset minimax --api-key-env MINIMAX_API_KEY --set-default
```

Available models: `MiniMax-Text-01` (balanced, 1M ctx), `MiniMax-M1` (reasoning), `abab6.5s-chat` (fast).

---

## Token compression with RTK

Lucy QA integrates [RTK (Rust Token Killer)](https://github.com/rtk-ai/rtk) — a Rust binary that filters command output before it reaches the LLM context, reducing token usage by **60-90%** on git, test runs, file reads, and other common commands.

```bash
# Install RTK (Linux / macOS)
sh scripts/install-rtk.sh

# Check status
lucy rtk status
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
pnpm run install:lucy
```

Now you can use the agent directly:

```bash
lucy
lucy agent "review the latest run and draft bugs"
lucy qa plan "checkout regression coverage"
```

### 2. Pick a provider

```bash
# GitHub Copilot (if you have a Copilot subscription)
export COPILOT_GITHUB_TOKEN=your_token
lucy provider setup github-copilot --preset github-copilot --api-key-env COPILOT_GITHUB_TOKEN --set-default

# GLM (Zhipu AI)
export ZHIPU_API_KEY=your_key
lucy provider setup glm --preset glm --api-key-env ZHIPU_API_KEY --set-default

# MiniMax
export MINIMAX_API_KEY=your_key
lucy provider setup minimax --preset minimax --api-key-env MINIMAX_API_KEY --set-default

# AdaCODE
export ADACODE_API_KEY=your_key
lucy provider setup adacode --preset adacode --api-key-env ADACODE_API_KEY --set-default

# OpenAI Codex (native OAuth via codex CLI)
lucy provider use openai-codex
```

### 3. Set up your QA workspace

```bash
# Tell Lucy QA which systems your team uses (conversational)
lucy qa onboarding "we use qase project WEB and jira project QA"

# Or use flags
lucy qa onboarding \
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
lucy qa plan "E2E plan for checkout flow" --target-url https://example.com/checkout

# Generate atomic test cases
lucy qa cases "Login page — positive and negative coverage" --target-url https://example.com/login

# Generate a Playwright starter
lucy qa playwright "Login smoke test with error state coverage" --target-url https://example.com/login

# Run a spec
lucy qa run tests/e2e/login.spec.js --base-url https://example.com

# Summarize a run
lucy qa report artifacts/playwright/runs/<run-id>

# Draft bugs from a failed run
lucy qa bugs --from-run artifacts/playwright/runs/<run-id>

# Draft a single bug from a finding
lucy qa bug "Login button unresponsive after failed OTP entry on iOS Safari"

# Publish a run to Qase
lucy qa report publish artifacts/playwright/runs/<run-id> --close-run

# File a defect to Jira
lucy qa defects file-remote login|assertion|error-surface-missing|login \
  --target-url https://example.com/login

# Autonomous agent mode
lucy agent "draft and file bugs from the latest run"
```

---

## Provider management

```bash
# List configured providers
lucy provider list

# List available presets
lucy provider presets

# Show active provider details
lucy provider show

# Switch active provider
lucy provider use glm

# Discover available models for a provider
lucy provider models glm

# Set a default model for a provider
lucy provider default-model glm glm-4-air

# Conversational setup (no flags needed)
lucy provider setup "use minimax and make it default"
lucy provider setup "use glm"
lucy provider setup "use github copilot and make it default"
```

---

## Memory and state

```bash
# Save a QA note to the vault
lucy memory save "Checkout regression coverage" \
  --content "Covered: add-to-cart, promo, payment, confirmation" --category regression

# Search notes
lucy memory search "checkout"

# View session startup state
lucy state startup

# View session state and journal
lucy state show
lucy state journal

# Resume last session
lucy state resume

# Start a new session for a project
lucy state new-session --project checkout-web
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

The main CLI should be used through the installed `lucy` command. Integration smoke tests remain self-contained Node.js scripts with no external test runner required.

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
