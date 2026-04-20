import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-onboarding-defaults-'));
const vaultPath = path.join(tempRoot, 'vault');
const knowledgeDir = path.join(vaultPath, 'qa-knowledge');
fs.mkdirSync(knowledgeDir, { recursive: true });

try {
  const onboarding = spawnSync(process.execPath, [
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
    vaultPath,
    '--plain'
  ], { cwd: '/root/lucy-qa', encoding: 'utf8' });
  assert.equal(onboarding.status, 0, onboarding.stderr || onboarding.stdout);

  const knowledgePath = path.join(knowledgeDir, 'lucy-qa-example-test.json');
  fs.writeFileSync(knowledgePath, JSON.stringify({
    project_key: 'lucy-qa-example-test',
    created_at: '2026-04-05T00:00:00.000Z',
    updated_at: '2026-04-05T00:00:00.000Z',
    identifiers: { cwd: '/root/lucy-qa', hostnames: ['example.test'] },
    stats: { runs_total: 1, passed_runs: 0, failed_runs: 1 },
    learned_frameworks: [],
    deployment_hints: [],
    preferred_selector_strategies: [],
    known_risks: [],
    observed_routes: ['https://example.test/login'],
    proven_interactions: [],
    docs_queries: [],
    failure_patterns: [],
    defect_signatures: [
      {
        signature: 'login|assertion|error-surface-missing|login',
        summary: 'login error surface missing on https://example.test/login',
        feature_area: 'login',
        failure_type: 'assertion',
        symptom_key: 'error-surface-missing',
        route: 'https://example.test/login',
        count: 3,
        first_seen: '2026-04-05T00:00:00.000Z',
        last_seen: '2026-04-05T00:00:00.000Z',
        related_cases: ['TC-002 invalid password shows error'],
        related_projects: ['chromium'],
        related_routes: ['https://example.test/login'],
        linked_bug_id: null,
        status: 'open'
      }
    ],
    notes: []
  }, null, 2));

  const link = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs', 'qa', 'defects', 'link', 'login|assertion|error-surface-missing|login',
    '--bug-id', 'BUG-77',
    '--target-url', 'https://example.test/login',
    '--vault', vaultPath,
    '--plain'
  ], { cwd: '/root/lucy-qa', encoding: 'utf8' });

  assert.equal(link.status, 0, link.stderr || link.stdout);
  assert.match(link.stdout, /tracker_system: Jira/i);

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
  fs.writeFileSync(path.join(runDir, 'qa-knowledge.json'), fs.readFileSync(knowledgePath, 'utf8'));

  const bugs = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs', 'qa', 'bugs', '--from-run', runDir, '--plain'
  ], {
    cwd: '/root/lucy-qa',
    env: { ...process.env, LUCY_QA_VAULT_PATH: vaultPath },
    encoding: 'utf8'
  });

  assert.equal(bugs.status, 0, bugs.stderr || bugs.stdout);
  assert.match(bugs.stdout, /QA\/test management: Qase/i);
  assert.match(bugs.stdout, /QA\/test management project\/code: WEB/i);
  assert.match(bugs.stdout, /Tracker system: Jira/i);
  assert.match(bugs.stdout, /Issue project\/team: QA/i);
  assert.match(bugs.stdout, /Team bug workflow preference: Append evidence to linked bugs before opening new ones/i);

  console.log('qa onboarding defaults defects smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
