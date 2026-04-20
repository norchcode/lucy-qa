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

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-minimax-'));
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
      id: 'chatcmpl-minimax-test',
      object: 'chat.completion',
      created: 123,
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: [{ type: 'text', text: 'hello from minimax' }] } }],
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
    MINIMAX_API_KEY: 'minimax-test-api-key'
  };

  // 1. Verify minimax appears in presets
  const presets = await runNode(['apps/cli/src/index.mjs', 'provider', 'presets', '--plain'], {
    cwd: '/root/lucy-qa', env: baseEnv, encoding: 'utf8'
  });
  assert.equal(presets.status, 0, presets.stderr || presets.stdout);
  assert.match(presets.stdout, /minimax/i);
  assert.match(presets.stdout, /MiniMax AI models/i);

  // 2. Setup MiniMax via --preset flag
  const setup = await runNode([
    'apps/cli/src/index.mjs', 'provider', 'setup', 'minimax',
    '--preset', 'minimax',
    '--api-key-env', 'MINIMAX_API_KEY',
    '--set-default',
    '--plain'
  ], { cwd: '/root/lucy-qa', env: baseEnv, encoding: 'utf8' });
  assert.equal(setup.status, 0, setup.stderr || setup.stdout);
  assert.match(setup.stdout, /provider_name: minimax/i);
  assert.match(setup.stdout, /base_url: https:\/\/api\.minimax\.chat\/v1/i);
  assert.match(setup.stdout, /default_provider: minimax/i);

  // 3. Verify saved config
  const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(saved.default_provider, 'minimax');
  assert.equal(saved.providers['minimax'].type, 'openai-compatible');
  assert.equal(saved.providers['minimax'].api_key_env, 'MINIMAX_API_KEY');
  assert.ok(saved.providers['minimax'].available_models.includes('MiniMax-Text-01'));
  assert.ok(saved.providers['minimax'].available_models.includes('MiniMax-M1'));
  assert.equal(saved.providers['minimax'].model_aliases.balanced, 'MiniMax-Text-01');
  assert.equal(saved.providers['minimax'].model_aliases.reasoning, 'MiniMax-M1');

  // 4. Setup MiniMax via conversational inference
  const convSetup = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'provider',
    'setup',
    'use minimax and make it default',
    '--plain'
  ], {
    cwd: '/root/lucy-qa',
    env: baseEnv,
    encoding: 'utf8'
  });
  assert.equal(convSetup.status, 0, convSetup.stderr || convSetup.stdout);
  assert.match(convSetup.stdout, /provider_name: minimax/i);
  assert.match(convSetup.stdout, /default_provider: minimax/i);

  // 5. Chat against a local mock server using MiniMax preset
  const setupLocal = await runNode([
    'apps/cli/src/index.mjs', 'provider', 'setup', 'minimax-local',
    '--preset', 'minimax',
    '--base-url', `http://127.0.0.1:${port}/v1`,
    '--api-key-env', 'MINIMAX_API_KEY',
    '--model', 'MiniMax-Text-01',
    '--plain'
  ], { cwd: '/root/lucy-qa', env: baseEnv, encoding: 'utf8' });
  assert.equal(setupLocal.status, 0, setupLocal.stderr || setupLocal.stdout);

  const ask = await runNode([
    'apps/cli/src/index.mjs', 'ask', 'hello minimax', '--provider', 'minimax-local', '--plain'
  ], { cwd: '/root/lucy-qa', env: baseEnv, encoding: 'utf8' });
  assert.equal(ask.status, 0, ask.stderr || ask.stdout);
  assert.match(ask.stdout, /hello from minimax/i);
  assert.equal(lastChatRequest?.authorization, 'Bearer minimax-test-api-key');
  assert.equal(lastChatRequest?.body?.model, 'MiniMax-Text-01');

  console.log('provider minimax smoke ok');
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
