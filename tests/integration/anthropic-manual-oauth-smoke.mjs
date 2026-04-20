import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-anthropic-oauth-'));
process.env.HOME = tempHome;

let lastTokenRequest = null;
let lastApiKeyRequest = null;

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');

  if (req.url === '/oauth/token' && req.method === 'POST') {
    lastTokenRequest = rawBody ? JSON.parse(rawBody) : null;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      access_token: 'anthropic-access-token',
      refresh_token: 'anthropic-refresh-token',
      expires_in: 3600,
      scope: 'org:create_api_key user:profile user:inference',
      token_type: 'Bearer'
    }));
    return;
  }

  if (req.url === '/api/oauth/claude_cli/create_api_key' && req.method === 'POST') {
    lastApiKeyRequest = {
      authorization: req.headers.authorization,
      body: rawBody ? JSON.parse(rawBody) : null
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ raw_key: 'sk-ant-api03-created-by-oauth' }));
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

try {
  const { port } = server.address();
  const {
    beginAnthropicManualOAuth,
    completeAnthropicManualOAuth,
    getAnthropicManualOAuthStatus,
    authAnthropicStatus
  } = await import('../../packages/auth-anthropic/src/index.mjs');

  const tokenStore = path.join(tempHome, '.claude', 'oauth-store.json');
  const providerConfig = {
    token_store: tokenStore,
    authorization_endpoint: `http://127.0.0.1:${port}/oauth/authorize`,
    token_endpoint: `http://127.0.0.1:${port}/oauth/token`,
    api_key_creation_endpoint: `http://127.0.0.1:${port}/api/oauth/claude_cli/create_api_key`,
    oauth_redirect_uri: 'http://localhost:17899/callback',
    oauth_client_id: 'anthropic-test-client-id'
  };

  const started = beginAnthropicManualOAuth({ providerName: 'anthropic', providerConfig });
  assert.equal(started.provider, 'anthropic');
  assert.match(started.auth_url, /anthropic-test-client-id/);
  assert.equal(getAnthropicManualOAuthStatus({ providerName: 'anthropic' }).pending, true);

  const startedUrl = new URL(started.auth_url);
  const state = startedUrl.searchParams.get('state');
  const callbackUrl = `http://localhost:17899/callback?code=anthropic-code-123&state=${encodeURIComponent(state)}`;
  const completed = await completeAnthropicManualOAuth({ providerName: 'anthropic', callbackUrl });

  assert.equal(lastTokenRequest.client_id, 'anthropic-test-client-id');
  assert.equal(lastTokenRequest.code, 'anthropic-code-123');
  assert.equal(lastTokenRequest.redirect_uri, 'http://localhost:17899/callback');
  assert.equal(lastTokenRequest.grant_type, 'authorization_code');
  assert.ok(lastTokenRequest.code_verifier);
  assert.equal(lastApiKeyRequest.authorization, 'Bearer anthropic-access-token');
  assert.equal(completed.api_key, 'sk-ant-api03-created-by-oauth');
  assert.equal(getAnthropicManualOAuthStatus({ providerName: 'anthropic' }).pending, false);

  const stored = JSON.parse(fs.readFileSync(tokenStore, 'utf8'));
  assert.equal(stored.auth_mode, 'console-oauth');
  assert.equal(stored.api_key, 'sk-ant-api03-created-by-oauth');
  assert.equal(stored.oauth.access_token, 'anthropic-access-token');

  const status = authAnthropicStatus({ token_store: tokenStore });
  assert.equal(status.has_store_api_key, true);
  assert.equal(status.has_access_token, true);

  console.log('anthropic manual oauth smoke ok');
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  fs.rmSync(tempHome, { recursive: true, force: true });
}
