import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-state-open-tasks-'));

try {
  const fakeRunnerPath = path.join(tempRoot, 'fake-runner-failed.mjs');
  fs.writeFileSync(fakeRunnerPath, `
import path from 'node:path';
process.stdout.write(JSON.stringify({
  stats: { expected: 1, unexpected: 1, skipped: 0, flaky: 0, duration: 456 },
  suites: [{ title: 'Checkout suite', specs: [{ title: 'TC-201 checkout login fails', tests: [{ projectName: 'chromium', results: [{ status: 'failed', duration: 456, error: { message: 'Login redirect loop' }, attachments: [] }] }] }] }]
}));
process.exit(1);
`);

  const result = spawnSync(process.execPath, ['apps/cli/src/index.mjs', 'qa', 'run', 'tests/e2e/checkout.spec.js', '--artifacts-root', path.join(tempRoot, 'artifacts'), '--plain'], {
    cwd: '/root/lucy-qa',
    env: {
      ...process.env,
      LUCY_QA_RUNNER_COMMAND: process.execPath,
      LUCY_QA_RUNNER_ARGS_JSON: JSON.stringify([fakeRunnerPath]),
      LUCY_QA_VAULT_PATH: tempRoot
    },
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const openTasksPath = path.join(tempRoot, 'state', 'open-tasks.json');
  assert.ok(fs.existsSync(openTasksPath), 'open-tasks.json should be auto-saved');
  const openTasks = JSON.parse(fs.readFileSync(openTasksPath, 'utf8'));
  assert.ok(openTasks.tasks.some((task) => /Investigate failed QA run/i.test(task)), JSON.stringify(openTasks));
  assert.ok(openTasks.tasks.some((task) => /Draft or review bugs/i.test(task)), JSON.stringify(openTasks));

  const sessionsDir = path.join(tempRoot, 'sessions');
  assert.ok(fs.existsSync(sessionsDir), 'sessions dir should exist');
  assert.ok(fs.readdirSync(sessionsDir).some((name) => name.endsWith('.md')), 'session history markdown should be written');

  console.log('state autosave open tasks smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
