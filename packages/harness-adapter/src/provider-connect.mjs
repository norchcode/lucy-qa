import { resolveProvider } from './provider-loader.mjs';
import { markProviderConnected, setDiscoveredModels, setDefaultModel, getProviderStateSummary, setActiveProvider } from './provider-state.mjs';
import { PROVIDER_TYPES } from '../../shared-types/src/provider-schema.mjs';
import { fetchOpenAICompatibleModels } from '../../provider-openai-compatible/src/models.mjs';
import { fetchCodexModels } from '../../auth-codex/src/models.mjs';

const discoverModelsForProvider = async (provider) => {
  switch (provider.type) {
    case PROVIDER_TYPES.OPENAI_COMPATIBLE:
      return await fetchOpenAICompatibleModels(provider);
    case PROVIDER_TYPES.NATIVE_CODEX_OAUTH:
      return await fetchCodexModels(provider);
    default:
      throw new Error(`Unsupported provider type: ${provider.type}`);
  }
};

export const connectProvider = async ({ providerName, configPath, setActive = true } = {}) => {
  const { name, provider } = resolveProvider(providerName, configPath);
  markProviderConnected(name, { type: provider.type, base_url: provider.base_url ?? null });
  if (setActive) {
    setActiveProvider(name);
  }
  return getProviderStateSummary(name);
};

export const discoverProviderModels = async ({ providerName, configPath } = {}) => {
  const { name, provider } = resolveProvider(providerName, configPath);
  const models = await discoverModelsForProvider(provider);
  setDiscoveredModels(name, models);
  return getProviderStateSummary(name);
};

export const persistDefaultModel = async ({ providerName, model, configPath } = {}) => {
  const { name } = resolveProvider(providerName, configPath, model);
  setDefaultModel(name, model);
  return getProviderStateSummary(name);
};
