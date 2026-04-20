import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-memory-'));

try {
  const { saveMemoryNote, searchMemoryNotes } = await import('../../packages/memory-obsidian/src/index.mjs');

  const saved = await saveMemoryNote({
    title: 'Login regression note',
    content: 'Checkout flow has a flaky login redirect on staging.',
    category: 'project',
    vaultPath: tempRoot
  });

  assert.equal(saved.implemented, true);
  assert.equal(saved.backend, 'obsidian-vault');
  assert.ok(fs.existsSync(saved.path), 'Saved markdown note should exist');

  const search = await searchMemoryNotes({
    query: 'flaky login redirect',
    vaultPath: tempRoot
  });

  assert.equal(search.implemented, true);
  assert.equal(search.results.length, 1);
  assert.match(search.results[0].content, /staging/i);

  console.log('memory obsidian smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
