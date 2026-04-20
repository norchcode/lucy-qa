# Lucy QA Workflow Guide

This guide explains the practical end-to-end QA flow currently supported by Lucy QA.

## Core workflow

1. Authenticate with the chosen provider
2. Select the active provider and model
3. Answer onboarding questions for QA/test management and issue tracker systems
4. Decide whether to resume previous work or start a new session
5. Look up current framework docs when needed
6. Save or retrieve durable project memory
7. Create a QA plan
8. Create atomic test cases
9. Generate Playwright starter automation
10. Run Playwright with evidence capture
11. Summarize the run
12. Draft defect-ready bug reports from findings
13. Optionally execute supporting shell commands

## Why the workflow is split

Lucy QA intentionally separates:
- planning
- case design
- automation generation
- execution
- reporting

That separation helps with:
- traceability
- reusability
- easier debugging
- clearer artifact management

## State and memory layer

### `state startup`
Checks persistent state on boot and offers resume vs new-session guidance.

Useful for:
- automatic startup orientation after a restart
- deciding whether to continue the previous workflow
- seeing whether Lucy QA still has unfinished tasks

### `state resume`
Restores the active session context and marks the session as resumed.

Useful for:
- continuing the previous QA investigation
- restoring the latest run and bug-draft context
- picking up suggested next steps quickly

### `state new-session`
Archives the previous active state and starts clean.

Useful for:
- switching to a different project
- intentionally discarding stale in-progress context
- avoiding accidental carry-over from old tasks

### `state save-session`
Stores restart-safe short-term session context.

Useful for:
- what is currently in progress
- which project is active
- what should be resumed after interruption

### `state show`
Loads the latest resume context from disk.

Useful for:
- startup orientation after machine restart
- recovering recent ongoing work
- seeing the last run, recent bug draft context, and journal status

### `state journal`
Shows the rolling current-session journal.

Useful for:
- reviewing recent decisions and unresolved items
- seeing which commands and artifacts matter in the current session
- checking the latest conversation-grade summary without reading raw transcripts

### `memory save`
Stores durable project notes as human-readable markdown.

Useful for:
- project quirks
- environment caveats
- flaky behavior notes
- app-specific testing reminders

### `memory search`
Finds previously saved notes and session-summary snapshots from the vault.

Useful for:
- recalling prior project context
- checking known bug patterns
- reusing testing knowledge across sessions

### `docs`
Looks up current framework or tool documentation before Lucy QA generates framework-heavy output.

Useful for:
- refreshing Playwright guidance before spec generation
- reducing stale framework assumptions
- capturing docs links in the current session journal

### `agent` / `qa agent`
Lucy QA now has an autonomous entrypoint that routes natural-language goals into existing QA workflows.

Examples:
- `agent "review latest run"`
- `qa agent "draft bugs from latest run"`
- `agent "publish latest run to Qase"`
- `agent "run tests/e2e/login.spec.js against https://example.test"`

Current autonomous routing supports:
- latest-run report review using saved Lucy QA state
- grouped bug drafting from the latest run
- latest-run publishing to configured test management
- QA plan generation
- QA case generation
- Playwright starter generation
- QA run execution when a spec/target is recognizable

When Lucy QA lacks enough context, it now asks for clarification instead of silently failing.

### Provider presets and custom endpoints
Lucy QA now supports writable provider configuration for:
- preset AdaCODE setup
- preset CLIProxyAPI setup
- generic OpenAI-compatible endpoints for custom providers and gateways

Useful commands:
- `provider presets`
- `provider setup adacode --preset adacode --api-key-env ADACODE_API_KEY --model claude-sonnet-4-6 --set-default`
- `provider setup local-gateway --preset cliproxyapi --base-url http://127.0.0.1:8080/v1 --api-key-env CLIPROXYAPI_API_KEY --model gpt-5`
- `provider setup github-copilot --preset github-copilot --api-key-env COPILOT_GITHUB_TOKEN --model gpt-4o`
- `provider setup "use github copilot and make it default"`
- `provider setup custom-bridge --preset openai-compatible --base-url https://api.example.com/v1 --api-key-env MY_API_KEY --model my-model`

Writable config path resolution:
- if `LUCY_QA_PROVIDER_CONFIG_PATH` is set, Lucy QA reads and writes there
- otherwise `config/providers.local.json` is used for writable local overrides
- otherwise the bundled example config is used for read-only defaults

GitHub Copilot note:
- Lucy QA can now check Copilot auth with `auth status --provider github-copilot`
- Lucy QA can now configure a reusable Copilot provider from an env token with `auth login --provider github-copilot --set-default`
- env token discovery uses `COPILOT_GITHUB_TOKEN`, then `GH_TOKEN`, then `GITHUB_TOKEN`
- the provider itself still uses the OpenAI-compatible Copilot endpoint plus the required `Copilot-Integration-Id` header
- this is env-token-based Copilot auth/setup, not a full import of GitHub Copilot CLI keychain credentials or a custom GitHub OAuth app flow yet

### `qa learning`
Shows Lucy QA's self-improvement loop state.

The loop now does three things automatically when Lucy QA saves session context:
- persists high-signal memory notes from decisions and repeated workflows
- creates or refines reusable workflow skills when certain command patterns repeat
- runs a periodic self-evaluation every 5 session updates and records a nudge snapshot

Artifacts are stored under:
- `vault/qa-learning/self-improvement.json`

This makes Lucy QA behave more like a compounding agent instead of a stateless command wrapper.

### `qa onboarding`
Captures the systems your team uses for:
- QA/test management
- QA/test management project/code
- issue/task tracking
- optional project/team key
- preferred bug-handling workflow

You can answer conversationally too, for example:
- `qa onboarding "we use qase project WEB and jira project QA"`
- you do not need to provide everything at once; Lucy QA now keeps asking only for the missing pieces during first-run setup

It now also supports separate integration credential storage and connection testing for supported systems:
- Jira base URL, email, and API token
- Qase base URL and API token

Credential behavior:
- stored separately from onboarding profile in `vault/qa-config/credentials.json`
- file permissions are tightened to `0600`
- CLI output only shows masked token values
- later Jira/Qase workflows reuse stored credentials automatically

Lucy QA now shows this onboarding prompt:
- on startup
- after provider auth status checks
- after provider login completion

On the very first launch of a fresh vault, Lucy QA now also:
- prints a one-time ASCII Lucy QA cockpit screen in the terminal
- shows version plus provider/model badges when available
- shows QA powers, integration readiness, and recommended first-step panels
- auto-hands off into onboarding immediately after the hero panels
- records that the welcome screen was shown so later startups stay clean

Saved onboarding values are now reused as defaults for:
- defect linkage tracker selection
- grouped bug drafts from runs
- bug workflow guidance in defect reports
- Qase run publishing project selection
- Jira remote defect filing defaults

## Planning layer

### `qa plan`
Produces strategic QA structure:
- test scope
- assumptions
- suite list
- severity model
- next steps

### `qa cases`
Produces atomic cases and now also performs intake-aware case shaping:
- stable IDs
- preconditions
- short beginner-friendly steps
- one expected outcome per case
- evidence guidance
- explicit testing-mode recognition (E2E, whitebox, blackbox, API, unit, integration)
- asks for clarification instead of guessing when the testing type is unclear
- repo stack detection when local framework signals exist
- optional live-target inspection via `--target-url <url>` for deployed app signals, runtime stack clues, fetched HTML analysis, browser-backed DOM inspection after hydration, lightweight interactive probing of safe controls, and optional Cloudflare crawl site discovery when configured
- DOM-risk and selector-strategy guidance inferred from the goal and enriched by runtime HTML, browser-backed DOM inspection, safe interactive probe findings, Cloudflare crawl route discovery, plus reusable project knowledge when available
- Context7 documentation hints injected into the case-generation prompt

### `qa plan`
Now also performs intake-aware planning before drafting the plan:
- explicit testing-type recognition (E2E, whitebox, blackbox, API, unit, integration)
- asks for clarification instead of guessing when the testing type is unclear
- repo stack hints
- optional live-target inspection via `--target-url <url>` for deployed app signals, runtime stack clues, initial HTML DOM counts, browser-backed DOM counts, safe interactive probe observations, and optional Cloudflare crawl route discovery when available
- DOM-risk and selector guidance for UI-heavy work, now including proven interactive controls, reusable project knowledge, and known project risks when available
- Context7 documentation hints for framework-aware planning

## Automation layer

### `qa playwright`
Produces a Playwright starter designed around:
- smoke-first coverage
- resilient selectors
- fixture suggestions
- recording and evidence guidance
- flaky-risk notes
- detected testing mode, stack hints, runtime/live-target clues, DOM risks, and Context7 docs hints when available

## Execution layer

### `qa run`
Runs the selected spec or folder and creates a per-run artifact directory.

It now also builds an intake context for execution time using:
- explicit E2E Playwright execution intent
- optional `--base-url <url>` live-target inspection
- runtime clues
- browser-backed DOM clues
- lightweight safe interactive probe findings when available

Execution-time behavior now includes:
- writing `qa-intake.json` into the run directory
- writing `qa-docs-context.json` when docs hints were gathered
- deriving an execution profile for the run
- forcing serial execution when live-target UI risks suggest safer single-worker execution
- auto-saving reusable QA knowledge into the vault under `qa-knowledge/` so later plans and runs can reuse learned risks, routes, frameworks, and selector strategy hints

Evidence defaults:
- video: on
- trace: on
- screenshot: only-on-failure

## Reporting layer

### `qa report`
Reads an existing run folder and summarizes:
- case counts
- failures
- artifact counts
- report file paths
- stored intake context when available
- execution profile when available
- reusable knowledge key and report insights when available
- cross-run failure intelligence such as recurring failures, likely flaky patterns, and likely regression signals when project knowledge exists
- stable defect signatures and grouped defect candidates so multiple failing cases can be treated as one underlying defect
- annotated screenshot companions when screenshots and defect hints are available
- vision-assisted screenshot box suggestions via fixture or external command hooks when exact bounding boxes are not provided

Visual annotation support:
- add optional `qa-defect-hints.json` to a run directory
- define case-level or screenshot-level bounding boxes plus a short description
- Lucy QA will generate annotated SVG companions under `annotated-screenshots/`
- if no precise boxes are provided, Lucy QA can still generate a review-aid overlay with a conservative fallback box and defect summary

### `qa report publish`
Publishes a completed run summary into the configured QA/test management system.

Currently implemented:
- Qase run creation using onboarding defaults or `--project <CODE>`
- optional `--close-run` completion step after publishing

Environment variables:
- `QASE_API_TOKEN` or `LUCY_QA_QASE_API_TOKEN`
- optional `QASE_BASE_URL` or `LUCY_QA_QASE_BASE_URL`

## Defect layer

### `qa bug`
Turns a finding into a structured bug report draft.

Useful for:
- converting failed scenarios into defect-ready text
- preserving expected vs actual framing
- keeping severity and priority separate
- reminding the tester to attach evidence
- enriching defects with execution profile, selector strategy, routes, and known risks when context is available

### `qa bugs --from-run`
Builds multiple draft bug reports from failed cases in an existing run directory.
It now reuses stored intake, execution profile, crawl/interaction clues, docs queries, knowledge context, cross-run failure intelligence, stable defect signatures, grouped defect candidates, linked issue-tracker metadata, and annotated screenshot companions from the run when those files exist.

### `qa defects list`
Shows persisted defect signatures for the current project knowledge scope, including tracker linkage when present.

### `qa defects link`
Links a defect signature to a real issue-tracker bug ID plus tracker metadata.

Recommended fields:
- `--bug-id BUG-123`
- `--tracker jira|linear|generic`
- `--tracker-url https://tracker/...`
- `--tracker-title "short bug title"`
- `--tracker-status Open|In Progress|Done`
- `--status open|resolved|likely-flaky|duplicate`

### `qa defects update`
Updates tracker metadata or defect status for an already linked signature.

### `qa defects file-remote`
Creates a real remote tracker issue from a saved defect signature, then automatically links the returned bug ID back into Lucy QA knowledge.

Currently implemented:
- Jira issue creation as `Bug`
- onboarding-based defaults for tracker selection and issue project key

Environment variables:
- `JIRA_BASE_URL` or `LUCY_QA_JIRA_BASE_URL`
- `JIRA_EMAIL` or `LUCY_QA_JIRA_EMAIL`
- `JIRA_API_TOKEN` or `LUCY_QA_JIRA_API_TOKEN`

Useful for:
- batch defect drafting after one automation run
- quickly reviewing failed-case output in bug-report format
- turning execution evidence into filing-ready text faster

## Utility layer

### `qa exec`
Runs supporting shell commands from inside Lucy QA.

Useful for:
- helper scripts
- ffmpeg conversion
- environment setup
- custom QA tooling

## Evidence philosophy

Lucy QA prefers native Playwright evidence first:
- videos per case
- traces per case
- screenshots on failure

ffmpeg is treated as optional post-processing, not the primary recorder.

## Suggested team usage

### Fast smoke cycle
- `qa playwright`
- `qa run`
- `qa report`

### Full manual-to-automation cycle
- `qa plan`
- `qa cases`
- `qa playwright`
- `qa run`
- `qa report`

### Artifact post-processing cycle
- `qa run`
- `qa report`
- `qa exec "ffmpeg ..."`

## Documentation map

For the full command reference, see:
- `docs/cli.md`
