import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-run-knowledge-'));
const vaultPath = path.join(tempRoot, 'vault');
const fixturePath = path.join(tempRoot, 'cloudflare-crawl.json');

try {
  fs.writeFileSync(fixturePath, JSON.stringify({
    result: {
      id: 'crawl-run-1',
      status: 'completed',
      pages: [
        { url: 'https://example.test/login', markdown: '# Login' },
        { url: 'https://example.test/dashboard', markdown: '# Dashboard table' }
      ]
    }
  }, null, 2));

  const fakeRunnerPath = path.join(tempRoot, 'fake-runner.mjs');
  fs.writeFileSync(fakeRunnerPath, `
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const configPath = args[args.indexOf('--config') + 1];
const configDir = path.dirname(configPath);
const resultsDir = path.join(configDir, 'test-results', 'videos');
fs.mkdirSync(resultsDir, { recursive: true });
fs.writeFileSync(path.join(resultsDir, 'demo.webm'), 'video');
process.stdout.write(JSON.stringify({
  stats: { expected: 1, unexpected: 0, skipped: 0, flaky: 0, duration: 123 },
  suites: [{ title: 'Demo suite', specs: [{ title: 'TC-001 works', tests: [{ projectName: 'chromium', results: [{ status: 'passed', duration: 123, attachments: [{ name: 'video', path: path.join(resultsDir, 'demo.webm') }] }] }] }] }]
}));
`);

  process.env.LUCY_QA_VAULT_PATH = vaultPath;
  process.env.LUCY_QA_CLOUDFLARE_CRAWL_FIXTURE = fixturePath;
  process.env.LUCY_QA_RUNNER_COMMAND = process.execPath;
  process.env.LUCY_QA_RUNNER_ARGS_JSON = JSON.stringify([fakeRunnerPath]);

  const { runQaRunCommand } = await import('../../apps/cli/src/qa-run.mjs');
  const result = await runQaRunCommand({
    target: 'tests/e2e/demo.spec.js',
    baseURL: 'https://example.test',
    artifactsRoot: path.join(tempRoot, 'artifacts')
  });

  assert.equal(result.status, 'passed');
  assert.ok(fs.existsSync(result.knowledge_path), 'knowledge json should be saved');
  assert.ok(fs.existsSync(result.knowledge_markdown_path), 'knowledge markdown should be saved');
  assert.equal(result.knowledge_summary.project_key.includes('example-test'), true);
  const knowledgeJson = JSON.parse(fs.readFileSync(result.knowledge_path, 'utf8'));
  assert.ok(Array.isArray(knowledgeJson.defect_signatures), 'defect signatures should be saved');

  console.log('qa run knowledge smoke ok');
} finally {
  delete process.env.LUCY_QA_VAULT_PATH;
  delete process.env.LUCY_QA_CLOUDFLARE_CRAWL_FIXTURE;
  delete process.env.LUCY_QA_RUNNER_COMMAND;
  delete process.env.LUCY_QA_RUNNER_ARGS_JSON;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
