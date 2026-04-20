import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-report-cli-'));

try {
  const runDir = path.join(tempRoot, 'artifacts', 'playwright', 'runs', 'demo-run');
  fs.mkdirSync(runDir, { recursive: true });
  const screenshotPath = path.join(runDir, 'test-results', 'TC-002 invalid password shows error-failed-1.png');
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  fs.writeFileSync(screenshotPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l9n8AAAAASUVORK5CYII=', 'base64'));
  fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify({
    stats: { expected: 2, unexpected: 1, skipped: 0, flaky: 0, duration: 1234 },
    suites: [{
      title: 'Login suite',
      specs: [
        { title: 'TC-001 valid login works', tests: [{ projectName: 'chromium', results: [{ status: 'passed', duration: 450, attachments: [] }] }] },
        { title: 'TC-002 invalid password shows error', tests: [{ projectName: 'chromium', results: [{ status: 'failed', duration: 784, error: { message: 'expected error banner' }, attachments: [{ name: 'screenshot', path: screenshotPath, contentType: 'image/png' }] }] }] }
      ]
    }]
  }, null, 2));
  fs.writeFileSync(path.join(runDir, 'report.stdout.txt'), 'runner stdout');
  fs.writeFileSync(path.join(runDir, 'report.stderr.txt'), 'runner stderr');
  fs.writeFileSync(path.join(runDir, 'qa-intake.json'), JSON.stringify({
    target_url: 'https://example.test/login',
    runtime: { target_url: 'https://example.test/login' },
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
  fs.writeFileSync(path.join(runDir, 'qa-knowledge.json'), JSON.stringify({
    project_key: 'demo-example-test',
    knowledge: {
      known_risks: ['OTP fallback can change the login flow.'],
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
      ],
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
      ]
    }
  }, null, 2));

  const visionFixturePath = path.join(tempRoot, 'vision-fixture.json');
  fs.writeFileSync(visionFixturePath, JSON.stringify({
    default: {
      description: 'Vision suggests the banner area near the top of the form.',
      boxes: [{ x: 0, y: 0, width: 1, height: 1, label: 'Suggested banner area' }]
    }
  }, null, 2));

  const result = spawnSync(process.execPath, ['apps/cli/src/index.mjs', 'qa', 'report', runDir, '--plain'], {
    cwd: '/root/lucy-qa',
    encoding: 'utf8',
    env: {
      ...process.env,
      LUCY_QA_VISION_SUGGESTION_FIXTURE: visionFixturePath
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /QA report generated/i);
  assert.match(result.stdout, /execution_profile: serial-risk-aware/i);
  assert.match(result.stdout, /knowledge_project_key: demo-example-test/i);
  assert.match(result.stdout, /recurring_failures: 1/i);
  assert.match(result.stdout, /defect_candidates: 1/i);
  assert.match(result.stdout, /linked_defect_candidates: 1/i);
  assert.match(result.stdout, /annotated_screenshots: 1/i);
  assert.match(result.stdout, /total: 2/i);
  assert.match(result.stdout, /failed: 1/i);
  assert.match(result.stdout, /TC-002 invalid password shows error/i);
  assert.equal(fs.readdirSync(path.join(runDir, 'annotated-screenshots')).some((item) => item.endsWith('.annotated.svg')), true);

  console.log('qa report cli smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
