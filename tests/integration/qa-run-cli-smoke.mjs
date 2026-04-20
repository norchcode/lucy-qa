import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-run-cli-'));

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

  const result = spawnSync(process.execPath, ['apps/cli/src/index.mjs', 'qa', 'run', 'tests/e2e/demo.spec.js', '--plain'], {
    cwd: '/root/lucy-qa',
    env: {
      ...process.env,
      LUCY_QA_RUNNER_COMMAND: process.execPath,
      LUCY_QA_RUNNER_ARGS_JSON: JSON.stringify([fakeRunnerPath])
    },
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /QA run completed/i);
  assert.match(result.stdout, /status: passed/i);
  assert.match(result.stdout, /execution_profile:/i);
  assert.match(result.stdout, /videos: 1/i);

  console.log('qa run cli smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
