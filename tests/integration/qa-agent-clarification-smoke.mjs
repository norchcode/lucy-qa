import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-agent-clarify-'));
const vaultPath = path.join(tempRoot, 'vault');

try {
  const result = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'qa',
    'agent',
    'review latest run',
    '--vault',
    vaultPath,
    '--plain'
  ], { cwd: '/root/lucy-qa', encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /clarification-needed/i);
  assert.match(result.stdout, /There is no saved latest run/i);
  assert.match(result.stdout, /suggestion:/i);

  console.log('qa agent clarification smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
