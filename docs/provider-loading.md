# Provider Loading

Lucy QA now has an initial provider-loading layer.

## Current behavior
- Reads provider definitions from `config/providers.example.json`
- Validates required fields by provider type
- Normalizes:
  - native-codex-oauth config
  - openai-compatible config
- Exposes:
  - provider listing
  - provider resolution by name
  - default provider resolution

## Current CLI placeholders
- `node apps/cli/src/index.mjs provider list`
- `node apps/cli/src/index.mjs provider show openai-codex`
- `node apps/cli/src/index.mjs provider show gcli2api-local`

## Next implementation step
Turn provider resolution into actual request routing so Lucy QA can send prompts through:
- native Codex OAuth adapter
- OpenAI-compatible proxy adapter
