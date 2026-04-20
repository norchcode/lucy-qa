import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-context7-retry-'));

try {
  const counterPath = path.join(tempRoot, 'attempt-count.txt');
  process.env.LUCY_QA_CONTEXT7_FORCE_FAIL = '1';
  process.env.LUCY_QA_CONTEXT7_ATTEMPT_COUNTER = counterPath;
  process.env.LUCY_QA_CONTEXT7_FALLBACK_FIXTURE = JSON.stringify([
    {
      title: 'Fallback Playwright locator docs',
      url: 'https://playwright.dev/docs/locators',
      source: 'playwright',
      excerpt: 'Fallback docs result after repeated Context7 failure.'
    }
  ]);

  const { fetchContext7Docs } = await import('../../packages/context7-client/src/index.mjs');
  const result = await fetchContext7Docs('playwright locator.filter');

  assert.equal(result.engine, 'context7-web-fallback');
  assert.equal(result.context7_attempts, 3);
  assert.equal(result.context7_failed, true);
  assert.ok(fs.existsSync(counterPath), 'attempt counter should be written');
  assert.equal(Number(fs.readFileSync(counterPath, 'utf8').trim()), 3);
  assert.equal(result.results.length, 1);
  assert.match(result.results[0].title, /Fallback Playwright locator docs/i);

  console.log('context7 retry fallback smoke ok');
} finally {
  delete process.env.LUCY_QA_CONTEXT7_FORCE_FAIL;
  delete process.env.LUCY_QA_CONTEXT7_ATTEMPT_COUNTER;
  delete process.env.LUCY_QA_CONTEXT7_FALLBACK_FIXTURE;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
