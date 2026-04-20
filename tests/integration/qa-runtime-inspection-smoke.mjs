import assert from 'node:assert/strict';
import http from 'node:http';

const {
  analyzeBrowserTarget,
  analyzeInteractiveBrowserTarget,
  analyzeRuntimeTarget,
  buildQaIntake,
  enrichQaIntakeWithBrowser,
  enrichQaIntakeWithProbe,
  enrichQaIntakeWithRuntime
} = await import('../../packages/qa-core/src/index.mjs');

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'x-powered-by': 'Next.js',
    'x-vercel-id': 'sin1::demo'
  });
  res.end(`<!doctype html>
<html>
  <head>
    <script id="__NEXT_DATA__" type="application/json">{"page":"/login"}</script>
    <script src="/_next/static/chunks/main.js"></script>
    <script>
      setTimeout(() => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Open details';
        button.setAttribute('aria-haspopup', 'dialog');
        button.addEventListener('click', () => {
          const panel = document.createElement('div');
          panel.setAttribute('role', 'dialog');
          panel.setAttribute('data-testid', 'hydrated-dialog');
          panel.textContent = 'Hydrated dialog';
          document.body.appendChild(panel);
        }, { once: true });
        document.body.appendChild(button);
      }, 100);
    </script>
  </head>
  <body>
    <main>
      <form>
        <label>Email <input type="email" aria-label="Email" data-testid="email-input" /></label>
        <button type="submit">Sign in</button>
      </form>
      <table><tr><td>Row</td></tr></table>
    </main>
  </body>
</html>`);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const url = `http://127.0.0.1:${port}/login`;

try {
  const runtime = await analyzeRuntimeTarget(url);
  assert.equal(runtime.status, 'inferred');
  assert.ok(runtime.framework_hints.includes('Next.js'));
  assert.ok(runtime.deployment_hints.includes('Vercel'));
  assert.equal(runtime.dom_summary.forms, 1);
  assert.equal(runtime.dom_summary.test_ids, 1);
  assert.ok(!runtime.interactions.includes('modal/dialog'));
  assert.ok(runtime.interactions.includes('table/grid'));

  const browser = await analyzeBrowserTarget(url);
  assert.equal(browser.status, 'inferred');
  assert.ok(browser.framework_hints.includes('Next.js'));
  assert.ok(browser.dom_summary.test_ids >= 1);

  const probe = await analyzeInteractiveBrowserTarget(url);
  assert.equal(probe.status, 'inferred');
  assert.ok(probe.interactions.includes('modal/dialog'));
  assert.ok(probe.safe_action_count >= 1);
  assert.ok(probe.actions.some((action) => action.deltas?.dialogs_opened > 0));

  const intake = buildQaIntake('Create E2E coverage for the login page.', { targetUrl: url });
  const runtimeEnriched = enrichQaIntakeWithRuntime(intake, runtime);
  const browserEnriched = enrichQaIntakeWithBrowser(runtimeEnriched, browser);
  const enriched = enrichQaIntakeWithProbe(browserEnriched, probe);
  assert.equal(enriched.runtime.target_url, url);
  assert.equal(enriched.browser.target_url, url);
  assert.equal(enriched.probe.target_url, url);
  assert.ok(enriched.stack.frontend.includes('Next.js'));
  assert.ok(enriched.stack.deployment.includes('Vercel'));
  assert.ok(enriched.dom.interactions.includes('modal/dialog'));
  assert.match(enriched.dom.selector_strategy, /(data-testid|role-first|browser-backed|browser-probed)/i);
  assert.ok(enriched.docs_queries.some((query) => /Next\.js|Playwright/i.test(query)));

  console.log('qa runtime inspection smoke ok');
} finally {
  server.close();
}
