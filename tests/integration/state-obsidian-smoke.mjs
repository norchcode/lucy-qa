import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-state-'));

try {
  const {
    saveSessionSnapshot,
    saveOpenTasks,
    saveLastRun,
    loadResumeContext
  } = await import('../../packages/memory-obsidian/src/state.mjs');

  await saveSessionSnapshot({
    summary: 'Working on staging login regression triage.',
    currentProject: 'checkout',
    recentCommands: ['qa run tests/e2e/login.spec.js', 'qa bug "Login redirect broken"'],
    vaultPath: tempRoot
  });

  await saveOpenTasks({
    tasks: ['Re-run login smoke on staging', 'File bug for redirect failure'],
    vaultPath: tempRoot
  });

  await saveLastRun({
    runId: 'demo-run',
    runDir: '/tmp/demo-run',
    status: 'failed',
    target: 'tests/e2e/login.spec.js',
    vaultPath: tempRoot
  });

  const state = await loadResumeContext({ vaultPath: tempRoot });

  assert.equal(state.implemented, true);
  assert.equal(state.session.current_project, 'checkout');
  assert.equal(state.open_tasks.tasks.length, 2);
  assert.equal(state.last_run.run_id, 'demo-run');
  assert.match(state.resume_text, /staging login regression/i);

  console.log('state obsidian smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
