import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const {
  buildQaIntakeContext
} = await import('../../apps/cli/src/qa-intake.mjs');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-runtime-intake-'));
const fixturePath = path.join(tempRoot, 'context7-fixture.json');
fs.writeFileSync(fixturePath, JSON.stringify({
  results: [{
    title: 'Playwright docs',
    url: 'https://playwright.dev/docs/locators',
    excerpt: 'Prefer user-facing locators.'
  }]
}, null, 2));
process.env.LUCY_QA_CONTEXT7_FIXTURE = fixturePath;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    server: 'cloudflare',
    'cf-ray': 'abc123'
  });
  res.end(`<!doctype html>
<html>
  <head>
    <script src="/@vite/client"></script>
    <script>
      setTimeout(() => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Open menu';
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
        button.addEventListener('click', () => {
          button.setAttribute('aria-expanded', 'true');
          const el = document.createElement('div');
          el.setAttribute('data-testid', 'hydrated-settings');
          el.setAttribute('role', 'menu');
          el.textContent = 'Hydrated settings';
          document.body.appendChild(el);
        }, { once: true });
        document.body.appendChild(button);
      }, 100);
    </script>
  </head>
  <body>
    <main>
      <form>
        <input type="text" />
        <button>Save</button>
      </form>
      <iframe src="/frame"></iframe>
    </main>
  </body>
</html>`);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const url = `http://127.0.0.1:${port}/settings`;

try {
  const { intake, docsContext } = await buildQaIntakeContext('Create E2E coverage for settings page update flow.', {
    targetUrl: url,
    cwd: process.cwd()
  });

  assert.equal(intake.intent.needs_clarification, false);
  assert.equal(intake.runtime.target_url, url);
  assert.equal(intake.runtime.status, 'inferred');
  assert.ok(intake.runtime.framework_hints.includes('Vite'));
  assert.ok(intake.runtime.deployment_hints.includes('Cloudflare'));
  assert.equal(intake.browser.status, 'inferred');
  assert.ok(intake.browser.framework_hints.includes('Vite'));
  assert.ok(intake.browser.dom_summary.test_ids >= 0);
  assert.ok(['inferred', 'unknown'].includes(intake.probe.status));
  assert.ok(Array.isArray(intake.probe.evidence));
  if (intake.probe.status === 'inferred') {
    assert.ok(intake.probe.safe_action_count >= 1);
    assert.ok(intake.dom.interactions.includes('dropdown/menu'));
  }
  assert.ok(intake.dom.interactions.includes('iframe'));
  assert.ok(intake.dom.risks.some((item) => /Iframe/i.test(item)));
  assert.ok(intake.docs_queries.length > 0);
  assert.ok(Array.isArray(docsContext));

  console.log('qa runtime intake context smoke ok');
} finally {
  server.close();
  delete process.env.LUCY_QA_CONTEXT7_FIXTURE;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
