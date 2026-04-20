import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDER_TYPES, REQUIRED_PROVIDER_FIELDS } from '../../shared-types/src/provider-schema.mjs';
import { normalizeCodexConfig } from '../../auth-codex/src/normalize.mjs';
import { normalizeAnthropicConfig } from '../../auth-anthropic/src/normalize.mjs';
import { normalizeOpenAICompatibleConfig } from '../../provider-openai-compatible/src/normalize.mjs';
import { loadProviderState } from './provider-state.mjs';
import { resolveDefaultProviderConfigPath } from './provider-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_CONFIG_PATH = resolveDefaultProviderConfigPath();

const normalizeByType = (config) => {
  switch (config.type) {
    case PROVIDER_TYPES.NATIVE_CODEX_OAUTH:
      return normalizeCodexConfig(config);
    case PROVIDER_TYPES.NATIVE_ANTHROPIC:
      return normalizeAnthropicConfig(config);
    case PROVIDER_TYPES.OPENAI_COMPATIBLE:
      return normalizeOpenAICompatibleConfig(config);
    default:
      throw new Error(`Unsupported provider type: ${config.type}`);
  }
};

const validateProviderConfig = (name, config) => {
  const required = REQUIRED_PROVIDER_FIELDS[config.type] ?? [];
  const missing = required.filter((field) => config[field] === undefined || config[field] === null || config[field] === '');
  if (missing.length) {
    throw new Error(`Provider ${name} is missing required fields: ${missing.join(', ')}`);
  }
};

export const loadProviderConfig = (configPath = DEFAULT_CONFIG_PATH) => {
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw);
  const providers = parsed.providers ?? {};
  const normalizedProviders = Object.fromEntries(
    Object.entries(providers).map(([name, config]) => {
      const normalized = normalizeByType(config);
      validateProviderConfig(name, normalized);
      return [name, normalized];
    })
  );

  return {
    default_provider: parsed.default_provider,
    providers: normalizedProviders
  };
};

const mergeAvailableModels = (provider, discoveredModels = []) => {
  return [...new Set([...(provider.available_models ?? []), ...(discoveredModels ?? [])].filter(Boolean))];
};

const expandCandidate = (provider, candidateKey) => {
  if (!candidateKey) {
    return null;
  }

  const aliasTarget = provider.model_aliases?.[candidateKey] ?? null;
  return {
    preferred_key: candidateKey,
    resolved: aliasTarget ?? candidateKey,
    alias_used: aliasTarget ? candidateKey : null
  };
};

export const resolveModelSelection = (provider, requestedModel, taskType = null, persistedDefaultModel = null, discoveredModels = []) => {
  const taskPreferences = taskType ? provider.task_model_preferences?.[taskType] ?? [] : [];
  const available = mergeAvailableModels(provider, discoveredModels);
  const candidates = [
    requestedModel,
    ...taskPreferences,
    persistedDefaultModel,
    provider.default_model,
    provider.model
  ]
    .filter(Boolean)
    .map((candidateKey) => expandCandidate(provider, candidateKey));

  const selected = candidates.find((candidate) => {
    if (!candidate?.resolved) {
      return false;
    }

    return available.length === 0 || available.includes(candidate.resolved);
  });

  if (!selected) {
    const attempted = candidates.map((candidate) => candidate?.resolved).filter(Boolean);
    throw new Error(`No available model could be resolved for provider. Attempted: ${attempted.join(', ')}`);
  }

  return {
    requested: requestedModel ?? null,
    task_type: taskType ?? null,
    preferred_key: selected.preferred_key,
    persisted_default_model: persistedDefaultModel,
    resolved: selected.resolved,
    available_models: available,
    alias_used: selected.alias_used,
    task_preferences: taskPreferences,
    discovered_models: discoveredModels
  };
};

export const resolveProvider = (providerName, configPath = DEFAULT_CONFIG_PATH, requestedModel = null, taskType = null) => {
  const config = loadProviderConfig(configPath);
  const state = loadProviderState();
  const name = providerName ?? config.default_provider;
  const provider = config.providers[name];
  if (!provider) {
    throw new Error(`Provider not found: ${name}`);
  }
  const persistedDefaultModel = state.default_models?.[name]?.model ?? null;
  const discoveredModels = state.discovered_models?.[name]?.models ?? [];
  const model_selection = resolveModelSelection(provider, requestedModel, taskType, persistedDefaultModel, discoveredModels);
  return { name, provider, default_provider: config.default_provider, model_selection };
};

export const listProviders = (configPath = DEFAULT_CONFIG_PATH) => {
  const config = loadProviderConfig(configPath);
  const state = loadProviderState();
  return Object.entries(config.providers).map(([name, provider]) => ({
    name,
    type: provider.type,
    enabled: provider.enabled,
    model: provider.model,
    default_model: provider.default_model ?? provider.model,
    available_models: mergeAvailableModels(provider, state.discovered_models?.[name]?.models ?? []),
    model_aliases: provider.model_aliases ?? {},
    isDefault: name === config.default_provider,
    base_url: provider.base_url ?? null
  }));
};
