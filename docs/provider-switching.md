# Provider and Model Switching

Lucy QA should allow users to switch providers and models even after initial login and default-model setup.

## Current commands
- `node apps/cli/src/index.mjs provider active`
- `node apps/cli/src/index.mjs provider use <name>`
- `node apps/cli/src/index.mjs provider default-model <name> <model>`
- `node apps/cli/src/index.mjs ask "..." --provider <name> --model <model>`

## Switching rules
- Connecting to a provider may set it as the active provider
- Users can later switch the active provider without redoing the whole setup flow
- Users can later change the saved default model for a provider
- Users can always override both provider and model explicitly on a single command

## Priority order at runtime
1. explicit command-line provider
2. active provider from preferences
3. configured default provider

For model selection:
1. explicit `--model`
2. task-based preference
3. persisted default model for that provider
4. configured provider default
