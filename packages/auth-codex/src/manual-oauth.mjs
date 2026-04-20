import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const DEFAULT_REDIRECT_URI = 'http://localhost:1455/auth/callback';
const DEFAULT_AUTHORIZATION_ENDPOINT = 'https://auth.openai.com/oauth/authorize';
const DEFAULT_TOKEN_ENDPOINT = 'https://auth0.openai.com/oauth/token';
const DEFAULT_SCOPE = 'openid profile email offline_access api.connectors.read api.connectors.invoke';
const PENDING_DIR = path.join(os.homedir(), '.lucy', 'auth');

const ensurePendingDir = () => {
  fs.mkdirSync(PENDING_DIR, { recursive: true });
};

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

const base64Url = (input) => Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const sha256base64url = (value) => crypto.createHash('sha256').update(value).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const decodeJwtPayload = (token) => {
  try {
    const [, payload] = String(token).split('.');
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

const getPendingPath = (providerName = 'openai-codex') => path.join(PENDING_DIR, `${providerName}-oauth-pending.json`);

const savePending = (providerName, payload) => {
  ensurePendingDir();
  const pendingPath = getPendingPath(providerName);
  fs.writeFileSync(pendingPath, JSON.stringify(payload, null, 2));
  return pendingPath;
};

const loadPending = (providerName = 'openai-codex') => {
  const pendingPath = getPendingPath(providerName);
  const raw = fs.readFileSync(pendingPath, 'utf8');
  return { pendingPath, payload: JSON.parse(raw) };
};

const clearPending = (providerName = 'openai-codex') => {
  fs.rmSync(getPendingPath(providerName), { force: true });
};

const extractAccountId = (accessPayload, idPayload) => {
  return accessPayload?.['https://api.openai.com/auth']?.chatgpt_account_id
    ?? idPayload?.['https://api.openai.com/auth']?.chatgpt_account_id
    ?? null;
};

export const beginOpenAICodexManualOAuth = ({ providerName = 'openai-codex', providerConfig = {} } = {}) => {
  const state = base64Url(crypto.randomBytes(32));
  const verifier = base64Url(crypto.randomBytes(64));
  const challenge = sha256base64url(verifier);
  const clientId = providerConfig.oauth_client_id ?? DEFAULT_CLIENT_ID;
  const redirectUri = providerConfig.oauth_redirect_uri ?? DEFAULT_REDIRECT_URI;
  const authorizationEndpoint = providerConfig.authorization_endpoint ?? DEFAULT_AUTHORIZATION_ENDPOINT;
  const scope = providerConfig.oauth_scope ?? DEFAULT_SCOPE;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    state,
    originator: 'lucy_qa'
  });
  const authUrl = `${authorizationEndpoint}?${params.toString()}`;
  const pending = {
    provider: providerName,
    created_at: new Date().toISOString(),
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state,
    code_verifier: verifier,
    authorization_endpoint: authorizationEndpoint,
    token_endpoint: providerConfig.token_endpoint ?? DEFAULT_TOKEN_ENDPOINT,
    token_store: expandHome(providerConfig.token_store ?? '~/.codex/auth.json')
  };
  const pendingPath = savePending(providerName, pending);

  return {
    provider: providerName,
    method: 'manual-oauth',
    auth_url: authUrl,
    redirect_uri: redirectUri,
    pending_path: pendingPath,
    instructions: [
      'Open the auth_url in a browser.',
      'Complete login and consent.',
      'When redirected to the localhost callback URL, copy the full URL.',
      'Run: lucy auth complete --provider openai-codex "<PASTED_CALLBACK_URL>"'
    ]
  };
};

export const completeOpenAICodexManualOAuth = async ({ callbackUrl, providerName = 'openai-codex' } = {}) => {
  if (!callbackUrl) {
    throw new Error('callbackUrl is required');
  }

  const { payload: pending } = loadPending(providerName);
  const parsed = new URL(callbackUrl);
  const code = parsed.searchParams.get('code');
  const state = parsed.searchParams.get('state');
  const error = parsed.searchParams.get('error');
  const errorDescription = parsed.searchParams.get('error_description');

  if (error) {
    throw new Error(`OAuth callback returned error: ${error}${errorDescription ? ` - ${errorDescription}` : ''}`);
  }
  if (!code) {
    throw new Error('OAuth callback is missing code');
  }
  if (!state || state !== pending.state) {
    throw new Error('OAuth callback state mismatch');
  }

  const response = await fetch(pending.token_endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: pending.client_id,
      code,
      redirect_uri: pending.redirect_uri,
      code_verifier: pending.code_verifier
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OAuth token exchange failed: ${response.status} ${response.statusText} - ${message}`);
  }

  const tokenPayload = await response.json();
  const accessPayload = decodeJwtPayload(tokenPayload.access_token);
  const idPayload = decodeJwtPayload(tokenPayload.id_token);
  const authStore = {
    auth_mode: 'chatgpt',
    OPENAI_API_KEY: null,
    tokens: {
      id_token: tokenPayload.id_token ?? null,
      access_token: tokenPayload.access_token ?? null,
      refresh_token: tokenPayload.refresh_token ?? null,
      account_id: extractAccountId(accessPayload, idPayload)
    },
    last_refresh: new Date().toISOString()
  };

  fs.mkdirSync(path.dirname(pending.token_store), { recursive: true });
  fs.writeFileSync(pending.token_store, JSON.stringify(authStore, null, 2));
  clearPending(providerName);

  return {
    provider: providerName,
    method: 'manual-oauth',
    token_store: pending.token_store,
    account_id: authStore.tokens.account_id,
    scopes: accessPayload?.scp ?? null,
    token_payload: tokenPayload
  };
};

export const getOpenAICodexManualOAuthStatus = ({ providerName = 'openai-codex' } = {}) => {
  try {
    const { pendingPath, payload } = loadPending(providerName);
    return {
      provider: providerName,
      pending: true,
      pending_path: pendingPath,
      created_at: payload.created_at,
      redirect_uri: payload.redirect_uri,
      authorization_endpoint: payload.authorization_endpoint
    };
  } catch {
    return {
      provider: providerName,
      pending: false
    };
  }
};
