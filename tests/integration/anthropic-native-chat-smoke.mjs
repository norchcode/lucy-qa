import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-anthropic-native-'));
process.env.HOME = tempHome;

let lastMessageRequest = null;
let lastModelsRequest = null;

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');

  if (req.url === '/v1/models' && req.method === 'GET') {
    lastModelsRequest = { apiKey: req.headers['x-api-key'], version: req.headers['anthropic-version'] };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'claude-3-7-sonnet-latest' }, { id: 'claude-3-5-haiku-latest' }] }));
    return;
  }

  if (req.url === '/v1/messages' && req.method === 'POST') {
    lastMessageRequest = {
      apiKey: req.headers['x-api-key'],
      version: req.headers['anthropic-version'],
      body: rawBody ? JSON.parse(rawBody) : null
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      id: 'msg_test_123',
      type: 'message',
      role: 'assistant',
      model: 'claude-3-7-sonnet-latest',
      content: [{ type: 'text', text: 'anthropic-native:build the feature' }],
      usage: { input_tokens: 10, output_tokens: 6 },
      stop_reason: 'end_turn'
    }));
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

try {
  const { port } = server.address();
  const tokenStore = path.join(tempHome, '.claude', 'oauth-store.json');
  fs.mkdirSync(path.dirname(tokenStore), { recursive: true });
  fs.writeFileSync(tokenStore, JSON.stringify({
    auth_mode: 'console-oauth',
    api_key: 'sk-ant-api03-local-test',
    api_key_created_at: '2026-04-20T00:00:00.000Z',
    oauth: { access_token: 'oauth-access-token', created_at: '2026-04-20T00:00:00.000Z' }
  }, null, 2));

  const configPath = path.join(tempHome, 'providers.json');
  fs.writeFileSync(configPath, JSON.stringify({
    default_provider: 'anthropic',
    providers: {
      anthropic: {
        type: 'native-anthropic',
        enabled: true,
        oauth_provider: 'anthropic',
        api_base_url: `http://127.0.0.1:${port}`,
        api_version: '2023-06-01',
        token_store: tokenStore,
        model: 'claude-3-7-sonnet-latest',
        default_model: 'claude-3-7-sonnet-latest',
        model_aliases: {
          balanced: 'claude-3-7-sonnet-latest',
          fast: 'claude-3-5-haiku-latest'
        },
        task_model_preferences: {
          coding: ['balanced', 'fast']
        },
        timeout_ms: 5000,
        max_tokens: 1024
      }
    }
  }, null, 2));

  const {
    discoverProviderModels,
    persistDefaultModel,
    createProviderClient,
    resolveProvider
  } = await import('../../packages/harness-adapter/src/index.mjs');

  const discovered = await discoverProviderModels({ providerName: 'anthropic', configPath });
  assert.deepEqual(discovered.discovered_models.models, ['claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest']);
  assert.equal(lastModelsRequest.apiKey, 'sk-ant-api03-local-test');

  const resolvedFromTask = resolveProvider('anthropic', configPath, null, 'coding');
  assert.equal(resolvedFromTask.model_selection.resolved, 'claude-3-7-sonnet-latest');

  const runtime = createProviderClient({ providerName: 'anthropic', taskType: 'coding', configPath });
  const response = await runtime.client.chat({
    model: runtime.model_selection.resolved,
    messages: [{ role: 'user', content: 'build the feature' }]
  });

  assert.equal(response.implemented, true);
  assert.equal(response.transport, 'native-anthropic-messages-api');
  assert.equal(response.model, 'claude-3-7-sonnet-latest');
  assert.equal(response.text, 'anthropic-native:build the feature');
  assert.equal(lastMessageRequest.apiKey, 'sk-ant-api03-local-test');
  assert.equal(lastMessageRequest.version, '2023-06-01');
  assert.equal(lastMessageRequest.body.model, 'claude-3-7-sonnet-latest');
  assert.equal(lastMessageRequest.body.messages[0].content[0].text, 'build the feature');

  await persistDefaultModel({ providerName: 'anthropic', model: 'claude-3-5-haiku-latest', configPath });
  const resolvedFromDefault = createProviderClient({ providerName: 'anthropic', configPath });
  assert.equal(resolvedFromDefault.model_selection.resolved, 'claude-3-5-haiku-latest');

  console.log('anthropic native chat smoke ok');
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  fs.rmSync(tempHome, { recursive: true, force: true });
}
