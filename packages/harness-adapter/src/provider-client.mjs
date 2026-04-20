import { createCodexClient } from '../../auth-codex/src/client.mjs';
import { createAnthropicClient } from '../../auth-anthropic/src/client.mjs';
import { createOpenAICompatibleProvider } from '../../provider-openai-compatible/src/index.mjs';
import { createOpenAICompatibleClient } from '../../provider-openai-compatible/src/client.mjs';
import { PROVIDER_TYPES } from '../../shared-types/src/provider-schema.mjs';
import { resolveProvider } from './provider-loader.mjs';
import { getActiveProvider } from './provider-switch.mjs';

export const createProviderClient = ({ providerName, model = null, taskType = null, configPath } = {}) => {
  const effectiveProvider = providerName ?? getActiveProvider() ?? null;
  const resolution = resolveProvider(effectiveProvider, configPath, model, taskType);
  const { provider, model_selection, name } = resolution;

  switch (provider.type) {
    case PROVIDER_TYPES.NATIVE_CODEX_OAUTH:
      return {
        name,
        provider,
        model_selection,
        client: createCodexClient(provider)
      };
    case PROVIDER_TYPES.NATIVE_ANTHROPIC:
      return {
        name,
        provider,
        model_selection,
        client: createAnthropicClient(provider)
      };
    case PROVIDER_TYPES.OPENAI_COMPATIBLE:
      return {
        name,
        provider: createOpenAICompatibleProvider(provider),
        model_selection,
        client: createOpenAICompatibleClient(provider)
      };
    default:
      throw new Error(`Unsupported provider type: ${provider.type}`);
  }
};
