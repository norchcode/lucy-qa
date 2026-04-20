import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const {
  buildQaIntake
} = await import('../../packages/qa-core/src/index.mjs');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-intake-'));

try {
  fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({
    name: 'demo-app',
    dependencies: {
      next: '^15.0.0',
      react: '^19.0.0',
      express: '^4.0.0',
      '@prisma/client': '^6.0.0'
    },
    devDependencies: {
      '@playwright/test': '^1.52.0',
      vitest: '^2.0.0'
    }
  }, null, 2));
  fs.writeFileSync(path.join(tempRoot, 'playwright.config.mjs'), 'export default {};');
  fs.mkdirSync(path.join(tempRoot, 'prisma'), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, 'prisma', 'schema.prisma'), 'datasource db { provider = "sqlite" url = "file:dev.db" }');

  const result = buildQaIntake('Create E2E coverage for login modal and dashboard table sorting, including accessibility checks.', { cwd: tempRoot });

  assert.equal(result.intent.primary_mode, 'e2e');
  assert.equal(result.intent.status, 'confirmed');
  assert.equal(result.intent.needs_clarification, false);
  assert.ok(result.stack.frontend.includes('Next.js'));
  assert.ok(result.stack.test_frameworks.includes('Playwright'));
  assert.ok(result.stack.backend.includes('Express'));
  assert.ok(result.stack.data_layers.includes('Prisma'));
  assert.ok(result.dom.interactions.includes('modal/dialog'));
  assert.ok(result.dom.interactions.includes('table/grid'));
  assert.match(result.dom.selector_strategy, /role-first/i);
  assert.ok(result.docs_queries.some((query) => /Playwright/i.test(query)));

  console.log('qa intake smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
