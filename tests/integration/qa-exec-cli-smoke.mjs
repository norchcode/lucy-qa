import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['apps/cli/src/index.mjs', 'qa', 'exec', 'printf', 'hello', '--plain'], {
  cwd: '/root/lucy-qa',
  encoding: 'utf8'
});

assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /QA exec completed/i);
assert.match(result.stdout, /exit_code: 0/i);
assert.match(result.stdout, /stdout:/i);
assert.match(result.stdout, /hello/i);

console.log('qa exec cli smoke ok');
