import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-memory-sessions-'));

try {
  const { saveSessionSnapshot } = await import('../../packages/memory-obsidian/src/state.mjs');
  const { saveMemoryNote, searchMemoryNotes } = await import('../../packages/memory-obsidian/src/index.mjs');

  await saveSessionSnapshot({
    summary: 'Need to resume the unusual zebra checkout regression tomorrow.',
    currentProject: 'checkout',
    recentCommands: ['qa report artifacts/playwright/runs/zebra-run'],
    vaultPath: tempRoot
  });

  await saveMemoryNote({
    title: 'Checkout note',
    content: 'Remember the zebra checkout experiment uses a hidden feature flag.',
    category: 'project',
    vaultPath: tempRoot
  });

  const search = await searchMemoryNotes({ query: 'zebra checkout', vaultPath: tempRoot, limit: 10 });
  assert.ok(search.results.some((item) => item.category === 'sessions'), JSON.stringify(search.results));
  assert.ok(search.results.some((item) => item.title === 'Checkout note'), JSON.stringify(search.results));

  console.log('memory search sessions smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
