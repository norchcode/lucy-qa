# Lucy QA CLI Reference

This document describes the currently implemented Lucy QA CLI commands and the intended workflow around them.

## Command overview

### Authentication and provider management
- `auth status --provider <openai-codex|github-copilot>`
- `auth login --provider openai-codex [--method manual-oauth|device|browser]`
- `auth login --provider github-copilot [--api-key-env <ENV>] [--base-url <url>] [--model <model>] [--label <text>] [--set-default]`
- `auth complete --provider openai-codex "<callback-url>"`
- `auth pending --provider openai-codex`
- `provider list`
- `provider show <name> [--model <model-or-alias>] [--task <task>]`
- `provider active`
- `provider connect <name>`
- `provider setup "use github copilot and make it default"`
- `provider use <name>`
- `provider models <name>`
- `provider default-model <name> <model>`

### General prompting
- `ask <prompt> [--provider <provider>] [--model <model-or-alias>] [--task <qa|research|coding|uiux>] [--plain|--detailed|--trace]`
- `docs <query> [--limit <n>] [--plain|--detailed|--trace]`

### State and memory
- `state startup [--vault <path>] [--plain|--detailed]`
- `state save-session <summary> [--project <name>] [--vault <path>] [--plain|--detailed]`
- `state open-tasks <task> [more tasks...] [--vault <path>] [--plain|--detailed]`
- `state show [--vault <path>] [--plain|--detailed|--trace]`
- `state journal [--vault <path>] [--plain|--detailed|--trace]`
- `state resume [--vault <path>] [--plain|--detailed]`
- `state new-session [--project <name>] [--vault <path>] [--plain|--detailed]`
- `memory save <title> --content <text> [--category <name>] [--vault <path>] [--plain|--detailed]`
- `memory search <query> [--vault <path>] [--limit <n>] [--plain|--detailed|--trace]`

- `qa onboarding "we use qase project WEB and jira project QA"`
- `qa onboarding "we use qase project WEB"` then answer the remaining prompt on the next run

### QA planning and test design
- `qa plan <goal> [--provider <provider>] [--model <model-or-alias>] [--plain|--detailed|--trace]`
- `qa cases <goal> [--provider <provider>] [--model <model-or-alias>] [--plain|--detailed|--trace]`
- `qa playwright <goal> [--provider <provider>] [--model <model-or-alias>] [--plain|--detailed|--trace]`

### QA execution and reporting
- `qa run <spec-or-folder> [--base-url <url>] [--artifacts-root <path>] [--plain|--detailed|--trace]`
- `qa report <run-dir> [--plain|--detailed|--trace]`
- `qa bug <finding> [--plain|--detailed|--trace]`
- `qa bugs --from-run <run-dir> [--plain|--detailed|--trace]`
- `qa exec <command> [--cwd <path>] [--timeout <ms>] [--plain|--detailed|--trace]`

---

## Output modes

Most user-facing commands support these output modes:

- `--plain`
  - compact machine-friendly or answer-first output
- `--detailed`
  - readable human-oriented summary
- `--trace`
  - detailed output plus runtime/debug context where available

If no flag is supplied, the default is `--detailed`.

---

## Recommended Lucy QA workflow

### 1. Authenticate and choose provider

Example:
```bash
node apps/cli/src/index.mjs auth login --provider openai-codex --method manual-oauth
node apps/cli/src/index.mjs auth complete --provider openai-codex "http://localhost:1455/auth/callback?code=...&state=..."
node apps/cli/src/index.mjs provider use openai-codex
node apps/cli/src/index.mjs provider default-model openai-codex gpt-5.4-mini
```

### 2. Boot Lucy QA and decide whether to resume

Example:
```bash
node apps/cli/src/index.mjs
node apps/cli/src/index.mjs state startup --detailed
node apps/cli/src/index.mjs state resume --detailed
node apps/cli/src/index.mjs state new-session --project checkout-web --detailed
```

What the startup and resume commands do:
- inspect the restart-safe state in the vault
- detect whether a resumable session exists
- offer resume vs new-session actions on fresh boot
- restore the last session summary, open tasks, bug drafts, last run context, and current journal
- archive the previous active context when starting a fresh session
- on the very first launch of a fresh vault, `node apps/cli/src/index.mjs` also prints a one-time Lucy QA QA cockpit screen with ASCII branding, ANSI styling, version/provider/model badges, QA power panels, integration status, and an onboarding handoff before showing the normal command list

### 2.5. Look up current framework docs

Example:
```bash
node apps/cli/src/index.mjs docs "playwright locator.filter" --detailed
```

What the docs command does:
- prioritizes the real Context7 MCP server for docs gathering
- retries Context7 up to 3 times before any fallback path is used
- falls back only after repeated Context7 failure
- prefers known documentation sources such as Playwright when hints match
- returns ranked links and short excerpts
- saves the lookup into session state/journal so Lucy QA can resume with that context later

### 3. Save durable project memory

Example:
```bash
node apps/cli/src/index.mjs memory save "Checkout staging note" --content "Login redirect is flaky on staging checkout." --category project --detailed
node apps/cli/src/index.mjs memory search "staging checkout" --trace
```

What memory commands do:
- save human-readable markdown notes into the vault
- organize notes by category folders
- search stored notes, saved session-summary markdown, and session-journal markdown by query terms
- keep project-specific testing knowledge local-first and inspectable

### 3. Plan QA coverage

Example:
```bash
node apps/cli/src/index.mjs qa plan "Create a QA plan for login page validation" --detailed
```

Expected output shape:
- test scope
- assumptions
- suite list
- case format
- severity model
- next steps

### 3. Generate atomic test cases

Example:
```bash
node apps/cli/src/index.mjs qa cases "Create atomic test cases for login page validation" --detailed
```

Expected output shape:
- atomic cases with IDs
- preconditions
- steps
- expected result
- evidence guidance

### 4. Generate Playwright automation starter

Example:
```bash
node apps/cli/src/index.mjs qa playwright "Generate a Playwright starter for login page validation with smoke coverage" --detailed
```

Expected output shape:
- runnable Playwright starter
- suggested fixtures
- locator strategy
- recording and evidence strategy
- flaky risk notes

### 5. Run Playwright automation

Example:
```bash
node apps/cli/src/index.mjs qa run tests/e2e/login.spec.js --base-url https://example.com --detailed
```

What `qa run` does:
- creates a unique run folder
- writes a run-specific Playwright config
- runs the configured Playwright runner
- records evidence using:
  - `video: 'on'`
  - `trace: 'on'`
  - `screenshot: 'only-on-failure'`
- stores stdout/stderr and report files
- summarizes pass/fail counts and artifact counts

### 6. Summarize an existing run

Example:
```bash
node apps/cli/src/index.mjs qa report artifacts/playwright/runs/<run-id> --detailed
```

What `qa report` does:
- loads a prior `report.json`
- summarizes case results
- shows failure summaries
- counts videos, traces, and screenshots in the run
- can be re-run later without executing tests again

### 7. Run native terminal commands from Lucy QA

Example:
```bash
node apps/cli/src/index.mjs qa exec "ffmpeg -i input.webm output.mp4" --trace
node apps/cli/src/index.mjs qa exec "bash scripts/run-regression.sh" --cwd /root/lucy-qa --timeout 300000 --detailed
```

What `qa exec` does:
- executes a native shell command
- supports custom working directory
- supports timeout-based termination
- returns stdout, stderr, exit code, and timeout state

---

## Evidence and artifact model

Lucy QA uses Playwright-native evidence collection by default.

### Default recording strategy
- video per test case: enabled
- trace per test case: enabled
- screenshot on failure: enabled

### Default artifact location pattern
```text
artifacts/playwright/runs/<run-id>/
```

Common files inside a run folder:
- `playwright.lucy.config.mjs`
- `report.json`
- `report.stdout.txt`
- `report.stderr.txt`
- `test-results/...`

Common evidence types inside `test-results`:
- `.webm`, `.mp4`, `.mov`, `.mkv` video files
- `.zip` Playwright trace files
- `.png`, `.jpg`, `.jpeg` screenshots

### ffmpeg usage
Lucy QA treats ffmpeg as an optional post-processing tool, not the primary recorder.

Recommended use cases for ffmpeg:
- convert `.webm` to `.mp4`
- compress large videos
- stitch multiple clips together for presentation

Example:
```bash
node apps/cli/src/index.mjs qa exec "ffmpeg -y -i artifacts/playwright/runs/<run-id>/test-results/videos/test.webm output.mp4" --trace
```

---

## Runner configuration for `qa run`

By default, `qa run` uses:
```bash
npx playwright test
```

You can override the runner through environment variables:
- `LUCY_QA_RUNNER_COMMAND`
- `LUCY_QA_RUNNER_ARGS_JSON`

Example:
```bash
export LUCY_QA_RUNNER_COMMAND=node
export LUCY_QA_RUNNER_ARGS_JSON='["/path/to/custom-runner.mjs"]'
node apps/cli/src/index.mjs qa run tests/e2e/login.spec.js --detailed
```

This is useful for:
- custom wrappers
- containerized runners
- CI adapters
- test harness shims

---

## Command details

### `qa plan`
Use this when you need a QA strategy before writing tests.

Best for:
- test scope definition
- assumptions and risks
- suite breakdown
- severity framing

### `qa cases`
Use this when you need atomic manual or automation-ready test cases.

Best for:
- requirement traceability
- case IDs
- manual execution sheets
- preconditions, steps, expected results, evidence guidance

### `qa playwright`
Use this when you want Lucy QA to generate Playwright starter code.

Best for:
- smoke test starters
- selector strategy
- fixture suggestions
- flaky-risk notes
- evidence collection guidance

### `qa run`
Use this to execute Playwright tests and collect evidence artifacts.

Best for:
- automated execution
- video/trace collection
- per-run artifact folders
- quick pass/fail summaries

### `qa report`
Use this to re-read and summarize a prior run folder.

Best for:
- reviewing old runs
- sharing execution summaries
- defect follow-up after a run already finished
- checking artifact counts without rerunning tests

### `qa bug`
Use this to turn a finding into a defect-ready bug report template.

Best for:
- converting observed failures into structured QA bugs
- making sure severity and priority are both captured
- standardizing bug fields before filing defects in another system

### `qa bugs --from-run`
Use this to generate bug drafts automatically from failed cases inside a prior run.

Best for:
- turning failed Playwright results into draft bugs quickly
- reviewing all failures from one run in a structured format
- avoiding manual copy-paste from report output into defect notes

### `qa exec`
Use this for Lucy QA controlled native command execution.

Best for:
- helper scripts
- ffmpeg post-processing
- shell-based QA utilities
- custom environment setup steps

---

## Practical examples

### Login QA end-to-end
```bash
node apps/cli/src/index.mjs qa plan "Create a QA plan for login page validation"
node apps/cli/src/index.mjs qa cases "Create atomic login test cases with positive and negative coverage"
node apps/cli/src/index.mjs qa playwright "Generate a Playwright login smoke starter with recording guidance"
node apps/cli/src/index.mjs qa run tests/e2e/login.spec.js --base-url https://example.com --trace
node apps/cli/src/index.mjs qa report artifacts/playwright/runs/<run-id> --detailed
```

### Post-process a recorded test video
```bash
node apps/cli/src/index.mjs qa exec "ffmpeg -y -i artifacts/playwright/runs/<run-id>/test-results/videos/test.webm artifacts/playwright/runs/<run-id>/test-results/videos/test.mp4" --trace
```

### Run a helper shell script
```bash
node apps/cli/src/index.mjs qa exec "bash scripts/run-login-regression.sh" --cwd /root/lucy-qa --timeout 300000 --detailed
```

---

## Current limitations

- `qa run` assumes a Playwright-compatible runner is available.
- Browsers may still need installation, for example:
  - `npx playwright install chromium`
- `qa playwright` generates starter specs and guidance, not guaranteed production-perfect selectors.
- `qa exec` is powerful and currently does not include command allowlisting or destructive-command confirmation.
- `qa report` depends on a valid `report.json` being present in the run directory.

---

## Related docs
- `README.md`
- `docs/architecture.md`
- `docs/providers.md`
- `docs/plans/2026-04-07-lucy-qa-v1-spec.md`
