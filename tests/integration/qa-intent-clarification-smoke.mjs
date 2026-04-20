import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const {
  buildQaIntake,
  buildQaTypeClarificationMessage
} = await import('../../packages/qa-core/src/index.mjs');

const explicit = buildQaIntake('Create E2E blackbox coverage for checkout login and payment flow.');
assert.equal(explicit.intent.primary_mode, 'e2e');
assert.equal(explicit.intent.status, 'confirmed');
assert.equal(explicit.intent.needs_clarification, false);
assert.ok(explicit.intent.secondary_modes.includes('blackbox'));

const unclear = buildQaIntake('Create login test coverage for the checkout area.');
assert.equal(unclear.intent.primary_mode, null);
assert.equal(unclear.intent.status, 'unknown');
assert.equal(unclear.intent.needs_clarification, true);
assert.equal(unclear.docs_queries.length, 0);
assert.match(unclear.intent.clarification_message, /Please specify one of these options:/i);
assert.equal(unclear.intent.clarification_message, buildQaTypeClarificationMessage());

const cli = spawnSync(process.execPath, ['apps/cli/src/index.mjs', 'qa', 'cases', 'Create login test coverage for checkout area', '--plain'], {
  cwd: '/root/lucy-qa',
  encoding: 'utf8'
});

assert.equal(cli.status, 0, cli.stderr || cli.stdout);
assert.match(cli.stdout, /Testing type is not clear yet/i);
assert.match(cli.stdout, /E2E: full user flow/i);
assert.match(cli.stdout, /Original request:/i);

console.log('qa intent clarification smoke ok');
