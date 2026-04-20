import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-resume-'));

try {
  const {
    saveSessionSnapshot,
    saveOpenTasks,
    saveLastRun,
    loadResumeContext
  } = await import('../../packages/memory-obsidian/src/state.mjs');

  await saveSessionSnapshot({
    summary: 'Resume the login defect triage work.',
    currentProject: 'checkout',
    recentCommands: ['qa report artifacts/playwright/runs/demo-run'],
    vaultPath: tempRoot
  });
  await saveOpenTasks({
    tasks: [
      'Review failed checkout run demo-run',
      'File the drafted login defect'
    ],
    vaultPath: tempRoot
  });
  await saveLastRun({
    runId: 'demo-run',
    runDir: '/tmp/demo-run',
    status: 'failed',
    target: 'tests/e2e/checkout.spec.js',
    reportPath: '/tmp/demo-run/report.json',
    vaultPath: tempRoot
  });

  const { runStateResumeCommand, runStateStartNewSessionCommand } = await import('../../apps/cli/src/state.mjs');

  const resume = await runStateResumeCommand({ vaultPath: tempRoot });
  assert.equal(resume.has_resumable_state, true);
  assert.match(resume.resume_text, /Resume the login defect triage work/i);
  assert.match(resume.next_steps.join('\n'), /Review failed checkout run demo-run/i);

  const started = await runStateStartNewSessionCommand({
    projectName: 'fresh-checkout',
    vaultPath: tempRoot
  });
  assert.equal(started.started_new_session, true);
  assert.equal(started.archived_previous_session, true);

  const current = await loadResumeContext({ vaultPath: tempRoot });
  assert.equal(current.session.current_project, 'fresh-checkout');
  assert.equal(current.open_tasks.tasks.length, 0);
  assert.match(current.session.summary, /Started a new Lucy QA session/i);

  console.log('state resume cli smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
