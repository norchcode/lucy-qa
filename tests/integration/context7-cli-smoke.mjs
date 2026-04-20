import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-context7-cli-'));

try {
  const fixturePath = path.join(tempRoot, 'context7-fixture.json');
  fs.writeFileSync(fixturePath, JSON.stringify({
    results: [
      {
        title: 'Playwright locator.filter docs',
        url: 'https://playwright.dev/docs/locators#locator-filter',
        source: 'playwright',
        excerpt: 'Use locator.filter() to narrow matching locators by text or descendant selectors.'
      }
    ]
  }, null, 2));

  const result = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'docs',
    'playwright locator.filter',
    '--plain'
  ], {
    cwd: '/root/lucy-qa',
    env: { ...process.env, LUCY_QA_CONTEXT7_FIXTURE: fixturePath },
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Context7 docs results/i);
  assert.match(result.stdout, /Playwright locator\.filter docs/i);
  assert.match(result.stdout, /playwright\.dev\/docs\/locators#locator-filter/i);

  console.log('context7 cli smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
