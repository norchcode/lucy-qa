import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-defects-link-'));
const vaultPath = path.join(tempRoot, 'vault');
const knowledgeDir = path.join(vaultPath, 'qa-knowledge');
fs.mkdirSync(knowledgeDir, { recursive: true });

try {
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

  const listBefore = spawnSync(process.execPath, ['apps/cli/src/index.mjs', 'qa', 'defects', 'list', '--target-url', 'https://example.test/login', '--vault', vaultPath, '--plain'], {
    cwd: '/root/lucy-qa',
    encoding: 'utf8'
  });
  assert.equal(listBefore.status, 0, listBefore.stderr || listBefore.stdout);
  assert.match(listBefore.stdout, /login\|assertion\|error-surface-missing\|login :: bug=none/i);

  const link = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs', 'qa', 'defects', 'link', 'login|assertion|error-surface-missing|login',
    '--bug-id', 'BUG-42',
    '--tracker', 'jira',
    '--tracker-url', 'https://jira.example.test/browse/BUG-42',
    '--tracker-title', 'Login banner missing',
    '--tracker-status', 'Open',
    '--status', 'open',
    '--target-url', 'https://example.test/login',
    '--vault', vaultPath,
    '--plain'
  ], {
    cwd: '/root/lucy-qa',
    encoding: 'utf8'
  });
  assert.equal(link.status, 0, link.stderr || link.stdout);
  assert.match(link.stdout, /linked_bug_id: BUG-42/i);
  assert.match(link.stdout, /tracker_system: jira/i);

  const update = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs', 'qa', 'defects', 'update', 'login|assertion|error-surface-missing|login',
    '--tracker-status', 'In Progress',
    '--status', 'open',
    '--target-url', 'https://example.test/login',
    '--vault', vaultPath,
    '--plain'
  ], {
    cwd: '/root/lucy-qa',
    encoding: 'utf8'
  });
  assert.equal(update.status, 0, update.stderr || update.stdout);
  assert.match(update.stdout, /tracker_status: In Progress/i);

  const listAfter = spawnSync(process.execPath, ['apps/cli/src/index.mjs', 'qa', 'defects', 'list', '--target-url', 'https://example.test/login', '--vault', vaultPath, '--plain'], {
    cwd: '/root/lucy-qa',
    encoding: 'utf8'
  });
  assert.equal(listAfter.status, 0, listAfter.stderr || listAfter.stdout);
  assert.match(listAfter.stdout, /bug=BUG-42/i);
  assert.match(listAfter.stdout, /tracker_status=In Progress/i);

  console.log('qa defects linkage cli smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
