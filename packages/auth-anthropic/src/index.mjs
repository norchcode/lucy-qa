import { loadAnthropicAuthStore } from './auth-store.mjs';
import { beginAnthropicManualOAuth, completeAnthropicManualOAuth, getAnthropicManualOAuthStatus } from './manual-oauth.mjs';

export const authAnthropicStatus = (providerConfig = {}) => {
  const store = loadAnthropicAuthStore(providerConfig);
  return {
    implemented: true,
    provider: 'anthropic',
    auth_mode: store.auth_mode,
    token_store_path: store.token_store_path,
    configured_api_key_env: providerConfig.api_key_env ?? null,
    has_configured_api_key: Boolean(store.configured_api_key),
    has_store_api_key: Boolean(store.store_api_key),
    has_access_token: Boolean(store.access_token),
    api_key_created_at: store.api_key_created_at ?? null,
    expires_at: store.expires_at ?? null,
    scope: store.scope ?? null
  };
};

export {
  loadAnthropicAuthStore,
  beginAnthropicManualOAuth,
  completeAnthropicManualOAuth,
  getAnthropicManualOAuthStatus
};
