import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-provider-chat-'));
const configPath = path.join(tempRoot, 'providers.local.json');

try {
  const env = {
    ...process.env,
    LUCY_QA_PROVIDER_CONFIG_PATH: configPath,
    COPILOT_GITHUB_TOKEN: 'copilot-test-token'
  };

  const result = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'provider',
    'setup',
    'use github copilot and make it default',
    '--plain'
  ], {
    cwd: '/root/lucy-qa',
    env,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /provider_name: github-copilot/i);
  assert.match(result.stdout, /type: openai-compatible/i);
  assert.match(result.stdout, /api_key_env: COPILOT_GITHUB_TOKEN/i);
  assert.match(result.stdout, /default_provider: github-copilot/i);

  const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(saved.default_provider, 'github-copilot');
  assert.equal(saved.providers['github-copilot'].api_key_env, 'COPILOT_GITHUB_TOKEN');
  assert.equal(saved.providers['github-copilot'].default_headers['Copilot-Integration-Id'], 'vscode-chat');

  console.log('provider setup conversation smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
