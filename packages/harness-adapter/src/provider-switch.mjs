import { loadPreferences, setActiveProvider, getProviderStateSummary } from './provider-state.mjs';
import { loadProviderConfig } from './provider-loader.mjs';

export const switchProvider = ({ providerName, configPath } = {}) => {
  const config = loadProviderConfig(configPath);
  if (!config.providers[providerName]) {
    throw new Error(`Provider not found: ${providerName}`);
  }
  setActiveProvider(providerName);
  return getProviderStateSummary(providerName);
};

export const getActiveProvider = () => {
  return loadPreferences().active_provider ?? null;
};
