import assert from 'node:assert/strict';

const {
  generatePlaywrightSpec
} = await import('../../packages/qa-playwright/src/index.mjs');
const {
  buildQaIntake
} = await import('../../packages/qa-core/src/index.mjs');

const analysis = buildQaIntake('Generate an E2E Playwright starter for login modal validation and dashboard table filters with accessibility checks.');
const docsContext = [{
  query: 'Playwright modal dialog locator and assertion patterns',
  engine: 'context7-fixture',
  selected_library: '/microsoft/playwright',
  results: [{
    title: 'Locators',
    url: 'https://playwright.dev/docs/locators',
    excerpt: 'Prefer getByRole, getByLabel, and other user-facing locators.'
  }]
}];

const result = generatePlaywrightSpec('Generate an E2E Playwright starter for login modal validation and dashboard table filters with accessibility checks.', {
  analysis,
  docsContext
});

assert.equal(result.implemented, true);
assert.match(result.prompt, /Structured intake analysis:/i);
assert.match(result.prompt, /Primary testing mode: e2e/i);
assert.match(result.prompt, /Intent status: confirmed/i);
assert.match(result.prompt, /Context7 documentation hints:/i);
assert.match(result.prompt, /Match the generated Playwright starter to the detected testing mode, stack hints, interactive probe findings, Cloudflare crawl route discovery, and reusable project knowledge/i);
assert.match(result.prompt, /If the intake detected DOM risks, complex widgets, proven interactive controls, or known project risks/i);

console.log('qa playwright prompt smoke ok');
