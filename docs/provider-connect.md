# Provider Connect and Model Discovery

Lucy QA now has an initial connect/discovery/default-model persistence flow.

## Current commands
- `node apps/cli/src/index.mjs provider connect <name>`
- `node apps/cli/src/index.mjs provider models <name>`
- `node apps/cli/src/index.mjs provider default-model <name> <model>`

## Current behavior
- `provider connect` marks the provider as connected in local state
- `provider models` discovers live models when the backend supports it
- `provider default-model` stores a chosen main model in local state

## State storage
Provider state is currently stored in:
- `~/.lucy/provider-state.json`

Stored sections:
- connected
- discovered_models
- default_models

## Notes
- OpenAI-compatible providers attempt live discovery from `/v1/models`
- Native Codex currently falls back to configured model lists until a real model discovery path is added
- This is the correct direction for the user flow: provider -> login/connect -> model discovery -> choose default model -> task preferences
