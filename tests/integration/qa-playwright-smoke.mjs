import assert from 'node:assert/strict';

const { generatePlaywrightSpec } = await import('../../packages/qa-playwright/src/index.mjs');

const result = generatePlaywrightSpec('Create Playwright coverage for login page validation.');

assert.equal(result.implemented, true, 'Playwright generation should be implemented');
assert.equal(result.task_type, 'qa');
assert.match(result.prompt, /Playwright/i, 'Prompt should mention Playwright');
assert.match(result.prompt, /test\.describe/, 'Prompt should ask for Playwright test code');
assert.match(result.prompt, /locator|selector/i, 'Prompt should request locator strategy guidance');

console.log('qa playwright smoke ok');
