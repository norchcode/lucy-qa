# Runtime Priority Rules

## Provider priority
1. Explicit provider passed by user
2. Active provider stored in `~/.lucy/preferences.json`
3. Configured default provider

## Model priority
1. Explicit model passed by user
2. Task preference alias/model
3. Persisted provider default model from `~/.lucy/provider-state.json`
4. Configured provider default model
5. Configured provider base model
