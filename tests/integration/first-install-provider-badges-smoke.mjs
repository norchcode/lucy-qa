import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-first-install-provider-'));
const lucyHome = path.join(tempRoot, '.lucy');
fs.mkdirSync(lucyHome, { recursive: true });
fs.writeFileSync(path.join(lucyHome, 'preferences.json'), JSON.stringify({ active_provider: 'openai-codex' }, null, 2));

try {
  const result = spawnSync(process.execPath, ['apps/cli/src/index.mjs'], {
    cwd: '/root/lucy-qa',
    env: { ...process.env, HOME: tempRoot, LUCY_QA_VAULT_PATH: tempRoot },
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /provider: openai-codex/i);
  assert.match(result.stdout, /model: gpt-5\.4/i);

  console.log('first install provider badges smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
