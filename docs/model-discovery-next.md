# Model Discovery Next Step

Lucy QA should not rely only on static model lists in config.

## Correct flow
1. user selects provider
2. Lucy QA authenticates or verifies connection
3. Lucy QA calls the provider's model-list endpoint when available
4. Lucy QA shows the discovered models
5. user selects one primary default model
6. Lucy QA stores optional task-based preferences after that

## Why this matters
- providers change available models over time
- proxy backends may expose different model sets per environment
- static config is useful as fallback, but live discovery should be preferred

## Planned commands
- `lucy provider connect <name>`
- `lucy provider models <name>`
- `lucy provider default-model <name> <model>`
- `lucy provider task-model <name> <task> <model-or-alias>`
