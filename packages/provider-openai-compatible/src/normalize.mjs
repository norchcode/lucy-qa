export const normalizeOpenAICompatibleConfig = (config = {}) => ({
  ...config,
  type: 'openai-compatible',
  base_url: config.base_url,
  api_key: config.api_key ?? null,
  api_key_env: config.api_key_env ?? null,
  model: config.model,
  default_model: config.default_model ?? config.model,
  available_models: config.available_models ?? [config.model].filter(Boolean),
  model_aliases: config.model_aliases ?? {},
  task_model_preferences: config.task_model_preferences ?? {},
  streaming: Boolean(config.streaming),
  timeout_ms: Number.isFinite(config.timeout_ms) ? Number(config.timeout_ms) : 120000,
  default_headers: config.default_headers ?? {}
});
