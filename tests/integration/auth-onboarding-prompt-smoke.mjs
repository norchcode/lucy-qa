import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-auth-onboarding-'));

try {
  const result = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'auth',
    'status',
    '--provider',
    'openai-codex'
  ], {
    cwd: '/root/lucy-qa',
    env: { ...process.env, LUCY_QA_VAULT_PATH: tempRoot },
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Codex auth status/i);
  assert.match(result.stdout, /Lucy QA onboarding after login check/i);
  assert.match(result.stdout, /QA\/test management: Qase, TestRail, Xray, Zephyr, or none/i);
  assert.match(result.stdout, /Task\/issue tracker: Jira, Linear, GitHub Issues/i);

  console.log('auth onboarding prompt smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
