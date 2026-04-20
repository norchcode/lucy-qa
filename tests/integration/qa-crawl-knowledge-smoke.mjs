import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-crawl-knowledge-'));
const vaultPath = path.join(tempRoot, 'vault');
const fixturePath = path.join(tempRoot, 'cloudflare-crawl.json');

fs.writeFileSync(fixturePath, JSON.stringify({
  result: {
    id: 'crawl-demo-1',
    status: 'completed',
    pages: [
      { url: 'https://app.example.com/login', markdown: '# Login\nSign in to continue' },
      { url: 'https://app.example.com/dashboard', markdown: '# Dashboard\nA table with recent activity' },
      { url: 'https://app.example.com/settings', markdown: '# Settings\nProfile and preferences' }
    ]
  }
}, null, 2));

process.env.LUCY_QA_CLOUDFLARE_CRAWL_FIXTURE = fixturePath;
process.env.LUCY_QA_VAULT_PATH = vaultPath;

const { saveQaKnowledgeFromRun } = await import('../../packages/qa-knowledge/src/index.mjs');
const { buildQaIntakeContext } = await import('../../apps/cli/src/qa-intake.mjs');

try {
  await saveQaKnowledgeFromRun({
    result: {
      status: 'failed',
      failure_summary: ['Login page chromium - failed - expected OTP prompt'],
      execution_profile: {
        rationale: 'Prior project knowledge showed iframe and OTP-related risk.'
      }
    },
    intake: {
      target_url: 'https://app.example.com',
      stack: {
        frontend: ['Next.js'],
        backend: [],
        test_frameworks: ['Playwright'],
        deployment: ['Cloudflare']
      },
      runtime: { framework_hints: ['Next.js'], deployment_hints: ['Cloudflare'] },
      browser: { framework_hints: ['Next.js'] },
      dom: {
        selector_strategy: 'data-testid and role-first',
        risks: ['OTP fallback can change the login flow.'],
        interactions: ['modal/dialog']
      },
      probe: {
        interactions: ['dropdown/menu'],
        observed_routes: ['https://app.example.com/login', 'https://app.example.com/dashboard']
      },
      docs_queries: ['Playwright login OTP patterns'],
      knowledge: { summary: 'Seed knowledge entry' }
    },
    docsContext: [{ query: 'Playwright login OTP patterns' }],
    cwd: tempRoot,
    targetUrl: 'https://app.example.com',
    vaultPath
  });

  const { intake, docsContext } = await buildQaIntakeContext('Create E2E coverage for the application routes.', {
    cwd: tempRoot,
    targetUrl: 'https://app.example.com',
    vaultPath
  });

  assert.equal(intake.crawl.status, 'inferred');
  assert.equal(intake.crawl.page_count, 3);
  assert.ok(intake.crawl.discovered_routes.includes('https://app.example.com/dashboard'));
  assert.equal(intake.knowledge.status, 'inferred');
  assert.ok(intake.knowledge.learned_frameworks.includes('Next.js'));
  assert.ok(intake.dom.risks.some((item) => /OTP fallback/i.test(item)));
  assert.ok(intake.docs_queries.some((query) => /multi-page navigation|Playwright/i.test(query)));
  assert.ok(Array.isArray(docsContext));

  console.log('qa crawl knowledge smoke ok');
} finally {
  delete process.env.LUCY_QA_CLOUDFLARE_CRAWL_FIXTURE;
  delete process.env.LUCY_QA_VAULT_PATH;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
