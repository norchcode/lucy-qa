import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const runNode = (args, options = {}) => new Promise((resolve) => {
  const child = spawn(process.execPath, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.on('close', (code) => resolve({ status: code, stdout, stderr }));
});

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-qase-publish-'));
const requests = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    requests.push({ method: req.method, url: req.url, headers: req.headers, body });
    if (req.method === 'POST' && req.url === '/v1/run/WEB') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: true, result: { id: 77 } }));
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/run/WEB/77/complete') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: true, result: { success: true } }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const qaseBaseUrl = `http://127.0.0.1:${address.port}/v1`;

try {
  const vaultPath = path.join(tempRoot, 'vault');
  const onboarding = await runNode([
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
    '--vault',
    vaultPath,
    '--plain'
  ], { cwd: '/root/lucy-qa', encoding: 'utf8' });
  assert.equal(onboarding.status, 0, onboarding.stderr || onboarding.stdout);

  const runDir = path.join(tempRoot, 'artifacts', 'playwright', 'runs', 'demo-run');
  const screenshotPath = path.join(runDir, 'test-results', 'TC-002 invalid password shows error-failed-1.png');
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  fs.writeFileSync(screenshotPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l9n8AAAAASUVORK5CYII=', 'base64'));
  fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify({
    stats: { expected: 2, unexpected: 1, skipped: 0, flaky: 0, duration: 900 },
    suites: [{
      title: 'Login suite',
      specs: [
        { title: 'TC-001 valid login works', tests: [{ projectName: 'chromium', results: [{ status: 'passed', duration: 200, attachments: [] }] }] },
        { title: 'TC-002 invalid password shows error', tests: [{ projectName: 'chromium', results: [{ status: 'failed', duration: 700, error: { message: 'expected error banner' }, attachments: [{ name: 'screenshot', path: screenshotPath, contentType: 'image/png' }] }] }] }
      ]
    }]
  }, null, 2));
  fs.writeFileSync(path.join(runDir, 'qa-intake.json'), JSON.stringify({
    target_url: 'https://example.test/login',
    execution_profile: { mode: 'serial-risk-aware', rationale: 'risk aware' },
    dom: { selector_strategy: 'data-testid and role-first', risks: ['OTP can alter login flow'] },
    probe: { interactions: [] },
    crawl: { discovered_routes: ['https://example.test/login'] },
    knowledge: { project_key: 'lucy-qa-example-test' }
  }, null, 2));

  const result = await runNode([
    'apps/cli/src/index.mjs',
    'qa',
    'report',
    'publish',
    runDir,
    '--close-run',
    '--vault',
    vaultPath,
    '--plain'
  ], {
    cwd: '/root/lucy-qa',
    encoding: 'utf8',
    env: {
      ...process.env,
      LUCY_QA_QASE_API_TOKEN: 'qase-secret',
      LUCY_QA_QASE_BASE_URL: qaseBaseUrl
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /system: qase/i);
  assert.match(result.stdout, /project_code: WEB/i);
  assert.match(result.stdout, /remote_run_id: 77/i);
  assert.match(result.stdout, /completed: yes/i);

  assert.equal(requests.length, 2);
  const createPayload = JSON.parse(requests[0].body);
  assert.match(createPayload.title, /Lucy QA Playwright run - demo-run/i);
  assert.match(createPayload.description, /Lucy QA Playwright run summary/i);
  assert.match(createPayload.description, /Failed: 1/i);
  assert.match(createPayload.description, /TC-002 invalid password shows error/i);
  assert.equal(requests[1].url, '/v1/run/WEB/77/complete');

  console.log('qa report publish qase smoke ok');
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
