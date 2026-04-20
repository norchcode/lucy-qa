import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-bugs-run-'));

try {
  const runDir = path.join(tempRoot, 'artifacts', 'playwright', 'runs', 'demo-run');
  fs.mkdirSync(runDir, { recursive: true });
  const screenshotPathA = path.join(runDir, 'test-results', 'TC-002 invalid password shows error-failed-1.png');
  const screenshotPathB = path.join(runDir, 'test-results', 'TC-003 locked account shows error-failed-1.png');
  fs.mkdirSync(path.dirname(screenshotPathA), { recursive: true });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l9n8AAAAASUVORK5CYII=', 'base64');
  fs.writeFileSync(screenshotPathA, png);
  fs.writeFileSync(screenshotPathB, png);
  fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify({
    stats: { expected: 3, unexpected: 2, skipped: 0, flaky: 0, duration: 1234 },
    suites: [{
      title: 'Login suite',
      specs: [
        { title: 'TC-001 valid login works', tests: [{ projectName: 'chromium', results: [{ status: 'passed', duration: 450, attachments: [] }] }] },
        { title: 'TC-002 invalid password shows error', tests: [{ projectName: 'chromium', results: [{ status: 'failed', duration: 784, error: { message: 'expected error banner' }, attachments: [{ name: 'screenshot', path: screenshotPathA, contentType: 'image/png' }] }] }] },
        { title: 'TC-003 locked account shows error', tests: [{ projectName: 'chromium', results: [{ status: 'failed', duration: 600, error: { message: 'expected locked account banner' }, attachments: [{ name: 'screenshot', path: screenshotPathB, contentType: 'image/png' }] }] }] }
      ]
    }]
  }, null, 2));
  fs.writeFileSync(path.join(runDir, 'qa-intake.json'), JSON.stringify({
    target_url: 'https://example.test/login',
    dom: {
      selector_strategy: 'data-testid and role-first',
      risks: ['OTP fallback can change the login flow.']
    },
    probe: {
      interactions: ['dropdown/menu']
    },
    crawl: {
      discovered_routes: ['https://example.test/login', 'https://example.test/dashboard']
    },
    knowledge: {
      project_key: 'demo-example-test'
    },
    execution_profile: {
      mode: 'serial-risk-aware',
      rationale: 'Risk-aware serial execution for login instability.'
    }
  }, null, 2));
  fs.writeFileSync(path.join(runDir, 'qa-docs-context.json'), JSON.stringify([
    { query: 'Playwright login OTP patterns' }
  ], null, 2));
  fs.writeFileSync(path.join(runDir, 'qa-knowledge.json'), JSON.stringify({
    project_key: 'demo-example-test',
    knowledge: {
      known_risks: ['OTP fallback can change the login flow.'],
      defect_signatures: [
        {
          signature: 'login|assertion|error-surface-missing|login',
          summary: 'login error surface missing on https://example.test/login',
          feature_area: 'login',
          failure_type: 'assertion',
          symptom_key: 'error-surface-missing',
          route: 'https://example.test/login',
          count: 3,
          last_seen: '2026-04-05T00:00:00.000Z',
          related_cases: ['Old login case'],
          linked_bug_id: 'BUG-42',
          tracker_system: 'jira',
          tracker_url: 'https://jira.example.test/browse/BUG-42',
          tracker_status: 'Open'
        }
      ],
      failure_patterns: [
        {
          key: 'tc-002-invalid-password-shows-error-expected-error-banner',
          title: 'TC-002 invalid password shows error',
          error_sample: 'expected error banner',
          failure_type: 'assertion',
          count: 3,
          last_seen: '2026-04-05T00:00:00.000Z',
          statuses: ['failed']
        }
      ]
    }
  }, null, 2));

  const visionFixturePath = path.join(tempRoot, 'vision-fixture.json');
  fs.writeFileSync(visionFixturePath, JSON.stringify({
    default: {
      description: 'Vision suggests the error banner region.',
      boxes: [{ x: 0, y: 0, width: 1, height: 1, label: 'Suggested banner area' }]
    }
  }, null, 2));

  const result = spawnSync(process.execPath, ['apps/cli/src/index.mjs', 'qa', 'bugs', '--from-run', runDir, '--plain'], {
    cwd: '/root/lucy-qa',
    encoding: 'utf8',
    env: {
      ...process.env,
      LUCY_QA_VISION_SUGGESTION_FIXTURE: visionFixturePath
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Lucy QA bug reports from run/i);
  assert.match(result.stdout, /total_defect_candidates: 1/i);
  assert.match(result.stdout, /Defect signature: login\|assertion\|error-surface-missing\|login/i);
  assert.match(result.stdout, /Cases: TC-002 invalid password shows error, TC-003 locked account shows error/i);
  assert.match(result.stdout, /Defect disposition: append-to-existing-bug/i);
  assert.match(result.stdout, /Linked bug ID: BUG-42/i);
  assert.match(result.stdout, /Tracker system: jira/i);
  assert.match(result.stdout, /Tracker URL: https:\/\/jira.example.test\/browse\/BUG-42/i);
  assert.match(result.stdout, /Execution profile: serial-risk-aware/i);
  assert.match(result.stdout, /Selector strategy observed during intake: data-testid and role-first/i);
  assert.match(result.stdout, /Failure intelligence/i);
  assert.match(result.stdout, /Annotation sources: vision-fixture, vision-fixture/i);
  assert.match(result.stdout, /Expected vs Actual/i);
  assert.doesNotMatch(result.stdout, /TC-001 valid login works/);

  console.log('qa bugs from run cli smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
