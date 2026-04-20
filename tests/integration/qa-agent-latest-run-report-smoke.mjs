import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-agent-report-'));
const vaultPath = path.join(tempRoot, 'vault');
const stateDir = path.join(vaultPath, 'state');
fs.mkdirSync(stateDir, { recursive: true });

try {
  const runDir = path.join(tempRoot, 'artifacts', 'playwright', 'runs', 'demo-run');
  fs.mkdirSync(path.join(runDir, 'test-results'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify({
    stats: { expected: 2, unexpected: 1, skipped: 0, flaky: 0, duration: 900 },
    suites: [{
      title: 'Login suite',
      specs: [
        { title: 'TC-001 valid login works', tests: [{ projectName: 'chromium', results: [{ status: 'passed', duration: 200, attachments: [] }] }] },
        { title: 'TC-002 invalid password shows error', tests: [{ projectName: 'chromium', results: [{ status: 'failed', duration: 700, error: { message: 'expected error banner' }, attachments: [] }] }] }
      ]
    }]
  }, null, 2));
  fs.writeFileSync(path.join(runDir, 'qa-intake.json'), JSON.stringify({
    target_url: 'https://example.test/login',
    execution_profile: { mode: 'serial-risk-aware', rationale: 'risk aware' },
    dom: { selector_strategy: 'data-testid and role-first', risks: [] },
    probe: { interactions: [] },
    crawl: { discovered_routes: ['https://example.test/login'] },
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
    'qa',
    'agent',
    'review latest run',
    '--vault',
    vaultPath,
    '--plain'
  ], { cwd: '/root/lucy-qa', encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Lucy QA autonomous agent/i);
  assert.match(result.stdout, /action: report-latest-run/i);
  assert.match(result.stdout, /QA report generated/i);
  assert.match(result.stdout, /run_dir:/i);
  assert.match(result.stdout, /failed: 1/i);

  console.log('qa agent latest run report smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
