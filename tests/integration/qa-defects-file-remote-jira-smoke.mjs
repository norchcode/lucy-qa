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

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-defects-remote-'));
const vaultPath = path.join(tempRoot, 'vault');
const knowledgeDir = path.join(vaultPath, 'qa-knowledge');
fs.mkdirSync(knowledgeDir, { recursive: true });

const requests = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    requests.push({ method: req.method, url: req.url, headers: req.headers, body });
    if (req.method === 'POST' && req.url === '/rest/api/2/issue') {
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: '10001', key: 'QA-123', self: 'http://127.0.0.1/self/QA-123' }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const jiraBaseUrl = `http://127.0.0.1:${address.port}`;

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

  const result = await runNode([
    'apps/cli/src/index.mjs',
    'qa',
    'defects',
    'file-remote',
    'login|assertion|error-surface-missing|login',
    '--target-url',
    'https://example.test/login',
    '--vault',
    vaultPath,
    '--plain'
  ], {
    cwd: '/root/lucy-qa',
    encoding: 'utf8',
    env: {
      ...process.env,
      LUCY_QA_JIRA_BASE_URL: jiraBaseUrl,
      LUCY_QA_JIRA_EMAIL: 'qa@example.test',
      LUCY_QA_JIRA_API_TOKEN: 'secret-token'
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /tracker_system: jira/i);
  assert.match(result.stdout, /issue_project: QA/i);
  assert.match(result.stdout, /linked_bug_id: QA-123/i);
  assert.match(result.stdout, new RegExp(`tracker_url: ${jiraBaseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/browse/QA-123`, 'i'));

  assert.equal(requests.length, 1);
  const payload = JSON.parse(requests[0].body);
  assert.equal(payload.fields.project.key, 'QA');
  assert.equal(payload.fields.issuetype.name, 'Bug');
  assert.equal(payload.fields.summary, 'Login error surface missing on https://example.test/login');
  assert.match(payload.fields.description, /Lucy QA bug report/i);
  assert.match(payload.fields.description, /QA\/test management: Qase/i);
  assert.match(payload.fields.description, /QA\/test management project\/code: WEB/i);

  const knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));
  assert.equal(knowledge.defect_signatures[0].linked_bug_id, 'QA-123');
  assert.equal(knowledge.defect_signatures[0].tracker_system, 'jira');

  console.log('qa defects file-remote jira smoke ok');
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
