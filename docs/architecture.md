# Architecture Overview

## Design principle
Use a thin integration layer around the harness so Lucy QA can evolve without becoming impossible to update.

## Layers
1. Harness layer
- session runtime
- model/tool orchestration
- command execution backbone
- provider abstraction so Lucy QA can route requests to native Codex OAuth or OpenAI-compatible proxies such as gcli2api

2. Domain layer
- QA planning
- Playwright generation and execution
- UI/UX review
- business-process reasoning
- research workflows
- QA baseline enforcement from Mengenal QA v1.8: SDLC/STLC framing, traceability, test-case completeness, defect lifecycle, and severity/priority distinction

3. Knowledge layer
- Context7 documentation lookup
- durable project notes and testing memory
- QA reference notes including Mengenal QA v1.8 baseline stored in the vault for retrieval and reuse

4. Persistence layer
- Obsidian vault as human-readable memory
- local index for retrieval and search

## Initial package boundaries
- `apps/cli`: user-facing command line interface
- `packages/auth-codex`: auth adapter and token storage
- `packages/harness-adapter`: runtime integration with the chosen harness
- `packages/qa-core`: planning, test-case generation, bug-report generation
- `packages/qa-playwright`: Playwright generation, execution, evidence collection
- `packages/context7-client`: up-to-date docs retrieval
- `packages/research-engine`: planning/search/synthesis workflow
- `packages/memory-obsidian`: save/search/index notes in vault
- `packages/i18n`: language detection and bilingual templates
- `packages/shared-types`: common interfaces
