import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-memory-cli-'));

try {
  const save = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'memory',
    'save',
    'Staging login note',
    '--content',
    'Remember that login redirect is flaky on staging checkout.',
    '--category',
    'project',
    '--vault',
    tempRoot,
    '--plain'
  ], { cwd: '/root/lucy-qa', encoding: 'utf8' });

  assert.equal(save.status, 0, save.stderr || save.stdout);
  assert.match(save.stdout, /Memory note saved/i);

  const search = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'memory',
    'search',
    'staging checkout',
    '--vault',
    tempRoot,
    '--plain'
  ], { cwd: '/root/lucy-qa', encoding: 'utf8' });

  assert.equal(search.status, 0, search.stderr || search.stdout);
  assert.match(search.stdout, /Memory search results/i);
  assert.match(search.stdout, /Staging login note/i);

  console.log('memory cli smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
