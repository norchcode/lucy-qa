import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-agent-bugs-'));
const vaultPath = path.join(tempRoot, 'vault');
const stateDir = path.join(vaultPath, 'state');
fs.mkdirSync(stateDir, { recursive: true });

try {
  const runDir = path.join(tempRoot, 'artifacts', 'playwright', 'runs', 'demo-run');
  fs.mkdirSync(path.join(runDir, 'test-results'), { recursive: true });
  const screenshotPath = path.join(runDir, 'test-results', 'TC-002 invalid password shows error-failed-1.png');
  fs.writeFileSync(screenshotPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l9n8AAAAASUVORK5CYII=', 'base64'));
  fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify({
    stats: { expected: 1, unexpected: 1, skipped: 0, flaky: 0, duration: 500 },
    suites: [{ title: 'Login suite', specs: [{ title: 'TC-002 invalid password shows error', tests: [{ projectName: 'chromium', results: [{ status: 'failed', duration: 300, error: { message: 'expected error banner' }, attachments: [{ name: 'screenshot', path: screenshotPath, contentType: 'image/png' }] }] }] }] }]
  }, null, 2));
  fs.writeFileSync(path.join(runDir, 'qa-intake.json'), JSON.stringify({
    target_url: 'https://example.test/login',
    execution_profile: { mode: 'serial-risk-aware', rationale: 'risk aware' },
    dom: { selector_strategy: 'data-testid and role-first', risks: [] },
    probe: { interactions: [] },
    crawl: { discovered_routes: [] },
    knowledge: { project_key: 'lucy-qa-example-test' }
  }, null, 2));
  fs.writeFileSync(path.join(stateDir, 'last-run.json'), JSON.stringify({
    run_id: 'demo-run',
    run_dir: runDir,
    status: 'failed',
    target: 'tests/e2e/login.spec.js',
    report_path: path.join(runDir, 'report.json'),
    updated_at: '2026-04-15T00:00:00.000Z'
  }, null, 2));

  const result = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'draft bugs from latest run',
    '--vault',
    vaultPath,
    '--plain'
  ], { cwd: '/root/lucy-qa', encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Lucy QA autonomous agent/i);
  assert.match(result.stdout, /action: bugs-latest-run/i);
  assert.match(result.stdout, /Lucy QA bug reports from run/i);
  assert.match(result.stdout, /Defect signature:/i);

  console.log('qa agent freeform bugs smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
