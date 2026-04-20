import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-journal-autosave-'));

try {
  const fakeRunnerPath = path.join(tempRoot, 'fake-runner-failed.mjs');
  fs.writeFileSync(fakeRunnerPath, `
process.stdout.write(JSON.stringify({
  stats: { expected: 1, unexpected: 1, skipped: 0, flaky: 0, duration: 123 },
  suites: [{ title: 'Checkout suite', specs: [{ title: 'TC-999 redirect loop', tests: [{ projectName: 'chromium', results: [{ status: 'failed', duration: 123, error: { message: 'Redirect loop' }, attachments: [] }] }] }] }]
}));
process.exit(1);
`);

  const result = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'qa',
    'run',
    'tests/e2e/checkout.spec.js',
    '--artifacts-root',
    path.join(tempRoot, 'artifacts'),
    '--plain'
  ], {
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

  const journalPath = path.join(tempRoot, 'journals', 'current-session.md');
  assert.ok(fs.existsSync(journalPath), 'journal markdown should be auto-saved');
  const journal = fs.readFileSync(journalPath, 'utf8');
  assert.match(journal, /Latest QA run/i);
  assert.match(journal, /Investigate failed QA run/i);
  assert.match(journal, /qa run tests\/e2e\/checkout.spec.js/i);

  console.log('state journal autosave smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
