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

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-provider-copilot-'));
const configPath = path.join(tempRoot, 'providers.local.json');

let lastChatRequest = null;
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');
  const body = rawBody ? JSON.parse(rawBody) : null;

  if (req.url === '/v1/chat/completions' && req.method === 'POST') {
    lastChatRequest = { headers: req.headers, body };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      id: 'chatcmpl-copilot-test',
      object: 'chat.completion',
      created: 123,
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'hello from copilot preset' } }],
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
  const env = {
    ...process.env,
    LUCY_QA_PROVIDER_CONFIG_PATH: configPath,
    LUCY_TEST_GITHUB_COPILOT_TOKEN: 'copilot-test-token'
  };

  const setup = await runNode([
    'apps/cli/src/index.mjs', 'provider', 'setup', 'github-copilot',
    '--preset', 'github-copilot',
    '--base-url', `http://127.0.0.1:${port}/v1`,
    '--api-key-env', 'LUCY_TEST_GITHUB_COPILOT_TOKEN',
    '--model', 'gpt-4o',
    '--plain'
  ], { cwd: '/root/lucy-qa', env, encoding: 'utf8' });
  assert.equal(setup.status, 0, setup.stderr || setup.stdout);
  assert.match(setup.stdout, /provider_name: github-copilot/i);
  assert.match(setup.stdout, /api_key_env: LUCY_TEST_GITHUB_COPILOT_TOKEN/i);

  const ask = await runNode([
    'apps/cli/src/index.mjs', 'ask', 'hello from lucy',
    '--provider', 'github-copilot',
    '--plain'
  ], { cwd: '/root/lucy-qa', env, encoding: 'utf8' });
  assert.equal(ask.status, 0, ask.stderr || ask.stdout);
  assert.match(ask.stdout, /hello from copilot preset/i);
  assert.equal(lastChatRequest.headers.authorization, 'Bearer copilot-test-token');
  assert.equal(lastChatRequest.headers['copilot-integration-id'], 'vscode-chat');
  assert.equal(lastChatRequest.body.model, 'gpt-4o');

  const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(saved.providers['github-copilot'].default_headers['Copilot-Integration-Id'], 'vscode-chat');

  console.log('provider github copilot smoke ok');
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
