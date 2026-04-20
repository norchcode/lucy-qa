#!/usr/bin/env node
/**
 * Lucy QA doctor — checks that all system dependencies and integrations are ready.
 *
 * Usage:
 *   node scripts/doctor.mjs
 *   node scripts/doctor.mjs --plain
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getRtkStatus } from '../packages/rtk-filter/src/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const plain = process.argv.includes('--plain');

const ansiEnabled = () => !process.env.NO_COLOR && process.stdout.isTTY;
const c = {
  green: (t) => ansiEnabled() ? `\x1b[32m${t}\x1b[0m` : t,
  red: (t) => ansiEnabled() ? `\x1b[31m${t}\x1b[0m` : t,
  yellow: (t) => ansiEnabled() ? `\x1b[33m${t}\x1b[0m` : t,
  bold: (t) => ansiEnabled() ? `\x1b[1m${t}\x1b[0m` : t,
  dim: (t) => ansiEnabled() ? `\x1b[2m${t}\x1b[0m` : t,
};

const ok = (label, detail = '') => {
  const line = `  ${c.green('✓')} ${label}${detail ? c.dim(` — ${detail}`) : ''}`;
  console.log(plain ? `ok: ${label}${detail ? ` (${detail})` : ''}` : line);
};
const warn = (label, detail = '') => {
  const line = `  ${c.yellow('⚠')} ${label}${detail ? c.dim(` — ${detail}`) : ''}`;
  console.log(plain ? `warn: ${label}${detail ? ` (${detail})` : ''}` : line);
};
const fail = (label, detail = '') => {
  const line = `  ${c.red('✗')} ${label}${detail ? c.dim(` — ${detail}`) : ''}`;
  console.log(plain ? `fail: ${label}${detail ? ` (${detail})` : ''}` : line);
};
const section = (title) => {
  if (!plain) console.log(`\n${c.bold(title)}`);
};

const tryExec = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim();
  } catch {
    return null;
  }
};

const fileExists = (relPath) => fs.existsSync(path.resolve(ROOT, relPath));

let issues = 0;

// ── Runtime ─────────────────────────────────────────────────────────────────
section('Runtime');

const nodeVersion = tryExec('node', ['--version']);
if (nodeVersion) {
  const major = parseInt(nodeVersion.replace('v', ''), 10);
  if (major >= 20) {
    ok('Node.js', nodeVersion);
  } else {
    warn('Node.js', `${nodeVersion} — v20+ recommended`);
    issues++;
  }
} else {
  fail('Node.js', 'not found');
  issues++;
}

const pnpmVersion = tryExec('pnpm', ['--version']);
if (pnpmVersion) {
  ok('pnpm', `v${pnpmVersion}`);
} else {
  warn('pnpm', 'not found — install with: npm install -g pnpm');
}

// ── RTK (Token Killer) ───────────────────────────────────────────────────────
section('RTK — token compression');

const rtkStatus = getRtkStatus();
if (rtkStatus.available) {
  ok('RTK binary', rtkStatus.version ?? 'installed');
  ok('RTK enabled', 'qa exec and qa run output compressed before LLM context');
} else {
  warn('RTK not installed', '60-90% token savings available — run: scripts/install-rtk.sh');
  if (!plain) {
    console.log(c.dim('    Install: curl -fsSL https://install.rtk-ai.app | sh'));
    console.log(c.dim('    Docs: https://github.com/rtk-ai/rtk'));
  }
}

// ── Config files ─────────────────────────────────────────────────────────────
section('Config');

if (fileExists('config/providers.local.json')) {
  ok('providers.local.json', 'found');
} else if (fileExists('config/providers.example.json')) {
  warn('providers.local.json', 'not found — using providers.example.json (copy it to set up your own keys)');
} else {
  fail('providers config', 'no providers.example.json or providers.local.json found');
  issues++;
}

// ── AI providers ─────────────────────────────────────────────────────────────
section('AI providers (env vars)');

const providerEnvChecks = [
  { env: 'ZHIPU_API_KEY', label: 'Zhipu AI GLM (ZHIPU_API_KEY)' },
  { env: 'GLM_API_KEY', label: 'Zhipu AI GLM alt key (GLM_API_KEY)' },
  { env: 'MINIMAX_API_KEY', label: 'MiniMax (MINIMAX_API_KEY)' },
  { env: 'ADACODE_API_KEY', label: 'AdaCODE (ADACODE_API_KEY)' },
  { env: 'COPILOT_GITHUB_TOKEN', label: 'GitHub Copilot (COPILOT_GITHUB_TOKEN)' },
  { env: 'GH_TOKEN', label: 'GitHub Copilot alt (GH_TOKEN)' },
];

let anyProviderKey = false;
for (const { env, label } of providerEnvChecks) {
  if (process.env[env]) {
    ok(label, 'set');
    anyProviderKey = true;
  }
}
if (!anyProviderKey) {
  warn('No AI provider API key found', 'set one of: ZHIPU_API_KEY, MINIMAX_API_KEY, ADACODE_API_KEY, COPILOT_GITHUB_TOKEN');
}

// Native Codex OAuth
const codexAuthPath = path.resolve(process.env.HOME ?? '~', '.codex/auth.json');
if (fs.existsSync(codexAuthPath)) {
  ok('OpenAI Codex auth', `found at ${codexAuthPath}`);
}

// ── Optional integrations ────────────────────────────────────────────────────
section('QA integrations (optional)');

const integrationEnvChecks = [
  { env: 'QASE_API_TOKEN', label: 'Qase API token' },
  { env: 'LUCY_QA_QASE_API_TOKEN', label: 'Qase API token (LUCY_QA_ prefix)' },
  { env: 'JIRA_BASE_URL', label: 'Jira base URL' },
  { env: 'LUCY_QA_JIRA_BASE_URL', label: 'Jira base URL (LUCY_QA_ prefix)' },
  { env: 'JIRA_API_TOKEN', label: 'Jira API token' },
];

let anyIntegration = false;
for (const { env, label } of integrationEnvChecks) {
  if (process.env[env]) {
    ok(label, 'set');
    anyIntegration = true;
  }
}
if (!anyIntegration) {
  if (!plain) console.log(c.dim('  (none set — optional, needed for qa defects file-remote and qa report publish)'));
}

// ── Playwright ───────────────────────────────────────────────────────────────
section('Playwright');

const playwrightVersion = tryExec('npx', ['playwright', '--version']);
if (playwrightVersion) {
  ok('Playwright', playwrightVersion);
} else {
  warn('Playwright', 'not found — install with: npx playwright install');
}

// ── Obsidian vault ───────────────────────────────────────────────────────────
section('Vault / memory');

const vaultPath = process.env.LUCY_QA_VAULT_PATH ?? path.resolve(ROOT, 'vault');
if (fs.existsSync(vaultPath)) {
  ok('Vault directory', vaultPath);
} else {
  if (!plain) console.log(c.dim(`  (will be created on first use at ${vaultPath})`));
}

// ── Packages ─────────────────────────────────────────────────────────────────
section('Packages');

const expectedPackages = [
  'packages/harness-adapter/src/index.mjs',
  'packages/auth-codex/src/index.mjs',
  'packages/auth-github-copilot/src/index.mjs',
  'packages/provider-openai-compatible/src/index.mjs',
  'packages/rtk-filter/src/index.mjs',
  'packages/qa-core/src/index.mjs',
  'packages/qa-playwright/src/index.mjs',
  'packages/qa-knowledge/src/index.mjs',
  'packages/context7-client/src/index.mjs',
  'packages/memory-obsidian/src/index.mjs',
  'packages/research-engine/src/index.mjs',
  'packages/i18n/src/index.mjs',
  'packages/shared-types/src/index.mjs',
];

for (const pkgPath of expectedPackages) {
  if (fileExists(pkgPath)) {
    ok(pkgPath.replace('packages/', '').replace('/src/index.mjs', ''));
  } else {
    fail(pkgPath, 'missing');
    issues++;
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('');
if (issues === 0) {
  console.log(plain ? 'doctor: ok' : c.green('  ✓ Lucy QA doctor: all checks passed'));
} else {
  console.log(plain ? `doctor: ${issues} issue(s)` : c.red(`  ✗ Lucy QA doctor: ${issues} issue(s) found — review output above`));
  process.exit(1);
}
