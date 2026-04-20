import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const expandHome = (value) => {
  if (!value || typeof value !== 'string') {
    return value;
  }

  if (value === '~') {
    return os.homedir();
  }

  if (value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2));
  }

  return value;
};

const readJsonIfExists = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
};

const decodeJwtPayload = (token) => {
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return null;
    }
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
};

const resolveConfiguredApiKey = (providerConfig) => {
  if (providerConfig.api_key && providerConfig.api_key !== '***') {
    return providerConfig.api_key;
  }

  if (providerConfig.api_key_env) {
    return process.env[providerConfig.api_key_env] ?? null;
  }

  return null;
};

export const loadCodexAuthStore = (providerConfig = {}) => {
  const tokenStorePath = expandHome(providerConfig.token_store ?? '~/.codex/auth.json');
  const modelsCachePath = expandHome(providerConfig.models_cache ?? '~/.codex/models_cache.json');
  const auth = readJsonIfExists(tokenStorePath) ?? {};
  const modelsCache = readJsonIfExists(modelsCachePath) ?? null;
  const configuredApiKey = resolveConfiguredApiKey(providerConfig);
  const storeApiKey = auth.OPENAI_API_KEY ?? null;
  const accessToken = auth.tokens?.access_token ?? null;
  const decodedAccessToken = accessToken ? decodeJwtPayload(accessToken) : null;

  return {
    token_store_path: tokenStorePath,
    models_cache_path: modelsCachePath,
    auth_mode: auth.auth_mode ?? null,
    configured_api_key: configuredApiKey,
    store_api_key: storeApiKey,
    access_token: accessToken,
    access_token_payload: decodedAccessToken,
    account_id: auth.tokens?.account_id ?? null,
    last_refresh: auth.last_refresh ?? null,
    models_cache: modelsCache
  };
};

export const getCodexAuthHeader = (providerConfig = {}) => {
  const store = loadCodexAuthStore(providerConfig);
  const bearer = store.configured_api_key ?? store.store_api_key ?? store.access_token ?? null;

  if (!bearer) {
    throw new Error(`No Codex auth token found. Expected api_key/api_key_env or token store at ${store.token_store_path}`);
  }

  return {
    header: `Bearer ${bearer}`,
    source: store.configured_api_key ? 'configured-api-key' : store.store_api_key ? 'token-store-api-key' : 'chatgpt-access-token',
    auth_mode: store.auth_mode,
    account_id: store.account_id,
    token_store_path: store.token_store_path,
    last_refresh: store.last_refresh,
    token_expires_at: store.access_token_payload?.exp ? new Date(store.access_token_payload.exp * 1000).toISOString() : null
  };
};

export const getCodexModelsCache = (providerConfig = {}) => {
  const store = loadCodexAuthStore(providerConfig);
  return {
    path: store.models_cache_path,
    fetched_at: store.models_cache?.fetched_at ?? null,
    models: store.models_cache?.models ?? []
  };
};
