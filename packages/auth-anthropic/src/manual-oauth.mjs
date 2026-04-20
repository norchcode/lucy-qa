import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const DEFAULT_REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
const DEFAULT_AUTHORIZATION_ENDPOINT = 'https://console.anthropic.com/oauth/authorize';
const DEFAULT_TOKEN_ENDPOINT = 'https://console.anthropic.com/v1/oauth/token';
const DEFAULT_SCOPE = 'org:create_api_key user:profile user:inference';
const DEFAULT_API_KEY_CREATION_ENDPOINT = 'https://api.anthropic.com/api/oauth/claude_cli/create_api_key';
const PENDING_DIR = path.join(os.homedir(), '.lucy', 'auth');

const ensurePendingDir = () => fs.mkdirSync(PENDING_DIR, { recursive: true });
const expandHome = (value) => {
  if (!value || typeof value !== 'string') return value;
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
};
const base64Url = (input) => Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const sha256base64url = (value) => crypto.createHash('sha256').update(value).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const getPendingPath = (providerName = 'anthropic') => path.join(PENDING_DIR, `${providerName}-oauth-pending.json`);
const savePending = (providerName, payload) => {
  ensurePendingDir();
  const pendingPath = getPendingPath(providerName);
  fs.writeFileSync(pendingPath, JSON.stringify(payload, null, 2));
  return pendingPath;
};
const loadPending = (providerName = 'anthropic') => {
  const pendingPath = getPendingPath(providerName);
  const raw = fs.readFileSync(pendingPath, 'utf8');
  return { pendingPath, payload: JSON.parse(raw) };
};
const clearPending = (providerName = 'anthropic') => fs.rmSync(getPendingPath(providerName), { force: true });

const parseCallbackInput = (callbackInput) => {
  const raw = String(callbackInput ?? '').trim();
  if (!raw) {
    throw new Error('callbackUrl is required');
  }
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    const parsed = new URL(raw);
    return {
      code: parsed.searchParams.get('code') ?? parsed.hash.replace(/^#/, '').split('#')[0] ?? null,
      state: parsed.searchParams.get('state') ?? (parsed.hash.includes('#') ? parsed.hash.replace(/^#/, '').split('#')[1] ?? null : null),
      error: parsed.searchParams.get('error') ?? null,
      errorDescription: parsed.searchParams.get('error_description') ?? null
    };
  }
  const [code, state] = raw.split('#');
  return { code: code ?? null, state: state ?? null, error: null, errorDescription: null };
};

const extractApiKey = (payload) => payload?.raw_key ?? payload?.api_key ?? payload?.key ?? payload?.data?.raw_key ?? payload?.data?.api_key ?? null;

export const beginAnthropicManualOAuth = ({ providerName = 'anthropic', providerConfig = {} } = {}) => {
  const state = base64Url(crypto.randomBytes(32));
  const verifier = base64Url(crypto.randomBytes(64));
  const challenge = sha256base64url(verifier);
  const clientId = providerConfig.oauth_client_id ?? DEFAULT_CLIENT_ID;
  const redirectUri = providerConfig.oauth_redirect_uri ?? DEFAULT_REDIRECT_URI;
  const authorizationEndpoint = providerConfig.authorization_endpoint ?? DEFAULT_AUTHORIZATION_ENDPOINT;
  const scope = providerConfig.oauth_scope ?? DEFAULT_SCOPE;
  const params = new URLSearchParams({
    code: 'true',
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state
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
    api_key_creation_endpoint: providerConfig.api_key_creation_endpoint ?? DEFAULT_API_KEY_CREATION_ENDPOINT,
    token_store: expandHome(providerConfig.token_store ?? '~/.claude/oauth-store.json')
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
      'Approve access in Anthropic Console.',
      'Copy the full callback URL or the returned code#state value.',
      'Run: lucy auth complete --provider anthropic "<PASTED_CALLBACK>"'
    ]
  };
};

export const completeAnthropicManualOAuth = async ({ callbackUrl, providerName = 'anthropic' } = {}) => {
  const { payload: pending } = loadPending(providerName);
  const parsed = parseCallbackInput(callbackUrl);
  if (parsed.error) {
    throw new Error(`OAuth callback returned error: ${parsed.error}${parsed.errorDescription ? ` - ${parsed.errorDescription}` : ''}`);
  }
  if (!parsed.code) {
    throw new Error('OAuth callback is missing code');
  }
  if (!parsed.state || parsed.state !== pending.state) {
    throw new Error('OAuth callback state mismatch');
  }

  const tokenResponse = await fetch(pending.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code: parsed.code,
      state: parsed.state,
      grant_type: 'authorization_code',
      client_id: pending.client_id,
      redirect_uri: pending.redirect_uri,
      code_verifier: pending.code_verifier
    })
  });
  if (!tokenResponse.ok) {
    const message = await tokenResponse.text();
    throw new Error(`Anthropic OAuth token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText} - ${message}`);
  }
  const tokenPayload = await tokenResponse.json();
  const accessToken = tokenPayload.access_token ?? null;
  if (!accessToken) {
    throw new Error('Anthropic OAuth token exchange did not return access_token');
  }

  const keyResponse = await fetch(pending.api_key_creation_endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      source: 'lucy-qa',
      name: 'Lucy QA OAuth API key'
    })
  });
  if (!keyResponse.ok) {
    const message = await keyResponse.text();
    throw new Error(`Anthropic API key creation failed: ${keyResponse.status} ${keyResponse.statusText} - ${message}`);
  }
  const apiKeyPayload = await keyResponse.json();
  const apiKey = extractApiKey(apiKeyPayload);
  if (!apiKey) {
    throw new Error('Anthropic API key creation succeeded but no API key was returned');
  }

  const authStore = {
    auth_mode: 'console-oauth',
    api_key: apiKey,
    api_key_created_at: new Date().toISOString(),
    oauth: {
      access_token: accessToken,
      refresh_token: tokenPayload.refresh_token ?? null,
      expires_at: tokenPayload.expires_in ? new Date(Date.now() + (Number(tokenPayload.expires_in) * 1000)).toISOString() : null,
      scope: tokenPayload.scope ?? pending.scope,
      created_at: new Date().toISOString()
    }
  };

  fs.mkdirSync(path.dirname(pending.token_store), { recursive: true });
  fs.writeFileSync(pending.token_store, JSON.stringify(authStore, null, 2));
  clearPending(providerName);

  return {
    provider: providerName,
    method: 'manual-oauth',
    token_store: pending.token_store,
    api_key: apiKey,
    scopes: tokenPayload.scope ?? pending.scope,
    token_payload: tokenPayload,
    api_key_payload: apiKeyPayload
  };
};

export const getAnthropicManualOAuthStatus = ({ providerName = 'anthropic' } = {}) => {
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
