import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-onboarding-iterative-'));

try {
  const partial = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'qa',
    'onboarding',
    'we use qase project WEB',
    '--vault',
    tempRoot,
    '--plain'
  ], { cwd: '/root/lucy-qa', encoding: 'utf8' });

  assert.equal(partial.status, 0, partial.stderr || partial.stdout);
  assert.match(partial.stdout, /configured: no/i);
  assert.match(partial.stdout, /qa_test_management: qase/i);
  assert.match(partial.stdout, /qa_project: WEB/i);
  assert.match(partial.stdout, /issue_tracker: not set/i);
  assert.match(partial.stdout, /question: Which task management \/ issue tracker do you use/i);
  assert.doesNotMatch(partial.stdout, /question: If relevant, what project\/team\/key should Lucy QA use there/i);
  assert.doesNotMatch(partial.stdout, /question: Which QA\/test management system do you use/i);

  const startup = spawnSync(process.execPath, ['apps/cli/src/index.mjs'], {
    cwd: '/root/lucy-qa',
    env: { ...process.env, LUCY_QA_VAULT_PATH: tempRoot },
    encoding: 'utf8'
  });

  assert.equal(startup.status, 0, startup.stderr || startup.stdout);
  assert.match(startup.stdout, /Lucy QA onboarding/i);
  assert.match(startup.stdout, /qa_test_management: qase/i);
  assert.match(startup.stdout, /qa_project: WEB/i);
  assert.match(startup.stdout, /issue_tracker: not configured yet/i);
  assert.match(startup.stdout, /Next step/i);
  assert.match(startup.stdout, /saved so far: qase \/ WEB/i);
  assert.match(startup.stdout, /Questions/i);
  assert.match(startup.stdout, /Which task management \/ issue tracker do you use/i);
  assert.doesNotMatch(startup.stdout, /Which QA\/test management system do you use/i);

  const finish = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'qa',
    'onboarding',
    'we use jira project QA',
    '--vault',
    tempRoot,
    '--plain'
  ], { cwd: '/root/lucy-qa', encoding: 'utf8' });

  assert.equal(finish.status, 0, finish.stderr || finish.stdout);
  assert.match(finish.stdout, /configured: yes/i);
  assert.match(finish.stdout, /issue_tracker: jira/i);
  assert.match(finish.stdout, /issue_project: QA/i);

  console.log('qa onboarding iterative smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
