# Lucy QA Architecture Status

This document is a blunt snapshot of what is currently completed, partially completed, and missing in Lucy QA.

It is intentionally more honest than aspirational.

## Executive summary

Lucy QA is no longer just a scaffold.
It now has a real QA workflow vertical slice with:
- provider/auth flows
- QA planning and case generation
- Playwright generation and execution
- reporting and bug drafting
- persistent state and Obsidian-style memory
- startup resume detection

But the architecture is still incomplete.

Best current label:
- core workflow implemented
- platform architecture incomplete

## Overall scorecard

### Strong / real today
- CLI workflow for QA planning, execution, reporting, and bug drafting
- provider/auth backbone
- Playwright evidence model
- restart-safe local persistence
- Obsidian-style durable memory
- startup resume and new-session flow
- phase-1 session journal layer
- full-text search across notes, session summaries, and journals

### Partial / usable but not mature
- harness abstraction
- QA domain separation
- i18n/bilingual behavior
- run controls and CI-grade execution options
- session journaling depth
- memory schemas and retrieval quality

### Missing / clearly not done
- research engine
- real UI/UX audit command
- semantic retrieval layer such as QMD (kept optional and not adopted)
- apps/api
- automated issue tracker export/create flows beyond local linkage metadata
- full conversation journal / transcript-grade recall

## Status by architecture layer

## 1. Harness layer

Target intent from architecture/spec:
- thin integration around claw-code-style harness
- model/tool orchestration
- provider abstraction
- execution backbone

Current status:
- partial

What is real:
- `packages/harness-adapter` exists
- provider loading, model selection, provider switching, provider connection, and model discovery are working through the adapter path
- native Codex-oriented auth and OpenAI-compatible client flows are wired enough for the CLI workflow

What is incomplete:
- `packages/harness-adapter/src/index.mjs` still reports `implemented: false`
- the adapter is still more of a thin provider/runtime layer than a fully realized harness abstraction
- Lucy QA is not embedding the full upstream claw-code harness directly

Blunt verdict:
- the harness direction is real
- the harness abstraction is not complete

## 2. Provider and auth layer

Target intent:
- local auth
- provider selection
- OpenAI Codex lane
- OpenAI-compatible lane
- model discovery and default-model control

Current status:
- strong

What is real:
- auth status/login/complete/pending flows
- provider list/show/active/connect/use/models/default-model
- local provider state and preferences
- direct provider routing from the CLI
- native Codex and OpenAI-compatible transport paths in use

Caveat:
- `packages/provider-openai-compatible/src/index.mjs` still reports `implemented: false`, even though the actual client path is functional enough for the current CLI usage

Blunt verdict:
- this is one of the strongest parts of the current architecture

## 3. QA domain layer

Target intent:
- QA planning
- test-case generation
- Playwright generation
- Playwright execution
- reporting
- bug drafting
- business-process reasoning
- UI/UX review

Current status:
- mixed, but the main vertical slice is real

What is real:
- `qa plan`
- `qa cases`
- `qa playwright`
- `qa run`
- `qa report`
- `qa bug`
- `qa bugs --from-run`
- `qa exec`

What is partial:
- some logic still lives in CLI glue rather than clean shared domain modules
- bug drafting is now enriched by stored run intake/execution context, cross-run failure intelligence, stable defect signatures, grouped defect candidates, and annotated screenshot companions when available, but it is still template-heavy rather than a full defect-intelligence subsystem
- the new QA intake pipeline now treats explicit test-type labels as authoritative, asks for clarification instead of guessing when type is unclear, can inspect deployed targets via `--target-url` using fetched HTML/runtime clues, browser-backed DOM inspection, lightweight interactive probing of safe controls, and optional Cloudflare crawl site discovery, now also feeds `qa run` execution metadata plus execution-profile selection, and auto-saves reusable project QA knowledge into the vault; it still is not yet a full exploratory browser agent or network-trace-driven execution planner
- UI/UX review is present in the product vision, but not implemented as a first-class CLI feature
- research/business-analysis capabilities are more implied than implemented

Blunt verdict:
- the QA vertical slice is strong enough to count as real
- the broader QA platform layer is still incomplete

## 4. Playwright execution layer

Target intent:
- generate Playwright artifacts
- run tests
- capture evidence
- summarize results clearly

Current status:
- strong for v1

What is real:
- run planning
- run-specific config generation
- Playwright execution wrapper
- report parsing and rerendering
- videos/traces/screenshots collection
- reread existing run folders with `qa report`

What is partial:
- richer controls like browser/project selection, grep, retries, workers, sharding, headed/headless, and stronger CI semantics are still missing or basic
- spec-writing/refinement loop is still immature

Blunt verdict:
- this is the most convincing implemented product slice in the repo

## 5. Knowledge and persistence layer

Target intent:
- Obsidian vault as source of truth
- local retrieval and search
- durable notes
- project memory
- resumable state

Current status:
- good foundation, not final form

What is real:
- markdown note saving
- note search
- persistent session state
- last-run and last-bugs tracking
- open-task persistence
- session-summary snapshots in `<vault>/sessions/`
- startup resume detection
- `state resume` and `state new-session`
- full-text search across notes and saved session summaries

What is partial:
- note classes are still lightweight rather than strongly schema-driven
- session memory is still summary-based, not full conversation replay
- open tasks are suggested-state persistence, not a fully interactive task system
- retrieval is full-text only, not semantic

Blunt verdict:
- memory-obsidian is now real enough to matter
- the full memory architecture is still phase 1, not done

## 6. Context/docs layer

Target intent:
- recent docs lookup via Context7
- reduce stale framework guidance

Current status:
- implemented

Evidence:
- `packages/context7-client/src/index.mjs` now talks to the real Context7 MCP server via `npx @upstash/context7-mcp`
- `docs <query>` now exists in the CLI
- docs lookups are also persisted into session state/journal
- the client retries Context7 up to 3 times before allowing fallback

Blunt verdict:
- the v1 docs lookup promise is now materially implemented with a real Context7-backed path that is explicitly prioritized over fallback

## 7. Research layer

Target intent:
- research/search/synthesis workflow
- use web + docs + local notes

Current status:
- missing

Evidence:
- `packages/research-engine/src/index.mjs` still returns `implemented: false`
- there is no real research CLI flow yet

Blunt verdict:
- not started in product terms

## 8. i18n / bilingual layer

Target intent:
- natural Indonesian and English responses
- bilingual-friendly templates

Current status:
- partial at best

What is real:
- there is an `i18n` package
- some language direction exists in the project docs and vision

What is missing:
- no convincing repo-wide bilingual output system yet
- no strong evidence that Indonesian/English default behavior is fully productized

Blunt verdict:
- still below the v1 promise level

## 9. API / extensibility layer

Target intent:
- optional `apps/api`
- future expansion path beyond CLI

Current status:
- missing

Blunt verdict:
- acceptable for now, but still absent compared to the original architecture picture

## Command-surface status

### Working enough to rely on
- auth status
- auth login
- auth complete
- auth pending
- provider list/show/active/connect/use/models/default-model
- ask
- docs
- state startup
- state save-session
- state open-tasks
- state show
- state journal
- state resume
- state new-session
- memory save
- memory search
- qa plan
- qa cases
- qa playwright
- qa run
- qa report
- qa bug
- qa bugs --from-run
- qa exec

### Missing from the original product vision
- research command
- UI/UX audit command
- doctor/whoami style support commands
- richer memory/project retrieval UX

## Reality check against the v1 spec

### Mostly satisfied
- user can authenticate locally
- user can ask for Playwright generation and get useful output
- user can run tests from Lucy QA CLI
- user receives evidence and summaries
- Lucy QA can save and retrieve project memory from an Obsidian-style vault

### Not yet satisfied
- Lucy QA can research and synthesize as a real research agent
- Indonesian and English responses both feel natural as a built-in product behavior
- UI/UX review exists as a first-class implemented capability

## Main architecture gaps

If we prioritize the biggest remaining gaps, they are:

1. research engine
2. richer Playwright run controls
3. cleaner shared domain/reporting abstractions
4. stronger bilingual output system
5. semantic retrieval integration after current QMD evaluation

## Recommended next build order

Near-term recommendation:
1. evaluate QMD as an optional retrieval enhancement now that journal structure exists
2. implement Context7 docs integration
3. implement research engine
4. tighten QA domain separation and richer reporting abstractions
5. improve bilingual behavior and richer memory schemas

If the goal is closest alignment with the original v1 promise, the order should be:
1. Context7
2. journal layer
3. research engine
4. i18n improvements

## Honest conclusion

Lucy QA is currently best understood as:
- a working QA-focused CLI with persistence and memory foundations
- not yet a fully completed QA agent platform

It has achieved a meaningful vertical slice.
It has not yet achieved the full architecture described in the original vision.
