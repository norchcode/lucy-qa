import { getCodexAuthHeader, loadCodexAuthStore, getCodexModelsCache } from './auth-store.mjs';
import { beginOpenAICodexManualOAuth, completeOpenAICodexManualOAuth, getOpenAICodexManualOAuthStatus } from './manual-oauth.mjs';

export const authCodexStatus = (providerConfig = {}) => {
  const store = loadCodexAuthStore(providerConfig);
  return {
    provider: 'openai-codex',
    implemented: true,
    auth_mode: store.auth_mode,
    token_store_path: store.token_store_path,
    models_cache_path: store.models_cache_path,
    account_id: store.account_id,
    last_refresh: store.last_refresh,
    has_access_token: Boolean(store.access_token),
    has_api_key: Boolean(store.configured_api_key ?? store.store_api_key),
    models_cache_fetched_at: store.models_cache?.fetched_at ?? null
  };
};

export {
  getCodexAuthHeader,
  loadCodexAuthStore,
  getCodexModelsCache,
  beginOpenAICodexManualOAuth,
  completeOpenAICodexManualOAuth,
  getOpenAICodexManualOAuthStatus
};
