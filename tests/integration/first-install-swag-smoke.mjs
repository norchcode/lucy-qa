import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-first-install-'));

const runCli = () => spawnSync(process.execPath, ['apps/cli/src/index.mjs'], {
  cwd: '/root/lucy-qa',
  env: { ...process.env, HOME: tempRoot, LUCY_QA_VAULT_PATH: tempRoot },
  encoding: 'utf8'
});

try {
  const firstRun = runCli();
  assert.equal(firstRun.status, 0, firstRun.stderr || firstRun.stdout);
  assert.match(firstRun.stdout, /LUCY QA \/\/ QA COCKPIT/i);
  assert.match(firstRun.stdout, /QA assistant ready/i);
  assert.match(firstRun.stdout, /version: 0\.1\.0/i);
  assert.match(firstRun.stdout, /available: plan \| run \| report \| file bugs/i);
  assert.match(firstRun.stdout, /Available actions/i);
  assert.match(firstRun.stdout, /Integrations/i);
  assert.match(firstRun.stdout, /Recommended first steps/i);
  assert.match(firstRun.stdout, /Add Jira or Qase credentials after saving the defaults/i);
  assert.match(firstRun.stdout, /Setup/i);
  assert.match(firstRun.stdout, /Lucy QA started setup because this is a new workspace/i);
  assert.match(firstRun.stdout, /Lucy QA onboarding/i);
  assert.match(firstRun.stdout, /Which QA\/test management system do you use/i);

  const secondRun = runCli();
  assert.equal(secondRun.status, 0, secondRun.stderr || secondRun.stdout);
  assert.doesNotMatch(secondRun.stdout, /LUCY QA \/\/ QA COCKPIT/i);
  assert.match(secondRun.stdout, /Lucy QA onboarding/i);

  console.log('first install swag smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
