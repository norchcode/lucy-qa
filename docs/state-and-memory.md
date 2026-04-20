# Lucy QA State and Memory Architecture

This document explains the difference between Lucy QA short-term persistent state and long-term durable memory.

## Why both layers exist

Lucy QA needs two different persistence models:

1. Short-term persistent state
   - used for restart-safe session recovery
   - answers: what was I doing, what run happened last, what should I resume

2. Long-term durable memory
   - used for project knowledge that should survive across many sessions
   - answers: what do we know about this project, what patterns have we learned, what quirks matter later

These are related, but they are not the same thing.

---

## Short-term persistent state

Current implementation stores state under:
```text
<vault>/state/
```

### Current files
- `session.json`
- `current-session.md`
- `open-tasks.json`
- `last-run.json`
- `last-bugs.json`

### Session-history files
Lucy QA now also writes restart-friendly session history snapshots under:
```text
<vault>/sessions/
```

These snapshots are markdown + JSON companions, so the agent can search them later and a human can read them directly.

### Journal files
Lucy QA now also keeps a rolling conversation/session journal under:
```text
<vault>/journals/
```

Current journal files:
- `current-session.json`
- `current-session.md`
- `archive/*.json`
- `archive/*.md`

### Current purpose of each file

#### `session.json`
Contains:
- summary
- current project
- recent commands
- updated timestamp

#### `current-session.md`
Human-readable companion to `session.json`.

#### `open-tasks.json`
Stores resumable tasks still in progress.

Current behavior:
- can be saved manually with `state open-tasks`
- is auto-updated by workflow commands like `qa plan`, `qa cases`, `qa playwright`, `qa run`, `qa report`, `qa bug`, and `qa bugs --from-run`

#### `last-run.json`
Tracks the latest QA automation run, including:
- run ID
- run directory
- status
- target
- report path

#### `last-bugs.json`
Tracks the latest bug drafting activity, including:
- source run directory if relevant
- generated bug drafts

---

## Long-term durable memory

Current implementation stores notes as markdown files under category folders in the chosen vault.

Examples:
```text
<vault>/project/
<vault>/bugs/
<vault>/general/
```

### Current commands
- `memory save`
- `memory search`

### Current note behavior
- notes are markdown files
- notes are human-readable
- notes use simple frontmatter
- notes are organized by category

This makes the vault inspectable and editable without the agent.

---

## Current auto-save behavior

Lucy QA currently auto-updates short-term state and the rolling journal from:
- `ask`
- `qa plan`
- `qa cases`
- `qa playwright`
- `qa run`
- `qa report`
- `qa bug`
- `qa bugs --from-run`
- `state save-session`
- `state resume`
- `state new-session`

That means when the session restarts, Lucy QA can recover:
- the latest run context
- the latest bug drafting context
- the latest saved session summary
- the most recent suggested open tasks
- session-history snapshots under `<vault>/sessions/`
- a rolling current-session journal plus archived journals under `<vault>/journals/`

---

## Startup and resume behavior

Current behavior on fresh boot:
1. Running `lucy` inspects persisted state automatically
2. If resumable context exists, Lucy QA offers:
   - `state resume`
   - `state new-session`
   - `state show`
3. `state resume` restores the active session summary and marks the session as resumed
4. `state new-session` archives the prior active context and clears open tasks / last-run / bug-draft state for a clean start

This gives Lucy QA both a proactive startup offer and an explicit manual resume command.

Phase-1 journal behavior now adds:
- a rolling current-session journal for recent decisions, unresolved items, commands, and artifacts
- archived journal snapshots when a new session is started
- searchable markdown journals that work with the existing full-text memory search

---

## Current limitations

- open-task persistence is suggestion-based rather than a fully interactive task manager
- recent conversation summaries are still compact command-driven snapshots, not full transcript replay
- durable memory search is currently full-text / keyword-based, not semantic
- state is local-file based and not yet synchronized across machines
- there is no automatic project inference yet when saving session summaries

---

## QMD position

QMD is not required for the current architecture.

Current position:
- markdown vault and structured state files are the foundation
- QMD can be added later as an optional semantic retrieval enhancement
- QMD should not be a required dependency for v1 persistence

---

## Harness note

Lucy QA is currently designed around a claw-code-style harness integration.
The current repo documents this in:
- `README.md`
- `docs/architecture.md`
- `docs/plans/2026-04-07-lucy-qa-v1-spec.md`

The live implementation currently uses a thin `packages/harness-adapter` layer rather than embedding the full upstream harness directly into the Lucy QA codebase.
