import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-manual-oauth-'));
process.env.HOME = tempHome;

let lastTokenRequest = null;
const fakeAccessTokenPayload = Buffer.from(JSON.stringify({
  scp: ['openid', 'profile', 'email', 'offline_access'],
  'https://api.openai.com/auth': {
    chatgpt_account_id: 'acct_manual_oauth'
  }
})).toString('base64url');
const fakeIdTokenPayload = Buffer.from(JSON.stringify({
  sub: 'user_123',
  email: 'user@example.com'
})).toString('base64url');
const fakeJwt = (payload) => `header.${payload}.sig`;

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const rawBody = Buffer.concat(chunks).toString('utf8');
  lastTokenRequest = rawBody ? JSON.parse(rawBody) : null;

  if (req.url === '/oauth/token' && req.method === 'POST') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      access_token: fakeJwt(fakeAccessTokenPayload),
      refresh_token: 'refresh_manual_test',
      id_token: fakeJwt(fakeIdTokenPayload),
      token_type: 'Bearer'
    }));
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

try {
  const { port } = server.address();
  const {
    beginOpenAICodexManualOAuth,
    completeOpenAICodexManualOAuth,
    getOpenAICodexManualOAuthStatus,
    authCodexStatus
  } = await import('../../packages/auth-codex/src/index.mjs');

  const tokenStore = path.join(tempHome, '.codex', 'auth.json');
  const providerConfig = {
    token_store: tokenStore,
    authorization_endpoint: `http://127.0.0.1:${port}/oauth/authorize`,
    token_endpoint: `http://127.0.0.1:${port}/oauth/token`,
    oauth_redirect_uri: 'http://localhost:1455/auth/callback',
    oauth_client_id: 'test-client-id'
  };

  const started = beginOpenAICodexManualOAuth({ providerName: 'openai-codex', providerConfig });
  assert.equal(started.provider, 'openai-codex');
  assert.match(started.auth_url, /test-client-id/);
  assert.equal(getOpenAICodexManualOAuthStatus({ providerName: 'openai-codex' }).pending, true);

  const startedUrl = new URL(started.auth_url);
  const state = startedUrl.searchParams.get('state');
  const callbackUrl = `http://localhost:1455/auth/callback?code=test-code-123&state=${encodeURIComponent(state)}`;
  const completed = await completeOpenAICodexManualOAuth({ providerName: 'openai-codex', callbackUrl });

  assert.equal(lastTokenRequest.client_id, 'test-client-id');
  assert.equal(lastTokenRequest.code, 'test-code-123');
  assert.equal(lastTokenRequest.redirect_uri, 'http://localhost:1455/auth/callback');
  assert.equal(lastTokenRequest.grant_type, 'authorization_code');
  assert.ok(lastTokenRequest.code_verifier);
  assert.equal(completed.account_id, 'acct_manual_oauth');
  assert.deepEqual(completed.scopes, ['openid', 'profile', 'email', 'offline_access']);
  assert.equal(getOpenAICodexManualOAuthStatus({ providerName: 'openai-codex' }).pending, false);

  const stored = JSON.parse(fs.readFileSync(tokenStore, 'utf8'));
  assert.equal(stored.auth_mode, 'chatgpt');
  assert.equal(stored.tokens.account_id, 'acct_manual_oauth');
  assert.equal(Boolean(stored.tokens.access_token), true);

  const status = authCodexStatus({ token_store: tokenStore, models_cache: path.join(tempHome, '.codex', 'models_cache.json') });
  assert.equal(status.has_access_token, true);
  assert.equal(status.account_id, 'acct_manual_oauth');

  console.log('codex manual oauth smoke ok');
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
