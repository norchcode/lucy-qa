import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-first-install-ansi-'));

try {
  const result = spawnSync(process.execPath, ['apps/cli/src/index.mjs'], {
    cwd: '/root/lucy-qa',
    env: { ...process.env, HOME: tempRoot, LUCY_QA_VAULT_PATH: tempRoot, FORCE_COLOR: '1' },
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /\x1b\[[0-9;]*m/);
  assert.match(result.stdout, /LUCY QA \/\/ QA COCKPIT/i);
  assert.match(result.stdout, /Available actions/i);

  console.log('first install ansi smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
