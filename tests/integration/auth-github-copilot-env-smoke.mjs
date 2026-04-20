import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-auth-copilot-'));
const configPath = path.join(tempRoot, 'providers.local.json');

try {
  const env = {
    ...process.env,
    LUCY_QA_PROVIDER_CONFIG_PATH: configPath,
    COPILOT_GITHUB_TOKEN: 'copilot-env-token'
  };

  const status = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'auth',
    'status',
    '--provider',
    'github-copilot'
  ], {
    cwd: '/root/lucy-qa',
    env,
    encoding: 'utf8'
  });

  assert.equal(status.status, 0, status.stderr || status.stdout);
  assert.match(status.stdout, /GitHub Copilot auth status/i);
  assert.match(status.stdout, /provider: github-copilot/i);
  assert.match(status.stdout, /auth_mode: env-token/i);
  assert.match(status.stdout, /api_key_present: yes/i);
  assert.match(status.stdout, /detected_api_key_env: COPILOT_GITHUB_TOKEN/i);

  const login = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'auth',
    'login',
    '--provider',
    'github-copilot',
    '--set-default'
  ], {
    cwd: '/root/lucy-qa',
    env,
    encoding: 'utf8'
  });

  assert.equal(login.status, 0, login.stderr || login.stdout);
  assert.match(login.stdout, /GitHub Copilot auth ready/i);
  assert.match(login.stdout, /provider_name: github-copilot/i);
  assert.match(login.stdout, /api_key_env: COPILOT_GITHUB_TOKEN/i);
  assert.match(login.stdout, /default_provider: github-copilot/i);

  const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(saved.default_provider, 'github-copilot');
  assert.equal(saved.providers['github-copilot'].api_key_env, 'COPILOT_GITHUB_TOKEN');
  assert.equal(saved.providers['github-copilot'].base_url, 'https://api.githubcopilot.com');
  assert.equal(saved.providers['github-copilot'].default_headers['Copilot-Integration-Id'], 'vscode-chat');

  console.log('auth github copilot env smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
