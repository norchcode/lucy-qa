# Live Model Discovery Caveats

## OpenAI-compatible backends
These may support live model discovery using a models endpoint such as:
- `/v1/models`

However, compatibility can vary:
- auth format may differ
- model metadata richness may differ
- some proxies may expose partial or renamed model lists

## Native Codex lane
Current implementation still uses configured models as fallback.
A real native discovery path should be added later if the auth/runtime supports it.

## Practical rule
Prefer live discovery when available.
Use static config only as fallback or seed data.
