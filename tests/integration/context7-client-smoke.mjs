import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-context7-'));

try {
  const fixturePath = path.join(tempRoot, 'context7-fixture.json');
  fs.writeFileSync(fixturePath, JSON.stringify({
    results: [
      {
        title: 'Playwright locator.filter docs',
        url: 'https://playwright.dev/docs/locators#locator-filter',
        source: 'playwright',
        excerpt: 'Use locator.filter() to narrow matching locators by text or descendant selectors.'
      },
      {
        title: 'Playwright locator assertions',
        url: 'https://playwright.dev/docs/test-assertions',
        source: 'playwright',
        excerpt: 'Locator assertions automatically retry until the expected condition becomes true.'
      }
    ]
  }, null, 2));

  process.env.LUCY_QA_CONTEXT7_FIXTURE = fixturePath;
  const { fetchContext7Docs } = await import('../../packages/context7-client/src/index.mjs');
  const result = await fetchContext7Docs('playwright locator.filter');

  assert.equal(result.implemented, true);
  assert.equal(result.query, 'playwright locator.filter');
  assert.equal(result.results.length, 2);
  assert.match(result.results[0].title, /locator\.filter/i);
  assert.match(result.results[0].excerpt, /narrow matching locators/i);

  console.log('context7 client smoke ok');
} finally {
  delete process.env.LUCY_QA_CONTEXT7_FIXTURE;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
