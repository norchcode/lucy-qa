import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const runNode = (args, options = {}) => new Promise((resolve) => {
  const child = spawn(process.execPath, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.on('close', (code) => resolve({ status: code, stdout, stderr }));
});

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-provider-setup-'));
const configPath = path.join(tempRoot, 'providers.local.json');

let lastChatRequest = null;
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');
  const body = rawBody ? JSON.parse(rawBody) : null;

  if (req.url === '/v1/chat/completions' && req.method === 'POST') {
    lastChatRequest = { authorization: req.headers.authorization ?? null, body };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 123,
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: [{ type: 'text', text: 'hello from custom bridge' }] } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
    }));
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { message: 'not found' } }));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

try {
  const port = server.address().port;
  const baseEnv = {
    ...process.env,
    LUCY_QA_PROVIDER_CONFIG_PATH: configPath,
    LUCY_TEST_CUSTOM_PROVIDER_KEY: 'test-key'
  };

  const presets = await runNode(['apps/cli/src/index.mjs', 'provider', 'presets', '--plain'], {
    cwd: '/root/lucy-qa', env: baseEnv, encoding: 'utf8'
  });
  assert.equal(presets.status, 0, presets.stderr || presets.stdout);
  assert.match(presets.stdout, /cliproxyapi/i);
  assert.match(presets.stdout, /adacode/i);
  assert.match(presets.stdout, /openai-compatible/i);
  assert.match(presets.stdout, /github-copilot/i);
  assert.match(presets.stdout, /glm/i);
  assert.match(presets.stdout, /minimax/i);

  const adacode = await runNode([
    'apps/cli/src/index.mjs', 'provider', 'setup', 'adacode',
    '--preset', 'adacode',
    '--api-key-env', 'ADACODE_API_KEY',
    '--model', 'claude-sonnet-4-6',
    '--set-default',
    '--plain'
  ], { cwd: '/root/lucy-qa', env: baseEnv, encoding: 'utf8' });
  assert.equal(adacode.status, 0, adacode.stderr || adacode.stdout);
  assert.match(adacode.stdout, /provider_name: adacode/i);
  assert.match(adacode.stdout, /base_url: https:\/\/api.adacode.ai\/v1/i);
  assert.match(adacode.stdout, /default_provider: adacode/i);

  const custom = await runNode([
    'apps/cli/src/index.mjs', 'provider', 'setup', 'custom-bridge',
    '--preset', 'openai-compatible',
    '--base-url', `http://127.0.0.1:${port}/v1`,
    '--api-key-env', 'LUCY_TEST_CUSTOM_PROVIDER_KEY',
    '--model', 'bridge-model',
    '--label', 'Custom Bridge',
    '--plain'
  ], { cwd: '/root/lucy-qa', env: baseEnv, encoding: 'utf8' });
  assert.equal(custom.status, 0, custom.stderr || custom.stdout);
  assert.match(custom.stdout, /provider_name: custom-bridge/i);
  assert.match(custom.stdout, /api_key_env: LUCY_TEST_CUSTOM_PROVIDER_KEY/i);

  const show = await runNode(['apps/cli/src/index.mjs', 'provider', 'show', 'custom-bridge'], {
    cwd: '/root/lucy-qa', env: baseEnv, encoding: 'utf8'
  });
  assert.equal(show.status, 0, show.stderr || show.stdout);
  assert.match(show.stdout, /base_url: http:\/\/127.0.0.1:/i);
  assert.match(show.stdout, /type: openai-compatible/i);

  const ask = await runNode(['apps/cli/src/index.mjs', 'ask', 'hello lucy', '--provider', 'custom-bridge', '--plain'], {
    cwd: '/root/lucy-qa', env: baseEnv, encoding: 'utf8'
  });
  assert.equal(ask.status, 0, ask.stderr || ask.stdout);
  assert.match(ask.stdout, /hello from custom bridge/i);
  assert.equal(lastChatRequest.authorization, 'Bearer test-key');
  assert.equal(lastChatRequest.body.model, 'bridge-model');

  const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(saved.default_provider, 'adacode');
  assert.equal(saved.providers['custom-bridge'].base_url, `http://127.0.0.1:${port}/v1`);

  console.log('provider setup cli smoke ok');
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
