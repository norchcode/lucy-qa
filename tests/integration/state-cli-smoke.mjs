import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-state-cli-'));

try {
  const save = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'state',
    'save-session',
    'Continue checkout login investigation tomorrow.',
    '--project',
    'checkout',
    '--vault',
    tempRoot,
    '--plain'
  ], { cwd: '/root/lucy-qa', encoding: 'utf8' });

  assert.equal(save.status, 0, save.stderr || save.stdout);
  assert.match(save.stdout, /Session state saved/i);

  const show = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'state',
    'show',
    '--vault',
    tempRoot,
    '--plain'
  ], { cwd: '/root/lucy-qa', encoding: 'utf8' });

  assert.equal(show.status, 0, show.stderr || show.stdout);
  assert.match(show.stdout, /Resume context/i);
  assert.match(show.stdout, /checkout/i);
  assert.match(show.stdout, /Continue checkout login investigation tomorrow/i);

  console.log('state cli smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
