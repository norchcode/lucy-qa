# Provider Configuration

Lucy QA is planned to support two provider lanes:

1. Native OpenAI Codex OAuth
2. OpenAI-compatible proxy providers such as gcli2api

## Why this matters
This lets Lucy QA use direct Codex-style auth when available, while also supporting proxy bridges that expose an OpenAI-style API for other model ecosystems.

## Example config
See:
- `config/providers.example.json`

## OpenAI Codex lane
Use when you want direct Codex auth and Codex-first model selection.

Current implementation status:
- reads auth from Codex login state by default at `~/.codex/auth.json`
- reads current model catalog from `~/.codex/models_cache.json` when available
- uses the local `codex exec` CLI transport by default for native Codex runs
- supports Responses API as an optional advanced transport when a real API-scoped key is available
- supports an OpenClaw-style manual OAuth flow for headless login: generate browser URL, then paste back the localhost callback URL into the CLI

Important note:
- Codex-focused models such as `gpt-5-codex` are Responses-API-first models.
- However, ChatGPT/Codex login tokens may not have `api.responses.write`, so Lucy QA now prefers the local Codex CLI transport for the native Codex lane instead of assuming direct API access.
- The manual OAuth flow is mainly for obtaining Codex/ChatGPT login state on headless machines; it does not guarantee API-write scopes for direct Responses API usage.

## OpenAI-compatible lane
Use when you want Lucy QA to talk to a local or remote OpenAI-style endpoint.

Current implementation status:
- live model discovery via `GET /v1/models`
- real chat execution via `POST /v1/chat/completions`
- response normalization into a consistent `{ text, message, usage, raw }` shape
- timeout handling and backend error surfacing

Typical fields:
- `base_url`
- `api_key` or `api_key_env`
- `model`
- `default_model`
- `available_models`
- `model_aliases`
- `task_model_preferences`
- `timeout_ms`
- `default_headers`

Example gcli2api local URL:
- `http://127.0.0.1:7861/v1`

## Important caveats
- OpenAI-compatible does not always mean feature-identical.
- Streaming, tool-calling, reasoning fields, and multimodal behavior may differ by backend.
- gcli2api licensing should be reviewed carefully before commercial use.
- GLM or Alibaba support would depend on what the bridge actually exposes through the OpenAI-compatible interface.

## Recommendation
For v1:
- keep native Codex OAuth as one clean lane
- add a separate OpenAI-compatible adapter for gcli2api and similar bridges
- keep model aliases generic where possible instead of hard-binding QA to a single vendor/model pair
- use provider-level `task_model_preferences` to express ranked choices for QA, research, coding, and UI/UX work
- after provider selection and successful login/connection, discover live available models when possible and let the user choose a main default model
- normalize response differences inside the adapter instead of scattering backend quirks across the QA core
