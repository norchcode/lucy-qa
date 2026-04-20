import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-context7-cli-retry-'));

try {
  const counterPath = path.join(tempRoot, 'attempt-count.txt');
  const result = spawnSync(process.execPath, [
    'apps/cli/src/index.mjs',
    'docs',
    'playwright locator.filter',
    '--plain'
  ], {
    cwd: '/root/lucy-qa',
    env: {
      ...process.env,
      LUCY_QA_CONTEXT7_FORCE_FAIL: '1',
      LUCY_QA_CONTEXT7_ATTEMPT_COUNTER: counterPath,
      LUCY_QA_CONTEXT7_FALLBACK_FIXTURE: JSON.stringify([
        {
          title: 'Fallback Playwright locator docs',
          url: 'https://playwright.dev/docs/locators',
          source: 'playwright',
          excerpt: 'Fallback docs result after repeated Context7 failure.'
        }
      ])
    },
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /engine: context7-web-fallback/i);
  assert.ok(fs.existsSync(counterPath), 'attempt counter should be written');
  assert.equal(Number(fs.readFileSync(counterPath, 'utf8').trim()), 3);

  console.log('context7 cli retry smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
