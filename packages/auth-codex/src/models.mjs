import { getCodexAuthHeader, getCodexModelsCache } from './auth-store.mjs';

const normalizeBaseUrl = (baseUrl) => {
  if (!baseUrl) {
    throw new Error('Codex provider is missing api_base_url');
  }

  return baseUrl.replace(/\/$/, '');
};

const parseRemoteModelsPayload = (payload) => {
  const data = Array.isArray(payload.data) ? payload.data : [];
  return data.map((item) => item.id).filter(Boolean);
};

const parseCachedModelsPayload = (cache) => {
  const models = Array.isArray(cache.models) ? cache.models : [];
  return models
    .filter((item) => item?.slug && item?.supported_in_api !== false)
    .map((item) => item.slug);
};

const fetchCodexModelsRemote = async (providerConfig) => {
  const auth = getCodexAuthHeader(providerConfig);
  const baseUrl = normalizeBaseUrl(providerConfig.api_base_url);
  const controller = new AbortController();
  const timeoutMs = providerConfig.timeout_ms ?? 120000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        authorization: auth.header,
        ...providerConfig.default_headers
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Codex model discovery failed: ${response.status} ${response.statusText} - ${message}`);
    }

    const payload = await response.json();
    return parseRemoteModelsPayload(payload);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Codex model discovery timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

export const fetchCodexModels = async (providerConfig) => {
  const cache = getCodexModelsCache(providerConfig);
  const cachedModels = parseCachedModelsPayload(cache);

  if (cachedModels.length > 0) {
    return cachedModels;
  }

  const remoteModels = await fetchCodexModelsRemote(providerConfig);
  if (remoteModels.length > 0) {
    return remoteModels;
  }

  return providerConfig.available_models ?? [];
};
