import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-codex-home-'));
process.env.HOME = tempHome;

const binDir = path.join(tempHome, 'bin');
fs.mkdirSync(binDir, { recursive: true });
const cliLogPath = path.join(tempHome, 'codex-cli-log.json');
const fakeCodexPath = path.join(binDir, 'codex');
fs.writeFileSync(fakeCodexPath, `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const outputIndex = args.indexOf('-o');
const modelIndex = args.indexOf('-m');
const cdIndex = args.indexOf('-C');
const promptArg = args[args.length - 1];
const stdinText = fs.readFileSync(0, 'utf8');
const prompt = promptArg === '-' ? stdinText : promptArg;
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;
const payload = {
  args,
  model: modelIndex >= 0 ? args[modelIndex + 1] : null,
  workdir: cdIndex >= 0 ? args[cdIndex + 1] : null,
  prompt,
  prompt_arg: promptArg
};
fs.writeFileSync(${JSON.stringify(cliLogPath)}, JSON.stringify(payload, null, 2));
if (outputPath) {
  const promptLines = String(prompt).split(String.fromCharCode(10));
  fs.writeFileSync(outputPath, 'codex-cli:' + payload.model + ':' + promptLines[promptLines.length - 1]);
}
process.stdout.write('fake codex ok' + String.fromCharCode(10));
`);
fs.chmodSync(fakeCodexPath, 0o755);
process.env.PATH = `${binDir}:${process.env.PATH}`;

try {
  const authPath = path.join(tempHome, '.codex', 'auth.json');
  const modelsCachePath = path.join(tempHome, '.codex', 'models_cache.json');
  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  fs.writeFileSync(authPath, JSON.stringify({
    auth_mode: 'chatgpt',
    OPENAI_API_KEY: null,
    tokens: {
      access_token: 'test-access-token',
      account_id: 'acct_test'
    },
    last_refresh: '2026-04-10T00:00:00.000Z'
  }, null, 2));
  fs.writeFileSync(modelsCachePath, JSON.stringify({
    fetched_at: '2026-04-10T00:00:00.000Z',
    models: [
      { slug: 'gpt-5.4', supported_in_api: true },
      { slug: 'gpt-5.4-mini', supported_in_api: true },
      { slug: 'gpt-5.3-codex', supported_in_api: true }
    ]
  }, null, 2));

  const configPath = path.join(tempHome, 'providers.json');
  fs.writeFileSync(configPath, JSON.stringify({
    default_provider: 'openai-codex',
    providers: {
      'openai-codex': {
        type: 'native-codex-oauth',
        enabled: true,
        oauth_provider: 'openai-codex',
        transport: 'codex-cli',
        api_base_url: 'https://api.openai.com/v1',
        model: 'gpt-5.4',
        default_model: 'gpt-5.4',
        token_store: authPath,
        models_cache: modelsCachePath,
        task_model_preferences: {
          coding: ['fast', 'balanced']
        },
        model_aliases: {
          balanced: 'gpt-5.4',
          fast: 'gpt-5.4-mini'
        },
        timeout_ms: 5000,
        workdir: tempHome
      }
    }
  }, null, 2));

  const {
    discoverProviderModels,
    persistDefaultModel,
    createProviderClient,
    resolveProvider
  } = await import('../../packages/harness-adapter/src/index.mjs');

  const discovered = await discoverProviderModels({ providerName: 'openai-codex', configPath });
  assert.deepEqual(discovered.discovered_models.models, ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex']);

  const resolvedFromTask = resolveProvider('openai-codex', configPath, null, 'coding');
  assert.equal(resolvedFromTask.model_selection.resolved, 'gpt-5.4-mini');

  const runtime = createProviderClient({ providerName: 'openai-codex', taskType: 'coding', configPath });
  const response = await runtime.client.chat({
    model: runtime.model_selection.resolved,
    messages: [{ role: 'user', content: 'build the feature' }]
  });

  const cliLog = JSON.parse(fs.readFileSync(cliLogPath, 'utf8'));
  assert.equal(response.implemented, true);
  assert.equal(response.transport, 'native-codex-cli');
  assert.equal(response.model, 'gpt-5.4-mini');
  assert.equal(response.text, 'codex-cli:gpt-5.4-mini:build the feature');
  assert.equal(cliLog.model, 'gpt-5.4-mini');
  assert.equal(cliLog.workdir, tempHome);
  assert.match(cliLog.prompt, /^USER\nbuild the feature$/);

  await persistDefaultModel({ providerName: 'openai-codex', model: 'gpt-5.3-codex', configPath });
  const resolvedFromDefault = createProviderClient({ providerName: 'openai-codex', configPath });
  assert.equal(resolvedFromDefault.model_selection.resolved, 'gpt-5.3-codex');

  console.log('codex native chat smoke ok');
} finally {
  fs.rmSync(tempHome, { recursive: true, force: true });
}
