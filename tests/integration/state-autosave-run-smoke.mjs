import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-state-run-'));

try {
  const fakeRunnerPath = path.join(tempRoot, 'fake-runner.mjs');
  fs.writeFileSync(fakeRunnerPath, `
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const configPath = args[args.indexOf('--config') + 1];
const configDir = path.dirname(configPath);
const videosDir = path.join(configDir, 'test-results', 'videos');
fs.mkdirSync(videosDir, { recursive: true });
fs.writeFileSync(path.join(videosDir, 'demo.webm'), 'video');
process.stdout.write(JSON.stringify({
  stats: { expected: 1, unexpected: 0, skipped: 0, flaky: 0, duration: 321 },
  suites: [{ title: 'Demo suite', specs: [{ title: 'TC-001 works', tests: [{ projectName: 'chromium', results: [{ status: 'passed', duration: 321, attachments: [{ name: 'video', path: path.join(videosDir, 'demo.webm') }] }] }] }] }]
}));
`);

  const result = spawnSync(process.execPath, ['apps/cli/src/index.mjs', 'qa', 'run', 'tests/e2e/demo.spec.js', '--artifacts-root', path.join(tempRoot, 'artifacts'), '--plain'], {
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
  const stateFile = path.join(tempRoot, 'state', 'last-run.json');
  assert.ok(fs.existsSync(stateFile), 'last-run.json should be auto-saved');
  const lastRun = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(lastRun.status, 'passed');
  assert.match(lastRun.target, /demo\.spec\.js/);

  console.log('state autosave run smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
