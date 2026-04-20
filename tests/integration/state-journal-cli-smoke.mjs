import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-journal-cli-'));

try {
  const save = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'state',
    'save-session',
    'Continue checkout investigation tomorrow.',
    '--project',
    'checkout',
    '--vault',
    tempRoot,
    '--plain'
  ], { cwd: '/root/lucy-qa', encoding: 'utf8' });

  assert.equal(save.status, 0, save.stderr || save.stdout);

  const journal = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'state',
    'journal',
    '--vault',
    tempRoot,
    '--plain'
  ], { cwd: '/root/lucy-qa', encoding: 'utf8' });

  assert.equal(journal.status, 0, journal.stderr || journal.stdout);
  assert.match(journal.stdout, /Session journal/i);
  assert.match(journal.stdout, /Continue checkout investigation tomorrow/i);
  assert.match(journal.stdout, /entries: 1/i);

  console.log('state journal cli smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
