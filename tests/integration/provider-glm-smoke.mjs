import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const runNode = (args, options = {}) => new Promise((resolve) => {
  const child = spawn(process.execPath, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('close', (code) => resolve({ status: code, stdout, stderr }));
});

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-glm-'));
const configPath = path.join(tempRoot, 'providers.local.json');

let lastChatRequest = null;
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');
  const body = rawBody ? JSON.parse(rawBody) : null;

  if (req.url === '/api/paas/v4/chat/completions' && req.method === 'POST') {
    lastChatRequest = { authorization: req.headers.authorization ?? null, body };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      id: 'chatcmpl-glm-test',
      object: 'chat.completion',
      created: 123,
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: [{ type: 'text', text: 'hello from glm' }] } }],
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
    ZHIPU_API_KEY: 'glm-test-api-key'
  };

  // 1. Verify glm appears in presets
  const presets = await runNode(['apps/cli/src/index.mjs', 'provider', 'presets', '--plain'], {
    cwd: '/root/lucy-qa', env: baseEnv, encoding: 'utf8'
  });
  assert.equal(presets.status, 0, presets.stderr || presets.stdout);
  assert.match(presets.stdout, /glm/i);
  assert.match(presets.stdout, /zhipu/i);

  // 2. Setup GLM via --preset flag
  const setup = await runNode([
    'apps/cli/src/index.mjs', 'provider', 'setup', 'glm',
    '--preset', 'glm',
    '--api-key-env', 'ZHIPU_API_KEY',
    '--set-default',
    '--plain'
  ], { cwd: '/root/lucy-qa', env: baseEnv, encoding: 'utf8' });
  assert.equal(setup.status, 0, setup.stderr || setup.stdout);
  assert.match(setup.stdout, /provider_name: glm/i);
  assert.match(setup.stdout, /base_url: https:\/\/open\.bigmodel\.cn\/api\/paas\/v4/i);
  assert.match(setup.stdout, /default_provider: glm/i);

  // 3. Verify saved config
  const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(saved.default_provider, 'glm');
  assert.equal(saved.providers['glm'].type, 'openai-compatible');
  assert.equal(saved.providers['glm'].api_key_env, 'ZHIPU_API_KEY');
  assert.ok(saved.providers['glm'].available_models.includes('glm-4-plus'));
  assert.ok(saved.providers['glm'].available_models.includes('glm-4-flash'));
  assert.equal(saved.providers['glm'].model_aliases.balanced, 'glm-4-plus');
  assert.equal(saved.providers['glm'].model_aliases.fast, 'glm-4-flash');

  // 4. Setup GLM via conversational inference
  const convSetup = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'provider',
    'setup',
    'use glm and make it default',
    '--plain'
  ], {
    cwd: '/root/lucy-qa',
    env: baseEnv,
    encoding: 'utf8'
  });
  assert.equal(convSetup.status, 0, convSetup.stderr || convSetup.stdout);
  assert.match(convSetup.stdout, /provider_name: glm/i);
  assert.match(convSetup.stdout, /default_provider: glm/i);

  // 5. Chat against a local mock server using GLM preset
  const glmOverrideEnv = {
    ...baseEnv,
    LUCY_GLM_OVERRIDE_BASE_URL: `http://127.0.0.1:${port}/api/paas/v4`
  };
  const setupLocal = await runNode([
    'apps/cli/src/index.mjs', 'provider', 'setup', 'glm-local',
    '--preset', 'glm',
    '--base-url', `http://127.0.0.1:${port}/api/paas/v4`,
    '--api-key-env', 'ZHIPU_API_KEY',
    '--model', 'glm-4-flash',
    '--plain'
  ], { cwd: '/root/lucy-qa', env: baseEnv, encoding: 'utf8' });
  assert.equal(setupLocal.status, 0, setupLocal.stderr || setupLocal.stdout);

  const ask = await runNode([
    'apps/cli/src/index.mjs', 'ask', 'hello glm', '--provider', 'glm-local', '--plain'
  ], { cwd: '/root/lucy-qa', env: baseEnv, encoding: 'utf8' });
  assert.equal(ask.status, 0, ask.stderr || ask.stdout);
  assert.match(ask.stdout, /hello from glm/i);
  assert.equal(lastChatRequest?.authorization, 'Bearer glm-test-api-key');
  assert.equal(lastChatRequest?.body?.model, 'glm-4-flash');

  console.log('provider glm smoke ok');
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
