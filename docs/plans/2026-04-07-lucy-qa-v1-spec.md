# Lucy QA v1 Spec

## Vision
Lucy QA is a personal agentic AI built for serious software quality work. It should feel like a senior QA engineer, E2E automation engineer, product-minded tester, and practical UI/UX reviewer in one system.

It must be:
- fluent in Bahasa Indonesia and English
- excellent at Playwright-based E2E testing
- able to use recent documentation via Context7
- able to research and synthesize like a strong autonomous research agent
- able to retain durable project memory using an Obsidian vault
- usable as a local-first personal assistant rather than a generic SaaS chatbot

## v1 Goal
Deliver one polished vertical workflow:
1. user logs in with OpenAI Codex OAuth-style auth
2. user gives a QA/testing objective
3. Lucy QA plans the test approach
4. Lucy QA generates Playwright tests or QA artifacts
5. Lucy QA runs tests and captures evidence
6. Lucy QA summarizes findings in Indonesian or English
7. Lucy QA stores important notes in the Obsidian memory vault

## v1 User Promise
"Give Lucy QA a feature, flow, or website, and it can research it, generate Playwright tests, run them, explain failures clearly, and remember the project context for later."

## Primary Personas

### 1. Founder / Operator
Needs:
- fast QA coverage
- understandable reports
- bilingual explanations
- low setup overhead

### 2. QA Engineer
Needs:
- reliable Playwright support
- reusable test generation
- evidence artifacts
- traceable findings

### 3. Product / Business Analyst
Needs:
- business-flow analysis
- edge-case discovery
- UI/UX review
- structured recommendations

## v1 In-Scope Features

### A. Auth and Provider Access
- command: `lucy auth login --provider openai-codex`
- secure local token storage
- auth status command
- support a second backend mode for OpenAI-compatible providers, including local proxy bridges such as gcli2api
- allow configurable `base_url`, `api_key`, and model mapping for proxy-backed providers

### B. QA Planning
- command: `lucy qa plan "<goal>"`
- outputs:
  - test scope
  - risks
  - happy path
  - negative path
  - edge cases
  - business-process assumptions

### C. Playwright Generation
- command: `lucy qa generate-e2e "<goal>" --tool playwright`
- output:
  - runnable Playwright spec
  - suggested fixtures
  - selectors/locator strategy
  - notes on flaky risks

### D. Playwright Execution
- command: `lucy qa run <spec-or-folder>`
- output:
  - pass/fail summary
  - screenshots
  - trace path
  - human-readable explanation of failures

### E. Context7 Docs Lookup
- command: `lucy docs <query>`
- purpose:
  - fetch current Playwright/framework docs
  - reduce stale-code generation

### F. Research Mode
- command: `lucy research "<question>"`
- purpose:
  - Dexter-like planning/search/extract/synthesize loop
  - use web + docs + local notes

### G. Memory via Obsidian Vault
- save project summaries, testing strategies, bug patterns, app-specific notes
- retrieve them later by project/domain/topic

### H. Bilingual Output
- if user asks in Indonesian, answer in Indonesian by default
- if user asks in English, answer in English by default
- allow bilingual report templates

## Explicitly Out of Scope for v1
- multi-user SaaS collaboration
- cloud orchestration dashboard
- mobile app
- autonomous long-running browser farm
- deep visual cloning beyond QA reconnaissance
- full enterprise test management integration suite

## Success Criteria for v1
- user can authenticate locally
- user can ask for Playwright test generation and get runnable code
- user can run tests from Lucy QA CLI
- user receives useful evidence and summary
- Lucy QA can fetch recent docs with Context7
- Lucy QA can save and retrieve project memory from Obsidian vault
- Indonesian and English responses both feel natural

## Core UX Commands
- `lucy auth login --provider openai-codex`
- `lucy auth whoami`
- `lucy doctor`
- `lucy qa plan "Login and checkout flow"`
- `lucy qa generate-e2e "Inventory transfer flow" --tool playwright`
- `lucy qa run tests/e2e`
- `lucy qa uiux-audit https://example.com`
- `lucy research "Best Playwright strategy for ERP permissions testing"`
- `lucy docs playwright locator.filter`
- `lucy memory search "checkout regression"`

## Technical Architecture for v1

### Core runtime
- base harness: claw-code
- wrap rather than deeply fork initially

### Provider strategy
Support two initial provider lanes:
1. Native OpenAI Codex OAuth lane
2. OpenAI-compatible lane for proxy backends such as gcli2api

The OpenAI-compatible lane should support:
- custom base URL
- API key or shared password style auth
- model alias mapping
- response normalization for streaming/tool-calling differences where possible

Preferred user flow:
1. choose provider
2. authenticate / connect
3. fetch available models from the provider when supported
4. choose a main default model
5. optionally define task-level preferences for QA, research, coding, and UI/UX

### v1 packages
- `packages/auth-codex`
- `packages/harness-adapter`
- `packages/qa-core`
- `packages/qa-playwright`
- `packages/context7-client`
- `packages/research-engine`
- `packages/memory-obsidian`
- `packages/i18n`
- `packages/shared-types`

### apps
- `apps/cli`
- `apps/api` optional thin local API for future expansion

### memory strategy
- Obsidian markdown vault as source of truth
- local index for retrieval
- note classes:
  - user
  - project
  - runs
  - bugs
  - testing patterns
  - framework notes

## QA Differentiators
- evidence-first reporting
- Playwright-first design
- can reason about business process and not just selectors
- can critique UI/UX from a tester and researcher perspective
- remembers project-specific testing knowledge
- bilingual natural communication
- follows Mengenal QA v1.8 baseline for SDLC/STLC traceability, atomic test cases, bug lifecycle discipline, and beginner-friendly QA outputs

## QA Baseline Rules for v1
Lucy QA v1 should internalize these rules in `/qa` mode:
- QA is quality ownership across the lifecycle, not only bug finding at the end.
- Balance prevention and detection.
- Prioritize by business impact and risk.
- Keep traceability from requirement to test scenario to test case to execution to defect to retest/closure.
- Test cases must be atomic, reproducible, and include Preconditions, Steps, Expected Result, Actual Result, Status, and Evidence.
- Bug reports must include title, environment, precondition, exact steps, expected vs actual, severity, priority, and evidence.
- Validate UI and UX together, not separately.
- Start with smoke/sanity on critical paths, then expand by risk.
- Default `/qa` outputs must include test scope, assumptions, suite list, case format, severity model, and next steps.

## Research Differentiators
- not just web search
- must compare sources, rank confidence, and cite reasoning
- should save stable knowledge to memory when useful

## Risks
- OAuth flow may change or be unofficial
- harness integration may drift if claw-code changes rapidly
- memory can become noisy without note hygiene
- generated E2E tests can still be brittle without good locator strategy

## Risk Mitigations
- isolate auth behind an adapter
- keep harness integration thin
- structure vault carefully
- enforce Playwright best-practice templates
- use Context7 before generating framework-heavy code

## Best Next Build Order
1. scaffold repo
2. auth adapter stub
3. CLI skeleton
4. Playwright generate/run flow
5. Context7 command
6. Obsidian memory save/search
7. bilingual templates
8. research mode

## Definition of Done for v1
Lucy QA is considered v1-ready when:
- it can log in
- generate a Playwright test from a plain-language goal
- run the test successfully
- summarize results with evidence
- use current docs when needed
- remember project context in the vault
