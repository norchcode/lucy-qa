import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-onboarding-chat-'));

try {
  const save = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'qa',
    'onboarding',
    'we use qase project WEB and jira project QA. append evidence to linked bugs before opening new ones.',
    '--vault',
    tempRoot,
    '--plain'
  ], { cwd: '/root/lucy-qa', encoding: 'utf8' });

  assert.equal(save.status, 0, save.stderr || save.stdout);
  assert.match(save.stdout, /configured: yes/i);
  assert.match(save.stdout, /qa_test_management: qase/i);
  assert.match(save.stdout, /qa_project: WEB/i);
  assert.match(save.stdout, /issue_tracker: jira/i);
  assert.match(save.stdout, /issue_project: QA/i);
  assert.match(save.stdout, /preferred_bug_workflow: append evidence to linked bugs before opening new ones/i);

  const onboardingPath = path.join(tempRoot, 'qa-config', 'onboarding.json');
  const savedProfile = JSON.parse(fs.readFileSync(onboardingPath, 'utf8'));
  assert.equal(savedProfile.qa_test_management, 'qase');
  assert.equal(savedProfile.qa_project, 'WEB');
  assert.equal(savedProfile.issue_tracker, 'jira');
  assert.equal(savedProfile.issue_project, 'QA');

  console.log('qa onboarding conversation smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
