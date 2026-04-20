import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const runNode = (args, options = {}) => new Promise((resolve) => {
  const child = spawn(process.execPath, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('close', (code) => resolve({ status: code, stdout, stderr }));
});

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-learning-'));
const vaultPath = path.join(tempRoot, 'vault');
const stateDir = path.join(vaultPath, 'state');
fs.mkdirSync(stateDir, { recursive: true });

try {
  const runDir = path.join(tempRoot, 'artifacts', 'playwright', 'runs', 'demo-run');
  fs.mkdirSync(path.join(runDir, 'test-results'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify({
    stats: { expected: 1, unexpected: 1, skipped: 0, flaky: 0, duration: 500 },
    suites: [{ title: 'Login suite', specs: [{ title: 'TC-002 invalid password shows error', tests: [{ projectName: 'chromium', results: [{ status: 'failed', duration: 300, error: { message: 'expected error banner' }, attachments: [] }] }] }] }]
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

  for (let i = 0; i < 5; i += 1) {
    const result = await runNode(['apps/cli/src/index.mjs', 'qa', 'agent', 'review latest run', '--vault', vaultPath, '--plain'], {
      cwd: '/root/lucy-qa', encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }

  const learning = await runNode(['apps/cli/src/index.mjs', 'qa', 'learning', '--vault', vaultPath, '--plain'], {
    cwd: '/root/lucy-qa', encoding: 'utf8'
  });
  assert.equal(learning.status, 0, learning.stderr || learning.stdout);
  assert.match(learning.stdout, /event_count: 5/i);
  assert.match(learning.stdout, /evaluations_count: 1/i);
  assert.match(learning.stdout, /nudges_issued: 1/i);
  assert.match(learning.stdout, /memory:/i);
  assert.match(learning.stdout, /skill: review-latest-run/i);

  const learningPath = path.join(vaultPath, 'qa-learning', 'self-improvement.json');
  const saved = JSON.parse(fs.readFileSync(learningPath, 'utf8'));
  assert.equal(saved.event_count, 5);
  assert.equal(saved.evaluations_count, 1);
  assert.ok(saved.skills.some((item) => item.key === 'review-latest-run' && item.occurrence_count === 5));
  assert.ok(saved.memory_notes.length >= 1);

  console.log('qa self-improvement loop smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
