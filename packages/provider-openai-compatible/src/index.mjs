export const createOpenAICompatibleProvider = (config = {}) => ({
  type: 'openai-compatible',
  config,
  implemented: false
});
