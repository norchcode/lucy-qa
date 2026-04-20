import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-startup-'));

try {
  const save = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'state',
    'save-session',
    'Continue checkout triage after restart.',
    '--project',
    'checkout',
    '--vault',
    tempRoot,
    '--plain'
  ], { cwd: '/root/lucy-qa', encoding: 'utf8' });

  assert.equal(save.status, 0, save.stderr || save.stdout);

  const startup = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs'
  ], {
    cwd: '/root/lucy-qa',
    env: { ...process.env, LUCY_QA_VAULT_PATH: tempRoot },
    encoding: 'utf8'
  });

  assert.equal(startup.status, 0, startup.stderr || startup.stdout);
  assert.match(startup.stdout, /Previous Lucy QA session found/i);
  assert.match(startup.stdout, /state resume/i);
  assert.match(startup.stdout, /state new-session/i);

  console.log('state startup prompt smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
