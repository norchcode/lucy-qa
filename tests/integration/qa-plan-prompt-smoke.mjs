import assert from 'node:assert/strict';

const {
  buildQaPlanPrompt,
  buildQaIntake
} = await import('../../packages/qa-core/src/index.mjs');

const analysis = buildQaIntake('Create an E2E QA plan for login, OTP fallback, and dashboard navigation.');
const docsContext = [{
  query: 'Playwright end-to-end testing best practices for login OTP dashboard navigation',
  engine: 'context7-fixture',
  selected_library: '/microsoft/playwright',
  results: [{
    title: 'Best Practices',
    url: 'https://playwright.dev/docs/best-practices',
    excerpt: 'Use user-facing locators and avoid relying on implementation details.'
  }]
}];

const prompt = buildQaPlanPrompt('Create an E2E QA plan for login, OTP fallback, and dashboard navigation.', {
  analysis,
  docsContext
});

assert.match(prompt, /Structured intake analysis:/i);
assert.match(prompt, /Primary testing mode: e2e/i);
assert.match(prompt, /Intent status: confirmed/i);
assert.match(prompt, /Context7 documentation hints:/i);
assert.match(prompt, /Use the detected testing mode, stack hints, DOM risks, interactive probe findings, Cloudflare crawl site-discovery clues, reusable project knowledge, and Context7 guidance/i);
assert.match(prompt, /If the task is UI-heavy, explicitly mention locator strategy, proven interactive controls, known project risks/i);

console.log('qa plan prompt smoke ok');
