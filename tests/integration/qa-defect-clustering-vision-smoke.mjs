import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateQaRunReport } from '../../packages/qa-playwright/src/index.mjs';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-defect-cluster-'));

try {
  const runDir = path.join(tempRoot, 'artifacts', 'playwright', 'runs', 'demo-run');
  fs.mkdirSync(path.join(runDir, 'test-results'), { recursive: true });
  const screenshotA = path.join(runDir, 'test-results', 'TC-002 invalid password shows error-failed-1.png');
  const screenshotB = path.join(runDir, 'test-results', 'TC-003 locked account shows error-failed-1.png');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l9n8AAAAASUVORK5CYII=', 'base64');
  fs.writeFileSync(screenshotA, png);
  fs.writeFileSync(screenshotB, png);

  fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify({
    stats: { expected: 3, unexpected: 2, skipped: 0, flaky: 0, duration: 1200 },
    suites: [{
      title: 'Login suite',
      specs: [
        { title: 'TC-001 valid login works', tests: [{ projectName: 'chromium', results: [{ status: 'passed', duration: 100, attachments: [] }] }] },
        { title: 'TC-002 invalid password shows error', tests: [{ projectName: 'chromium', results: [{ status: 'failed', duration: 200, error: { message: 'expected error banner' }, attachments: [{ name: 'screenshot', path: screenshotA, contentType: 'image/png' }] }] }] },
        { title: 'TC-003 locked account shows error', tests: [{ projectName: 'chromium', results: [{ status: 'failed', duration: 200, error: { message: 'expected locked account banner' }, attachments: [{ name: 'screenshot', path: screenshotB, contentType: 'image/png' }] }] }] }
      ]
    }]
  }, null, 2));

  fs.writeFileSync(path.join(runDir, 'qa-intake.json'), JSON.stringify({
    target_url: 'https://example.test/login',
    runtime: { target_url: 'https://example.test/login' },
    execution_profile: { mode: 'serial-risk-aware', rationale: 'Auth risk flow' },
    dom: { selector_strategy: 'data-testid and role-first', risks: ['OTP fallback can change the login flow.'] },
    probe: { interactions: ['dropdown/menu'] },
    crawl: { discovered_routes: ['https://example.test/login'] },
    knowledge: { project_key: 'demo-example-test' }
  }, null, 2));

  fs.writeFileSync(path.join(runDir, 'qa-knowledge.json'), JSON.stringify({
    project_key: 'demo-example-test',
    knowledge: {
      defect_signatures: [
        {
          signature: 'login|assertion|error-surface-missing|login',
          summary: 'login error surface missing on login',
          feature_area: 'login',
          failure_type: 'assertion',
          symptom_key: 'error-surface-missing',
          route: 'https://example.test/login',
          count: 4,
          last_seen: '2026-04-05T00:00:00.000Z',
          related_cases: ['Old login case']
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
  process.env.LUCY_QA_VISION_SUGGESTION_FIXTURE = visionFixturePath;

  const report = generateQaRunReport({ runDir });

  assert.equal(report.defect_clusters.defect_candidates.length, 1);
  assert.equal(report.defect_clusters.defect_candidates[0].case_count, 2);
  assert.equal(report.defect_clusters.defect_candidates[0].recurring, true);
  assert.equal(report.annotated_screenshots.length, 2);
  assert.equal(report.annotated_screenshots.every((item) => item.suggestion_source === 'vision-fixture'), true);

  console.log('qa defect clustering vision smoke ok');
} finally {
  delete process.env.LUCY_QA_VISION_SUGGESTION_FIXTURE;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
