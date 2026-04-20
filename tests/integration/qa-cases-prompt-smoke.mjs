import assert from 'node:assert/strict';

const {
  buildQaCasesPrompt,
  buildQaIntake
} = await import('../../packages/qa-core/src/index.mjs');

const analysis = buildQaIntake('Design blackbox E2E test cases for login form, modal errors, and accessibility validation.');
const docsContext = [{
  query: 'Playwright accessibility locator role label assertion guidance',
  engine: 'context7-fixture',
  selected_library: '/microsoft/playwright',
  results: [{
    title: 'Locators',
    url: 'https://playwright.dev/docs/locators',
    excerpt: 'Locate by role, label, placeholder, text, or test id.'
  }]
}];

const prompt = buildQaCasesPrompt('Design blackbox E2E test cases for login form, modal errors, and accessibility validation.', {
  analysis,
  docsContext
});

assert.match(prompt, /Structured intake analysis:/i);
assert.match(prompt, /Primary testing mode: e2e/i);
assert.match(prompt, /Intent status: confirmed/i);
assert.match(prompt, /Selector strategy:/i);
assert.match(prompt, /Context7 documentation hints:/i);
assert.match(prompt, /Selected library: \/microsoft\/playwright/i);
assert.match(prompt, /Reflect DOM findings in UI-related cases/i);
assert.match(prompt, /Use the detected stack, interactive probe findings, Cloudflare crawl discovery, reusable project knowledge, and Context7 hints/i);

console.log('qa cases prompt smoke ok');
