import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const expandHome = (value) => {
  if (!value || typeof value !== 'string') return value;
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
};

const readJsonIfExists = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
};

const resolveConfiguredApiKey = (providerConfig = {}) => {
  if (providerConfig.api_key && providerConfig.api_key !== '***') return providerConfig.api_key;
  if (providerConfig.api_key_env) return process.env[providerConfig.api_key_env] ?? null;
  return null;
};

export const loadAnthropicAuthStore = (providerConfig = {}) => {
  const tokenStorePath = expandHome(providerConfig.token_store ?? '~/.claude/oauth-store.json');
  const auth = readJsonIfExists(tokenStorePath) ?? {};
  const configuredApiKey = resolveConfiguredApiKey(providerConfig);
  return {
    token_store_path: tokenStorePath,
    auth_mode: auth.auth_mode ?? null,
    configured_api_key: configuredApiKey,
    store_api_key: auth.api_key ?? null,
    access_token: auth.oauth?.access_token ?? null,
    refresh_token: auth.oauth?.refresh_token ?? null,
    expires_at: auth.oauth?.expires_at ?? null,
    scope: auth.oauth?.scope ?? null,
    created_at: auth.oauth?.created_at ?? null,
    api_key_created_at: auth.api_key_created_at ?? null
  };
};

export const getAnthropicApiKey = (providerConfig = {}) => {
  const store = loadAnthropicAuthStore(providerConfig);
  const apiKey = store.configured_api_key ?? store.store_api_key ?? null;
  if (!apiKey) {
    throw new Error(`No Anthropic API key found. Expected api_key/api_key_env or token store at ${store.token_store_path}`);
  }
  return {
    api_key: apiKey,
    source: store.configured_api_key ? 'configured-api-key' : 'oauth-created-api-key',
    token_store_path: store.token_store_path,
    auth_mode: store.auth_mode,
    created_at: store.api_key_created_at,
    access_token_present: Boolean(store.access_token)
  };
};
