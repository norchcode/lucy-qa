import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, [
  'apps/cli/src/index.mjs',
  'qa',
  'bug',
  'Login fails with valid credentials on staging after submit.',
  '--plain'
], {
  cwd: '/root/lucy-qa',
  encoding: 'utf8'
});

assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /Lucy QA bug report/i);
assert.match(result.stdout, /Title/i);
assert.match(result.stdout, /Environment/i);
assert.match(result.stdout, /Expected vs Actual/i);
assert.match(result.stdout, /Severity/i);
assert.match(result.stdout, /Priority/i);

console.log('qa bug cli smoke ok');
