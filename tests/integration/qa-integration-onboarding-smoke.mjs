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
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('close', (code) => resolve({ status: code, stdout, stderr }));
});

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-integrations-'));
const vaultPath = path.join(tempRoot, 'vault');
const knowledgeDir = path.join(vaultPath, 'qa-knowledge');
fs.mkdirSync(knowledgeDir, { recursive: true });

const requests = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    requests.push({ method: req.method, url: req.url, headers: req.headers, body });

    if (req.method === 'GET' && req.url === '/rest/api/2/myself') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ displayName: 'QA User', emailAddress: 'qa@example.test' }));
      return;
    }
    if (req.method === 'POST' && req.url === '/rest/api/2/issue') {
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: '10001', key: 'QA-321' }));
      return;
    }
    if (req.method === 'GET' && req.url.startsWith('/v1/project?')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: true, result: { entities: [{ code: 'WEB' }] } }));
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/run/WEB') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: true, result: { id: 88 } }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const jiraBaseUrl = `http://127.0.0.1:${port}`;
const qaseBaseUrl = `http://127.0.0.1:${port}/v1`;

try {
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
    '--jira-base-url',
    jiraBaseUrl,
    '--jira-email',
    'qa@example.test',
    '--jira-api-token',
    'jira-secret-token',
    '--qase-base-url',
    qaseBaseUrl,
    '--qase-api-token',
    'qase-secret-token',
    '--test-connections',
    '--vault',
    vaultPath,
    '--plain'
  ], { cwd: '/root/lucy-qa', encoding: 'utf8' });

  assert.equal(onboarding.status, 0, onboarding.stderr || onboarding.stdout);
  assert.match(onboarding.stdout, /jira_ready: yes/i);
  assert.match(onboarding.stdout, /qase_ready: yes/i);
  assert.match(onboarding.stdout, /connection_test: jira:success/i);
  assert.match(onboarding.stdout, /connection_test: qase:success/i);
  assert.doesNotMatch(onboarding.stdout, /jira-secret-token/);
  assert.doesNotMatch(onboarding.stdout, /qase-secret-token/);

  const credentialsPath = path.join(vaultPath, 'qa-config', 'credentials.json');
  const credentialsStat = fs.statSync(credentialsPath);
  assert.equal(credentialsStat.mode & 0o777, 0o600);

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
    defect_signatures: [{
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
    }],
    notes: []
  }, null, 2));

  const runDir = path.join(tempRoot, 'artifacts', 'playwright', 'runs', 'demo-run');
  const screenshotPath = path.join(runDir, 'test-results', 'TC-002 invalid password shows error-failed-1.png');
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
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

  const publish = await runNode([
    'apps/cli/src/index.mjs', 'qa', 'report', 'publish', runDir,
    '--vault', vaultPath,
    '--plain'
  ], { cwd: '/root/lucy-qa', encoding: 'utf8' });
  assert.equal(publish.status, 0, publish.stderr || publish.stdout);
  assert.match(publish.stdout, /system: qase/i);
  assert.match(publish.stdout, /remote_run_id: 88/i);

  const fileRemote = await runNode([
    'apps/cli/src/index.mjs', 'qa', 'defects', 'file-remote', 'login|assertion|error-surface-missing|login',
    '--target-url', 'https://example.test/login',
    '--vault', vaultPath,
    '--plain'
  ], { cwd: '/root/lucy-qa', encoding: 'utf8' });
  assert.equal(fileRemote.status, 0, fileRemote.stderr || fileRemote.stdout);
  assert.match(fileRemote.stdout, /linked_bug_id: QA-321/i);

  assert.ok(requests.some((item) => item.url === '/rest/api/2/myself'));
  assert.ok(requests.some((item) => item.url.startsWith('/v1/project?')));
  assert.ok(requests.some((item) => item.url === '/v1/run/WEB'));
  assert.ok(requests.some((item) => item.url === '/rest/api/2/issue'));

  console.log('qa integration onboarding smoke ok');
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
