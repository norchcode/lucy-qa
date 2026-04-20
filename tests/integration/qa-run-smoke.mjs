import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-run-smoke-'));

try {
  const fakeRunnerPath = path.join(tempRoot, 'fake-playwright-runner.mjs');
  fs.writeFileSync(fakeRunnerPath, `
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const configIndex = args.indexOf('--config');
const configPath = configIndex >= 0 ? args[configIndex + 1] : null;
const configDir = path.dirname(configPath);
const resultsDir = path.join(configDir, 'test-results');
const videosDir = path.join(resultsDir, 'videos');
const tracesDir = path.join(resultsDir, 'traces');
const screenshotsDir = path.join(resultsDir, 'screenshots');
fs.mkdirSync(videosDir, { recursive: true });
fs.mkdirSync(tracesDir, { recursive: true });
fs.mkdirSync(screenshotsDir, { recursive: true });
fs.writeFileSync(path.join(videosDir, 'tc-001.webm'), 'video');
fs.writeFileSync(path.join(tracesDir, 'tc-001.zip'), 'trace');
fs.writeFileSync(path.join(screenshotsDir, 'tc-002-failed.png'), 'png');
process.stdout.write(JSON.stringify({
  stats: { expected: 2, unexpected: 1, skipped: 0, flaky: 0, duration: 1234 },
  suites: [
    {
      title: 'Login suite',
      specs: [
        {
          title: 'TC-001 valid login works',
          tests: [{
            projectName: 'chromium',
            results: [{
              status: 'passed',
              duration: 450,
              attachments: [
                { name: 'video', path: path.join(videosDir, 'tc-001.webm') },
                { name: 'trace', path: path.join(tracesDir, 'tc-001.zip') }
              ]
            }]
          }]
        },
        {
          title: 'TC-002 invalid password shows error',
          tests: [{
            projectName: 'chromium',
            results: [{
              status: 'failed',
              duration: 784,
              error: { message: 'expected error banner' },
              attachments: [
                { name: 'screenshot', path: path.join(screenshotsDir, 'tc-002-failed.png') }
              ]
            }]
          }]
        }
      ]
    }
  ]
}, null, 2));
`);

  const { runPlaywrightSuite } = await import('../../packages/qa-playwright/src/index.mjs');

  const result = await runPlaywrightSuite({
    target: 'tests/e2e/login.spec.js',
    artifactsRoot: path.join(tempRoot, 'artifacts'),
    runnerCommand: process.execPath,
    runnerArgs: [fakeRunnerPath],
    intake: {
      dom: {
        risks: ['Iframe content may require frame-aware automation and assertions.'],
        interactions: ['iframe'],
        selector_strategy: 'role-first with frame-aware fallbacks'
      },
      probe: {
        interactions: ['client-side navigation/state change'],
        safe_action_count: 1,
        observed_routes: ['https://example.com/login', 'https://example.com/dashboard']
      }
    },
    docsContext: [{ query: 'Playwright iframe testing patterns', engine: 'context7-fixture', results: [] }]
  });

  assert.equal(result.implemented, true, 'qa run should be implemented');
  assert.equal(result.status, 'failed', 'overall status should be failed when one test fails');
  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.passed, 1);
  assert.equal(result.summary.failed, 1);
  assert.equal(result.execution_profile.mode, 'serial-risk-aware');
  assert.equal(result.execution_profile.workers, 1);
  assert.ok(fs.existsSync(result.intake_path), 'run intake snapshot should exist');
  assert.ok(fs.existsSync(result.docs_context_path), 'run docs context snapshot should exist');
  assert.equal(result.artifacts.videos.length, 1);
  assert.equal(result.artifacts.traces.length, 1);
  assert.equal(result.artifacts.screenshots.length, 1);
  assert.match(result.failure_summary[0], /TC-002/);
  assert.ok(fs.existsSync(result.run_dir), 'run directory should exist');
  assert.ok(fs.existsSync(result.config_path), 'generated config should exist');

  console.log('qa run smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
