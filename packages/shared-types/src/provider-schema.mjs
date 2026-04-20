export const PROVIDER_TYPES = {
  NATIVE_CODEX_OAUTH: 'native-codex-oauth',
  NATIVE_ANTHROPIC: 'native-anthropic',
  OPENAI_COMPATIBLE: 'openai-compatible'
};

export const REQUIRED_PROVIDER_FIELDS = {
  [PROVIDER_TYPES.NATIVE_CODEX_OAUTH]: ['type', 'enabled', 'oauth_provider', 'model'],
  [PROVIDER_TYPES.NATIVE_ANTHROPIC]: ['type', 'enabled', 'oauth_provider', 'model'],
  [PROVIDER_TYPES.OPENAI_COMPATIBLE]: ['type', 'enabled', 'base_url', 'model']
};
