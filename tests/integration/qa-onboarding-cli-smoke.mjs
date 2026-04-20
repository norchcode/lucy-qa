import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-onboarding-'));

try {
  const show = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'qa',
    'onboarding',
    '--vault',
    tempRoot,
    '--plain'
  ], { cwd: '/root/lucy-qa', encoding: 'utf8' });

  assert.equal(show.status, 0, show.stderr || show.stdout);
  assert.match(show.stdout, /configured: no/i);
  assert.match(show.stdout, /question: Which QA\/test management system do you use/i);
  assert.match(show.stdout, /question: Which task management \/ issue tracker do you use/i);
  assert.doesNotMatch(show.stdout, /question: If relevant, what QA\/test management project\/code should Lucy QA use there/i);

  const save = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'qa',
    'onboarding',
    '--qa-test-management',
    'Qase',
    '--qa-project',
    'WEB',
    '--issue-tracker',
    'Jira',
    '--issue-project',
    'QA',
    '--preferred-bug-workflow',
    'Append evidence to linked bugs before opening new ones.',
    '--vault',
    tempRoot,
    '--plain'
  ], { cwd: '/root/lucy-qa', encoding: 'utf8' });

  assert.equal(save.status, 0, save.stderr || save.stdout);
  assert.match(save.stdout, /configured: yes/i);
  assert.match(save.stdout, /qa_test_management: Qase/i);
  assert.match(save.stdout, /qa_project: WEB/i);
  assert.match(save.stdout, /issue_tracker: Jira/i);
  assert.match(save.stdout, /issue_project: QA/i);

  const startup = spawnSync(process.execPath, ['apps/cli/src/index.mjs'], {
    cwd: '/root/lucy-qa',
    env: { ...process.env, LUCY_QA_VAULT_PATH: tempRoot },
    encoding: 'utf8'
  });

  assert.equal(startup.status, 0, startup.stderr || startup.stdout);
  assert.match(startup.stdout, /Lucy QA onboarding/i);
  assert.match(startup.stdout, /qa_test_management: Qase/i);
  assert.match(startup.stdout, /issue_tracker: Jira/i);

  console.log('qa onboarding cli smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
