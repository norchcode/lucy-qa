import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-journal-obsidian-'));

try {
  const {
    appendSessionJournalEntry,
    loadCurrentSessionJournal,
    startNewSession
  } = await import('../../packages/memory-obsidian/src/state.mjs');

  await appendSessionJournalEntry({
    eventType: 'qa-plan',
    summary: 'Planned checkout login coverage.',
    currentProject: 'checkout',
    commands: ['qa plan checkout login flow'],
    decisions: ['Start with smoke path first.'],
    unresolved: ['Need selector confirmation for SSO button.'],
    artifacts: ['artifacts/plans/checkout-plan.md'],
    vaultPath: tempRoot
  });

  await appendSessionJournalEntry({
    eventType: 'qa-report',
    summary: 'Reviewed failed checkout run.',
    currentProject: 'checkout',
    commands: ['qa report artifacts/playwright/runs/demo-run'],
    decisions: ['Draft bugs from failed cases.'],
    unresolved: ['Need to verify whether failure is env-specific.'],
    artifacts: ['artifacts/playwright/runs/demo-run/report.json'],
    vaultPath: tempRoot
  });

  const journal = await loadCurrentSessionJournal({ vaultPath: tempRoot });
  assert.equal(journal.entry_count, 2);
  assert.equal(journal.current_project, 'checkout');
  assert.match(journal.markdown, /Planned checkout login coverage/i);
  assert.match(journal.markdown, /Need to verify whether failure is env-specific/i);
  assert.ok(journal.unresolved.some((item) => /env-specific/i.test(item)));
  assert.ok(journal.decisions.some((item) => /Draft bugs/i.test(item)));

  const started = await startNewSession({ projectName: 'fresh-project', vaultPath: tempRoot });
  assert.equal(started.started_new_session, true);

  const archiveDir = path.join(tempRoot, 'journals', 'archive');
  assert.ok(fs.existsSync(archiveDir), 'journal archive directory should exist');
  assert.ok(fs.readdirSync(archiveDir).some((name) => name.endsWith('.md')), 'archived journal markdown should exist');

  const newJournal = await loadCurrentSessionJournal({ vaultPath: tempRoot });
  assert.equal(newJournal.entry_count, 1);
  assert.match(newJournal.markdown, /Started a new Lucy QA session/i);

  console.log('state journal obsidian smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
