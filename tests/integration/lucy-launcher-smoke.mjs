import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-launcher-'));
const installDir = path.join(tempRoot, 'bin');
const configPath = path.join(tempRoot, 'providers.local.json');
const vaultPath = path.join(tempRoot, 'vault');

try {
  const env = {
    ...process.env,
    LUCY_INSTALL_DIR: installDir,
    LUCY_QA_PROVIDER_CONFIG_PATH: configPath,
    LUCY_QA_VAULT_PATH: vaultPath,
    PATH: `${installDir}:${process.env.PATH ?? ''}`
  };

  const install = spawnSync('bash', ['scripts/install-lucy.sh'], {
    cwd: '/root/lucy-qa',
    env,
    encoding: 'utf8'
  });
  assert.equal(install.status, 0, install.stderr || install.stdout);
  assert.ok(fs.existsSync(path.join(installDir, 'lucy')));

  const launch = spawnSync('lucy', [], {
    cwd: '/root/lucy-qa',
    env,
    encoding: 'utf8'
  });
  assert.equal(launch.status, 0, launch.stderr || launch.stdout);
  assert.match(launch.stdout, /Lucy QA/i);

  const providerList = spawnSync('lucy', ['provider', 'presets', '--plain'], {
    cwd: '/root/lucy-qa',
    env,
    encoding: 'utf8'
  });
  assert.equal(providerList.status, 0, providerList.stderr || providerList.stdout);
  assert.match(providerList.stdout, /github-copilot/i);
  assert.match(providerList.stdout, /glm/i);
  assert.match(providerList.stdout, /minimax/i);

  console.log('lucy launcher smoke ok');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
