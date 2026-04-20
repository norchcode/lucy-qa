import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-home-'));
process.env.HOME = tempHome;
process.env.LUCY_TEST_API_KEY = 'test-key';

let lastChatRequest = null;
let lastModelsRequest = null;

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const rawBody = Buffer.concat(chunks).toString('utf8');
  const body = rawBody ? JSON.parse(rawBody) : null;

  if (req.url === '/v1/models' && req.method === 'GET') {
    lastModelsRequest = {
      authorization: req.headers.authorization ?? null
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      object: 'list',
      data: [{ id: 'glm-4.5' }, { id: 'qwen-max' }]
    }));
    return;
  }

  if (req.url === '/v1/chat/completions' && req.method === 'POST') {
    lastChatRequest = {
      authorization: req.headers.authorization ?? null,
      body
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 123,
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: `reply:${body.model}:${body.messages[0].content}` }]
          }
        }
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15
      }
    }));
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { message: 'not found' } }));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

try {
  const address = server.address();
  const port = address.port;
  const configPath = path.join(tempHome, 'providers.json');
  fs.writeFileSync(configPath, JSON.stringify({
    default_provider: 'mock-bridge',
    providers: {
      'mock-bridge': {
        type: 'openai-compatible',
        enabled: true,
        base_url: `http://127.0.0.1:${port}/v1`,
        api_key_env: 'LUCY_TEST_API_KEY',
        model: 'placeholder-model',
        default_model: 'placeholder-model',
        available_models: ['placeholder-model'],
        model_aliases: {
          balanced: 'glm-4.5',
          fast: 'qwen-max'
        },
        task_model_preferences: {
          qa: ['balanced', 'fast']
        },
        timeout_ms: 5000
      }
    }
  }, null, 2));

  const {
    discoverProviderModels,
    persistDefaultModel,
    createProviderClient,
    resolveProvider
  } = await import('../../packages/harness-adapter/src/index.mjs');

  const discovered = await discoverProviderModels({ providerName: 'mock-bridge', configPath });
  assert.deepEqual(discovered.discovered_models.models, ['glm-4.5', 'qwen-max']);
  assert.equal(lastModelsRequest.authorization, 'Bearer test-key');

  const resolvedFromTask = resolveProvider('mock-bridge', configPath, null, 'qa');
  assert.equal(resolvedFromTask.model_selection.resolved, 'glm-4.5');
  assert.deepEqual(resolvedFromTask.model_selection.discovered_models, ['glm-4.5', 'qwen-max']);

  const runtime = createProviderClient({ providerName: 'mock-bridge', taskType: 'qa', configPath });
  const response = await runtime.client.chat({
    model: runtime.model_selection.resolved,
    messages: [{ role: 'user', content: 'hello lucy' }]
  });

  assert.equal(response.implemented, true);
  assert.equal(response.model, 'glm-4.5');
  assert.equal(response.text, 'reply:glm-4.5:hello lucy');
  assert.equal(lastChatRequest.authorization, 'Bearer test-key');
  assert.equal(lastChatRequest.body.model, 'glm-4.5');

  await persistDefaultModel({ providerName: 'mock-bridge', model: 'qwen-max', configPath });
  const resolvedFromDefault = createProviderClient({ providerName: 'mock-bridge', configPath });
  assert.equal(resolvedFromDefault.model_selection.resolved, 'qwen-max');

  console.log('openai-compatible chat smoke ok');
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
