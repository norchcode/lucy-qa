import assert from 'node:assert/strict';

const {
  buildPlaywrightPrompt,
  createPlaywrightRecordingPlan
} = await import('../../packages/qa-playwright/src/index.mjs');

const prompt = buildPlaywrightPrompt('Generate Playwright login automation.');
assert.match(prompt, /video|screen recording/i, 'Prompt should request screen recording guidance');
assert.match(prompt, /ffmpeg/i, 'Prompt should mention ffmpeg as an optional post-processing tool');

const plan = createPlaywrightRecordingPlan({ artifactsRoot: '/tmp/lucy-artifacts' });
assert.equal(plan.implemented, true, 'Recording plan should be implemented');
assert.equal(plan.playwright.use.video, 'on', 'Playwright video recording should be enabled');
assert.equal(plan.playwright.use.trace, 'on', 'Trace should be enabled for each run');
assert.equal(plan.playwright.use.screenshot, 'only-on-failure', 'Screenshots should be enabled on failure');
assert.match(plan.configSnippet, /video:\s*'on'/, 'Config snippet should enable video');
assert.match(plan.configSnippet, /trace:\s*'on'/, 'Config snippet should enable trace');

console.log('qa playwright recording smoke ok');
