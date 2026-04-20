#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  listProviders,
  resolveProvider,
  connectProvider,
  discoverProviderModels,
  persistDefaultModel,
  listProviderPresets,
  buildProviderFromPreset,
  saveProviderConfigEntry,
  resolveDefaultProviderConfigPath,
  switchProvider,
  getActiveProvider,
  authCodexStatus,
  authAnthropicStatus,
  authGitHubCopilotStatus,
  resolveGitHubCopilotApiKeyEnv,
  beginOpenAICodexManualOAuth,
  beginAnthropicManualOAuth,
  completeOpenAICodexManualOAuth,
  completeAnthropicManualOAuth,
  getOpenAICodexManualOAuthStatus,
  getAnthropicManualOAuthStatus
} from '../../../packages/harness-adapter/src/index.mjs';
import { runAskCommand } from './ask.mjs';
import { runDocsCommand } from './docs.mjs';
import { runQaPlanCommand } from './qa-plan.mjs';
import { runQaCasesCommand } from './qa-cases.mjs';
import { runQaPlaywrightCommand } from './qa-playwright.mjs';
import { runQaRunCommand } from './qa-run.mjs';
import { runQaReportCommand } from './qa-report.mjs';
import { runQaBugCommand } from './qa-bug.mjs';
import { runQaBugsFromRunCommand } from './qa-bugs.mjs';
import { runQaAgentCommand } from './qa-agent.mjs';
import { runQaDefectsFileRemoteCommand, runQaDefectsLinkCommand, runQaDefectsListCommand, runQaDefectsUpdateCommand } from './qa-defects.mjs';
import { loadQaOnboardingProfile, runQaOnboardingCommand, inferQaOnboardingFromConversation } from './qa-onboarding.mjs';
import { buildQaIntegrationReadiness } from './qa-integrations.mjs';
import { publishQaRunToTestManagement } from './qa-qase.mjs';
import { runQaExecCommand } from './qa-exec.mjs';
import { loadQaLearningState, runQaSelfImprovementPass } from './qa-learning.mjs';
import { getRtkStatus, isRtkAvailable } from '../../../packages/rtk-filter/src/index.mjs';
import { runMemorySaveCommand, runMemorySearchCommand } from './memory.mjs';
import {
  runStateSaveSessionCommand,
  runStateOpenTasksCommand,
  runStateShowCommand,
  runStateStartupCommand,
  runStateResumeCommand,
  runStateStartNewSessionCommand,
  runStateJournalAppendCommand,
  runStateJournalCommand,
  runStateSaveLastRun,
  runStateSaveLastBugs
} from './state.mjs';

const CLI_PACKAGE = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const CLI_VERSION = CLI_PACKAGE.version ?? '0.1.0';

const ansiEnabled = () => {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0') return true;
  return Boolean(process.stdout.isTTY);
};

const ansi = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m'
};

const colorize = (text, ...codes) => ansiEnabled() ? `${codes.join('')}${text}${ansi.reset}` : text;
const colorTitle = (text) => colorize(text, ansi.bold, ansi.cyan);
const colorAscii = (text) => colorize(text, ansi.green);
const colorMeta = (text) => colorize(text, ansi.yellow);
const colorAccent = (text) => colorize(text, ansi.magenta);
const colorDim = (text) => colorize(text, ansi.dim);
const colorPanelBorder = (text) => colorize(text, ansi.blue);

const panelRule = (label = '') => {
  const base = label ? `━━ ${label} ` : '━━━━━━━━';
  return colorPanelBorder(base.padEnd(54, '━'));
};

const args = process.argv.slice(2);
const readFlag = (flagName) => {
  const index = args.indexOf(flagName);
  return index >= 0 ? args[index + 1] ?? null : null;
};
const positionalAfter = (index) => {
  const result = [];
  for (let i = index; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--provider' || token === '--model' || token === '--task' || token === '--method' || token === '--base-url' || token === '--target-url' || token === '--artifacts-root' || token === '--cwd' || token === '--timeout' || token === '--from-run' || token === '--content' || token === '--category' || token === '--vault' || token === '--limit' || token === '--project' || token === '--bug-id' || token === '--tracker' || token === '--tracker-url' || token === '--tracker-title' || token === '--tracker-status' || token === '--status' || token === '--qa-test-management' || token === '--qa-project' || token === '--issue-tracker' || token === '--issue-project' || token === '--preferred-bug-workflow' || token === '--issue-type' || token === '--title' || token === '--to' || token === '--preset' || token === '--api-key-env' || token === '--label' || token === '--jira-base-url' || token === '--jira-email' || token === '--jira-api-token' || token === '--qase-base-url' || token === '--qase-api-token') {
      i += 1;
      continue;
    }
    if (token === '--plain' || token === '--detailed' || token === '--trace' || token === '--close-run' || token === '--set-default' || token === '--test-connections') {
      continue;
    }
    result.push(token);
  }
  return result;
};

const printJson = (value) => {
  console.log(JSON.stringify(value, null, 2));
};

const printSection = (title, lines = []) => {
  console.log(colorTitle(title));
  for (const line of lines) {
    console.log(line);
  }
};

const printPanel = (title, lines = []) => {
  console.log(panelRule(title));
  console.log(colorTitle(title));
  for (const line of lines) {
    console.log(`  ${line}`);
  }
};

const resolveVaultPath = (vaultPath = null) => path.resolve(vaultPath ?? process.env.LUCY_QA_VAULT_PATH ?? path.resolve(process.cwd(), 'vault'));
const firstRunStatePath = (vaultPath = null) => path.join(resolveVaultPath(vaultPath), 'qa-config', 'first-run.json');

const getBootProviderBadges = () => {
  const activeProvider = getActiveProvider();
  if (!activeProvider) {
    return {
      provider: null,
      model: null
    };
  }
  try {
    const resolution = resolveProvider(activeProvider, undefined, null, 'qa');
    return {
      provider: resolution.name,
      model: resolution.model_selection?.resolved ?? resolution.provider?.default_model ?? resolution.provider?.model ?? null
    };
  } catch {
    return {
      provider: activeProvider,
      model: null
    };
  }
};

const printFirstRunBanner = () => {
  const badges = getBootProviderBadges();
  const lines = [
    '██╗     ██╗   ██╗ ██████╗██╗   ██╗     ██████╗  █████╗ ',
    '██║     ██║   ██║██╔════╝╚██╗ ██╔╝    ██╔═══██╗██╔══██╗',
    '██║     ██║   ██║██║      ╚████╔╝     ██║   ██║███████║',
    '██║     ██║   ██║██║       ╚██╔╝      ██║▄▄ ██║██╔══██║',
    '███████╗╚██████╔╝╚██████╗   ██║       ╚██████╔╝██║  ██║',
    '╚══════╝ ╚═════╝  ╚═════╝   ╚═╝        ╚══▀▀═╝ ╚═╝  ╚═╝'
  ];
  console.log(colorTitle('LUCY QA'));
  for (const line of lines) {
    console.log(colorAscii(line));
  }
  console.log(colorize('QA assistant ready', ansi.bold));
  console.log(colorMeta(`version: ${CLI_VERSION}`));
  console.log(colorMeta(`provider: ${badges.provider ?? 'auto'}`));
  console.log(colorMeta(`model: ${badges.model ?? 'auto'}`));
  const rtkBadge = isRtkAvailable() ? 'rtk: active (token compression on)' : 'rtk: not installed (run scripts/install-rtk.sh)';
  console.log(colorMeta(rtkBadge));
  console.log(colorize('available: plan | run | report | file bugs', ansi.blue));
};

const writeFirstRunState = (vaultPath = null) => {
  const filePath = firstRunStatePath(vaultPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ shown_at: new Date().toISOString() }, null, 2));
};

const formatSetupValue = (value, emptyText = 'not configured yet') => value ?? emptyText;

const buildSetupNextStepLines = (onboarding) => {
  const profile = onboarding.profile ?? {};
  const questions = onboarding.questions ?? [];

  if (profile.qa_test_management && profile.qa_project && !profile.issue_tracker) {
    return [
      `- saved so far: ${profile.qa_test_management} / ${profile.qa_project}`,
      '- next: add the issue tracker your team uses',
      `- next question: ${questions[0] ?? 'not available'}`
    ];
  }

  if (profile.issue_tracker && profile.issue_tracker !== 'none' && !profile.issue_project) {
    return [
      `- saved so far: issue tracker is ${profile.issue_tracker}`,
      '- next: add the issue tracker project or team key',
      `- next question: ${questions[0] ?? 'not available'}`
    ];
  }

  if (profile.qa_test_management && profile.issue_tracker) {
    return [
      '- core setup is saved',
      '- next: add Jira or Qase credentials when you are ready to sync outward'
    ];
  }

  return [
    '- start by telling Lucy QA which test management system your team uses',
    ...(questions[0] ? [`- next question: ${questions[0]}`] : [])
  ];
};

const printFirstRunOnboarding = async ({ vaultPath = null, startupState = null } = {}) => {
  const onboarding = await runQaOnboardingCommand({ vaultPath });
  printFirstRunBanner();
  console.log('');
  printPanel('Startup', [
    `- vault_path: ${resolveVaultPath(vaultPath)}`,
    `- startup_state: ${startupState?.has_resumable_state ? 'resume-available' : 'fresh-start'}`,
    '- answer one setup prompt at a time; Lucy QA will keep asking only for what is still missing'
  ]);
  console.log('');
  printPanel('Available actions', [
    '- qa plan -> create a test plan',
    '- qa run -> run Playwright tests and collect evidence',
    '- qa report -> summarize results from a run',
    '- qa bugs -> draft bug reports from failed runs'
  ]);
  console.log('');
  printPanel('Current setup', [
    `- qa_test_management: ${formatSetupValue(onboarding.profile?.qa_test_management)}`,
    `- qa_project: ${formatSetupValue(onboarding.profile?.qa_project)}`,
    `- issue_tracker: ${formatSetupValue(onboarding.profile?.issue_tracker)}`,
    `- issue_project: ${formatSetupValue(onboarding.profile?.issue_project)}`,
    `- jira_ready: ${onboarding.integrations?.readiness?.jira?.ready ? 'yes' : 'no'}`,
    `- qase_ready: ${onboarding.integrations?.readiness?.qase?.ready ? 'yes' : 'no'}`
  ]);
  console.log('');
  printPanel('Next step', buildSetupNextStepLines(onboarding));
  console.log('');
  printPanel('Setup', [
    '- this is a new workspace, so Lucy QA is collecting the minimum setup it needs.',
    '- you can answer in stages; partial answers are saved and reused on the next run.'
  ]);
  console.log('');
  printSection('Lucy QA onboarding', [
    '- status: setup needed',
    '- Save your stack with flags or a short answer such as:',
    '- lucy qa onboarding "we use qase project WEB and jira project QA"',
    '- lucy qa onboarding --qa-test-management <name> --qa-project <code> --issue-tracker <name> --issue-project <key-or-team>',
    '- Then add credentials with:',
    '- lucy qa onboarding --jira-base-url <url> --jira-email <email> --jira-api-token <token> --qase-api-token <token> --test-connections'
  ]);
  if (onboarding.questions?.length) {
    console.log('');
    console.log('Questions');
    onboarding.questions.forEach((question, index) => {
      console.log(`${index + 1}. ${question}`);
    });
  }
  console.log('');
  console.log('Tip');
  console.log('- Run lucy qa onboarding --plain if you want the same prompts in compact form.');
  writeFirstRunState(vaultPath);
};

const maybePrintFirstRunExperience = async ({ vaultPath = null, startupState = null } = {}) => {
  const onboarding = await loadQaOnboardingProfile({ vaultPath });
  if (onboarding.configured || fs.existsSync(firstRunStatePath(vaultPath))) {
    return false;
  }
  await printFirstRunOnboarding({ vaultPath, startupState });
  return true;
};

const formatList = (items = [], emptyText = 'none') => {
  return items.length ? items.join(', ') : emptyText;
};

const printOnboardingPrompt = async ({ vaultPath = process.env.LUCY_QA_VAULT_PATH ?? null, title = 'Lucy QA onboarding' } = {}) => {
  const onboarding = await loadQaOnboardingProfile({ vaultPath });
  const integrations = await buildQaIntegrationReadiness({ onboarding: onboarding.profile, vaultPath });
  if (onboarding.configured) {
    printSection(title, [
      `- qa_test_management: ${onboarding.profile.qa_test_management ?? 'not set'}`,
      `- qa_project: ${onboarding.profile.qa_project ?? 'not set'}`,
      `- issue_tracker: ${onboarding.profile.issue_tracker ?? 'not set'}`,
      `- issue_project: ${onboarding.profile.issue_project ?? 'not set'}`,
      `- preferred_bug_workflow: ${onboarding.profile.preferred_bug_workflow ?? 'not set'}`,
      `- jira_ready: ${integrations.readiness.jira.ready ? 'yes' : 'no'}`,
      `- qase_ready: ${integrations.readiness.qase.ready ? 'yes' : 'no'}`,
      `- onboarding_path: ${onboarding.path}`,
      `- credentials_path: ${integrations.path}`
    ]);
    if ((integrations.readiness.jira.selected && !integrations.readiness.jira.ready) || (integrations.readiness.qase.selected && !integrations.readiness.qase.ready)) {
      console.log('');
      console.log('Integration setup');
      console.log('- Save masked credentials separately from onboarding with:');
      console.log('- lucy qa onboarding --jira-base-url <url> --jira-email <email> --jira-api-token <token> --qase-api-token <token> --test-connections');
    }
    return;
  }

  printSection(title, [
    `- qa_test_management: ${formatSetupValue(onboarding.profile.qa_test_management)}`,
    `- qa_project: ${formatSetupValue(onboarding.profile.qa_project)}`,
    `- issue_tracker: ${formatSetupValue(onboarding.profile.issue_tracker)}`,
    `- issue_project: ${formatSetupValue(onboarding.profile.issue_project)}`,
    '- status: setup recommended',
    '- Lucy QA will keep asking only for the missing setup details.',
    `- next: ${onboarding.questions?.[0] ?? 'review the saved setup and add credentials when ready'}`,
    '- Save it with flags or a short answer such as:',
    '- lucy qa onboarding "we use qase project WEB and jira project QA"',
    '- lucy qa onboarding --qa-test-management <name> --qa-project <code> --issue-tracker <name> --issue-project <key-or-team>',
    '- Then add credentials with:',
    '- lucy qa onboarding --jira-base-url <url> --jira-email <email> --jira-api-token <token> --qase-api-token <token> --test-connections'
  ]);
  if (onboarding.questions?.length) {
    console.log('');
    console.log('Questions');
    for (const question of onboarding.questions) {
      console.log(`- ${question}`);
    }
  }
};

const printAuthStatus = (status) => {
  printSection('Codex auth status', [
    `- provider: ${status.provider}`,
    `- auth_mode: ${status.auth_mode ?? 'unknown'}`,
    `- token_store: ${status.token_store_path}`,
    `- models_cache: ${status.models_cache_path}`,
    `- account_id: ${status.account_id ?? 'not available'}`,
    `- last_refresh: ${status.last_refresh ?? 'never'}`,
    `- access_token_present: ${status.has_access_token ? 'yes' : 'no'}`,
    `- api_key_present: ${status.has_api_key ? 'yes' : 'no'}`,
    `- models_cache_fetched_at: ${status.models_cache_fetched_at ?? 'not available'}`
  ]);
};

const printGitHubCopilotAuthStatus = (status) => {
  printSection('GitHub Copilot auth status', [
    `- provider: ${status.provider}`,
    `- auth_mode: ${status.auth_mode ?? 'unknown'}`,
    `- api_key_present: ${status.has_api_key ? 'yes' : 'no'}`,
    `- configured_api_key_env: ${status.configured_api_key_env ?? 'not set'}`,
    `- detected_api_key_env: ${status.detected_api_key_env ?? 'not detected'}`,
    `- base_url: ${status.base_url}`,
    `- integration_id: ${status.integration_id}`,
    `- supported_api_key_envs: ${(status.supported_api_key_envs ?? []).join(', ') || 'none'}`
  ]);
};

const printAnthropicAuthStatus = (status) => {
  printSection('Anthropic auth status', [
    `- provider: ${status.provider}`,
    `- auth_mode: ${status.auth_mode ?? 'unknown'}`,
    `- token_store: ${status.token_store_path}`,
    `- configured_api_key_env: ${status.configured_api_key_env ?? 'not set'}`,
    `- configured_api_key_present: ${status.has_configured_api_key ? 'yes' : 'no'}`,
    `- stored_api_key_present: ${status.has_store_api_key ? 'yes' : 'no'}`,
    `- access_token_present: ${status.has_access_token ? 'yes' : 'no'}`,
    `- api_key_created_at: ${status.api_key_created_at ?? 'not available'}`,
    `- oauth_expires_at: ${status.expires_at ?? 'not available'}`,
    `- scope: ${status.scope ?? 'not available'}`
  ]);
};

const printAuthPending = (status) => {
  if (!status.pending) {
    printSection('Manual OAuth pending state', [
      `- provider: ${status.provider}`,
      '- pending: no'
    ]);
    return;
  }

  printSection('Manual OAuth pending state', [
    `- provider: ${status.provider}`,
    '- pending: yes',
    `- created_at: ${status.created_at}`,
    `- redirect_uri: ${status.redirect_uri}`,
    `- authorization_endpoint: ${status.authorization_endpoint}`,
    `- pending_path: ${status.pending_path}`
  ]);
};

const printAuthLoginManual = (result) => {
  printSection('Manual OAuth login started', [
    `- provider: ${result.provider}`,
    `- method: ${result.method}`,
    `- redirect_uri: ${result.redirect_uri}`,
    `- pending_path: ${result.pending_path}`,
    '',
    'Open this URL in your browser:',
    result.auth_url,
    '',
    'Next steps:'
  ]);

  result.instructions.forEach((line, index) => {
    console.log(`${index + 1}. ${line}`);
  });
};

const printSimpleAuthMethod = (result) => {
  printSection('Codex auth helper', [
    `- provider: ${result.provider}`,
    `- method: ${result.method}`,
    `- command: ${result.command}`,
    `- note: ${result.note}`
  ]);
};

const printGitHubCopilotAuthReady = (result) => {
  printSection('GitHub Copilot auth ready', [
    `- provider: github-copilot`,
    `- provider_name: ${result.provider_name}`,
    `- type: ${result.provider.type}`,
    `- base_url: ${result.provider.base_url ?? 'not set'}`,
    `- model: ${result.provider.model}`,
    `- api_key_env: ${result.provider.api_key_env ?? 'not set'}`,
    `- default_provider: ${result.default_provider}`,
    `- config_path: ${result.path}`
  ]);
};

const printAuthComplete = (result) => {
  printSection('Manual OAuth completed', [
    `- provider: ${result.provider}`,
    `- method: ${result.method}`,
    `- token_store: ${result.token_store}`,
    `- account_id: ${result.account_id ?? 'not available'}`,
    `- api_key: ${result.api_key ? 'created' : 'not created'}`,
    `- scopes: ${Array.isArray(result.scopes) ? result.scopes.join(', ') : result.scopes ?? 'not available'}`,
    '',
    'Important:',
    ...(result.provider === 'anthropic'
      ? ['- Lucy QA created a real Anthropic API key from the OAuth flow and saved it in the token store.']
      : ['- This login is enough for codex-cli transport.', '- It may still not include api.responses.write for direct Responses API access.'])
  ]);
};

const printProviderList = (providers, activeProvider) => {
  console.log('Configured providers');
  providers.forEach((provider, index) => {
    console.log(`${index + 1}. ${provider.name}`);
    console.log(`   type: ${provider.type}`);
    console.log(`   enabled: ${provider.enabled ? 'yes' : 'no'}`);
    console.log(`   active: ${provider.name === activeProvider ? 'yes' : 'no'}`);
    console.log(`   default_provider: ${provider.isDefault ? 'yes' : 'no'}`);
    console.log(`   default_model: ${provider.default_model}`);
    console.log(`   base_model: ${provider.model}`);
    if (provider.base_url) {
      console.log(`   base_url: ${provider.base_url}`);
    }
    if (provider.api_base_url) {
      console.log(`   api_base_url: ${provider.api_base_url}`);
    }
    console.log(`   available_models: ${provider.available_models.length}`);
    if (Object.keys(provider.model_aliases ?? {}).length) {
      console.log(`   aliases: ${Object.entries(provider.model_aliases).map(([key, value]) => `${key} -> ${value}`).join(', ')}`);
    }
  });
};

const printProviderShow = (resolution) => {
  const { name, provider, default_provider, model_selection } = resolution;
  printSection(`Provider details: ${name}`, [
    `- type: ${provider.type}`,
    `- enabled: ${provider.enabled ? 'yes' : 'no'}`,
    `- default_provider: ${name === default_provider ? 'yes' : 'no'}`,
    `- transport: ${provider.transport ?? 'n/a'}`,
    `- base_model: ${provider.model}`,
    `- configured_default_model: ${provider.default_model ?? provider.model}`,
    `- persisted_default_model: ${model_selection.persisted_default_model ?? 'not set'}`,
    `- resolved_model: ${model_selection.resolved}`,
    `- requested_model: ${model_selection.requested ?? 'none'}`,
    `- task_type: ${model_selection.task_type ?? 'none'}`,
    `- alias_used: ${model_selection.alias_used ?? 'none'}`,
    `- available_models: ${formatList(model_selection.available_models)}`,
    `- task_preferences: ${formatList(model_selection.task_preferences)}`
  ]);

  if (provider.base_url) {
    console.log(`- base_url: ${provider.base_url}`);
  }
  if (provider.api_base_url) {
    console.log(`- api_base_url: ${provider.api_base_url}`);
  }
  if (Object.keys(provider.model_aliases ?? {}).length) {
    console.log(`- model_aliases: ${Object.entries(provider.model_aliases).map(([key, value]) => `${key} -> ${value}`).join(', ')}`);
  }
};

const printActiveProvider = (activeProvider) => {
  printSection('Active provider', [
    `- active_provider: ${activeProvider ?? 'not set'}`
  ]);
};

const printProviderStateSummary = (title, state) => {
  printSection(title, [
    `- provider: ${state.provider}`,
    `- active_provider: ${state.active_provider ?? 'not set'}`,
    `- connected: ${state.connected?.connected ? 'yes' : 'no'}`,
    `- connected_updated_at: ${state.connected?.updated_at ?? 'not available'}`,
    `- connected_type: ${state.connected?.type ?? 'not available'}`,
    `- default_model: ${state.default_model?.model ?? 'not set'}`,
    `- default_model_updated_at: ${state.default_model?.updated_at ?? 'not available'}`,
    `- discovered_models_updated_at: ${state.discovered_models?.updated_at ?? 'not available'}`,
    `- discovered_models: ${formatList(state.discovered_models?.models ?? [])}`
  ]);
};

const printProviderUse = (result) => {
  printSection('Active provider updated', [
    `- active_provider: ${result.active_provider}`,
    `- updated_at: ${result.updated_at ?? 'not available'}`
  ]);
};

const printProviderPresets = (presets, mode = 'detailed') => {
  const lines = [
    'Provider presets',
    `- total: ${presets.length}`,
    `- active_config_path: ${resolveDefaultProviderConfigPath()}`
  ];
  if (mode === 'plain') {
    console.log(lines.join('\n'));
    for (const item of presets) {
      console.log(`- ${item.key} :: ${item.label} :: ${item.description}`);
    }
    return;
  }
  printSection('Provider presets', lines.slice(1));
  for (const item of presets) {
    console.log('');
    console.log(`- key: ${item.key}`);
    console.log(`- label: ${item.label}`);
    console.log(`- description: ${item.description}`);
    console.log(`- default_base_url: ${item.defaults.base_url ?? item.defaults.api_base_url ?? 'not set'}`);
    console.log(`- default_model: ${item.defaults.model}`);
  }
};

const printProviderSetup = (result, mode = 'detailed') => {
  const lines = [
    'Provider configured',
    `- provider_name: ${result.provider_name}`,
    `- type: ${result.provider.type}`,
    `- base_url: ${result.provider.base_url ?? 'not set'}`,
    `- api_base_url: ${result.provider.api_base_url ?? 'not set'}`,
    `- model: ${result.provider.model}`,
    `- api_key_env: ${result.provider.api_key_env ?? 'not set'}`,
    `- default_provider: ${result.default_provider}`,
    `- config_path: ${result.path}`
  ];
  if (mode === 'plain') {
    console.log(lines.join('\n'));
    return;
  }
  printSection('Provider configured', lines.slice(1));
  if (result.provider.notes?.length) {
    console.log('');
    console.log('Notes');
    for (const item of result.provider.notes) {
      console.log(`- ${item}`);
    }
  }
};

const printStateSaveResult = (result, mode = 'detailed') => {
  const lines = [
    'Session state saved',
    `- summary: ${result.summary}`,
    `- current_project: ${result.current_project ?? 'not set'}`,
    `- path: ${result.path}`,
    `- vault_path: ${result.vault_path}`
  ];

  if (mode === 'plain') {
    console.log(lines.join('\n'));
    return;
  }

  printSection('Lucy QA state saved', lines.slice(1));
};

const printStateShowResult = (result, mode = 'detailed') => {
  const lines = [
    'Resume context',
    `- vault_path: ${result.vault_path}`,
    `- resumable: ${result.has_resumable_state ? 'yes' : 'no'}`,
    `- current_project: ${result.session.current_project ?? 'not set'}`,
    `- open_tasks: ${result.open_tasks.tasks.length}`,
    `- last_run: ${result.last_run.run_id ?? 'none'}`,
    `- recent_bug_drafts: ${result.last_bugs.bugs.length}`
  ];

  if (mode === 'plain') {
    console.log(lines.join('\n'));
    if (result.resume_text) {
      console.log(result.resume_text);
    }
    return;
  }

  printSection('Lucy QA resume context', lines.slice(1));
  if (result.resume_text) {
    console.log('');
    console.log(result.resume_text);
  }
  if (result.next_steps?.length) {
    console.log('');
    console.log('Suggested next steps');
    for (const step of result.next_steps) {
      console.log(`- ${step}`);
    }
  }
  if (mode === 'trace') {
    console.log('');
    console.log(`- state_dir: ${result.state_dir}`);
    console.log(`- recent_commands: ${(result.session.recent_commands ?? []).join(' | ') || 'none'}`);
  }
};

const printStartupStateResult = (result, mode = 'detailed') => {
  if (!result.has_resumable_state) {
    if (mode === 'plain') {
      console.log('No resumable Lucy QA session found.');
      return;
    }

    printSection('Lucy QA startup', [
      '- status: fresh start',
      '- No resumable session was found.',
      '- Start a new workflow with qa plan, qa run, or ask.'
    ]);
    console.log('');
    return;
  }

  const lines = [
    'Previous Lucy QA session found',
    `- project: ${result.session.current_project ?? 'not set'}`,
    `- open_tasks: ${result.open_tasks.tasks.length}`,
    `- last_run: ${result.last_run.run_id ?? 'none'}`,
    `- recent_bug_drafts: ${result.last_bugs.bugs.length}`
  ];

  if (mode === 'plain') {
    console.log(lines.join('\n'));
    if (result.resume_text) {
      console.log(result.resume_text);
    }
    console.log('Suggested actions: state resume | state new-session | state show');
    return;
  }

  printSection('Previous Lucy QA session found', lines.slice(1));
  if (result.resume_text) {
    console.log('');
    console.log(result.resume_text);
  }
  console.log('');
  console.log('Choose next action');
  console.log('- Resume previous session: lucy state resume');
  console.log('- Start a new session: lucy state new-session --project <name>');
  console.log('- Review full state first: lucy state show --trace');
};

const printStateResumeResult = (result, mode = 'detailed') => {
  const lines = [
    result.message,
    `- resumable: ${result.has_resumable_state ? 'yes' : 'no'}`,
    `- project: ${result.session.current_project ?? 'not set'}`,
    `- open_tasks: ${result.open_tasks.tasks.length}`,
    `- last_run: ${result.last_run.run_id ?? 'none'}`
  ];

  if (mode === 'plain') {
    console.log(lines.join('\n'));
    if (result.resume_text) {
      console.log(result.resume_text);
    }
    return;
  }

  printSection('Lucy QA resumed session', lines.slice(1));
  if (result.resume_text) {
    console.log('');
    console.log(result.resume_text);
  }
};

const printStateNewSessionResult = (result, mode = 'detailed') => {
  const lines = [
    result.message,
    `- current_project: ${result.session.current_project ?? 'not set'}`,
    `- archived_previous_session: ${result.archived_previous_session ? 'yes' : 'no'}`,
    `- open_tasks: ${result.open_tasks.tasks.length}`,
    `- history_path: ${result.history_path}`,
    `- archived_journal_path: ${result.archived_journal_path ?? 'none'}`
  ];

  if (mode === 'plain') {
    console.log(lines.join('\n'));
    return;
  }

  printSection('Lucy QA new session', lines.slice(1));
};

const printStateJournalResult = (result, mode = 'detailed') => {
  const lines = [
    'Session journal',
    `- current_project: ${result.current_project ?? 'not set'}`,
    `- entries: ${result.entry_count}`,
    `- decisions: ${result.decisions.length}`,
    `- unresolved: ${result.unresolved.length}`,
    `- updated_at: ${result.updated_at ?? 'not set'}`
  ];

  if (mode === 'plain') {
    console.log(lines.join('\n'));
    if (result.entries[0]?.summary) {
      console.log(`latest_summary: ${result.entries[result.entries.length - 1].summary}`);
    }
    return;
  }

  printSection('Lucy QA session journal', lines.slice(1));
  if (result.entries.length) {
    console.log('');
    console.log('Recent entries');
    for (const entry of result.entries.slice(-5)) {
      console.log(`- [${entry.event_type}] ${entry.summary}`);
    }
  }
  if (mode === 'trace') {
    console.log('');
    console.log(result.markdown);
  }
};

const persistSessionContext = async ({ summary, currentProject = null, recentCommands = [], openTasks = [], decisions = [], unresolved = [], artifacts = [], eventType = 'session-update', vaultPath = process.env.LUCY_QA_VAULT_PATH ?? null }) => {
  await runStateOpenTasksCommand({ tasks: openTasks, vaultPath });
  const snapshot = await runStateSaveSessionCommand({ summary, currentProject, recentCommands, vaultPath });
  await runStateJournalAppendCommand({
    eventType,
    summary,
    currentProject,
    commands: recentCommands,
    openTasks,
    decisions,
    unresolved,
    artifacts: [...artifacts, snapshot.history_path].filter(Boolean),
    vaultPath
  });
  const learning = await runQaSelfImprovementPass({
    summary,
    recentCommands,
    decisions,
    vaultPath
  });
  return {
    ...snapshot,
    learning
  };
};

const printMemorySaveResult = (result, mode = 'detailed') => {
  const lines = [
    'Memory note saved',
    `- title: ${result.title}`,
    `- category: ${result.category}`,
    `- path: ${result.path}`,
    `- vault_path: ${result.vault_path}`
  ];

  if (mode === 'plain') {
    console.log(lines.join('\n'));
    return;
  }

  printSection('Lucy QA memory note saved', lines.slice(1));
};

const printMemorySearchResult = (result, mode = 'detailed') => {
  const header = [
    'Memory search results',
    `- query: ${result.query}`,
    `- matches: ${result.results.length}`
  ];

  if (mode === 'plain') {
    console.log(header.join('\n'));
    for (const item of result.results) {
      console.log(`- ${item.title} (${item.category}) :: ${item.path}`);
    }
    return;
  }

  printSection('Lucy QA memory search', header.slice(1));
  for (const item of result.results) {
    console.log('');
    console.log(`- title: ${item.title}`);
    console.log(`- category: ${item.category}`);
    console.log(`- path: ${item.path}`);
    if (mode === 'trace') {
      console.log(`- score: ${item.score}`);
      console.log(`- content: ${item.content}`);
    }
  }
};

const printLearningResult = (result, mode = 'detailed') => {
  const lines = [
    'Lucy QA self-improvement loop',
    `- event_count: ${result.state.event_count}`,
    `- evaluation_interval: ${result.state.evaluation_interval}`,
    `- evaluations_count: ${result.state.evaluations_count}`,
    `- nudges_issued: ${result.state.nudges_issued}`,
    `- memory_notes: ${result.state.memory_notes.length}`,
    `- skills: ${result.state.skills.length}`,
    `- last_evaluation_at: ${result.state.last_evaluation_at ?? 'not set'}`,
    `- path: ${result.path}`
  ];
  if (mode === 'plain') {
    console.log(lines.join('\n'));
    for (const item of result.state.memory_notes) {
      console.log(`- memory: ${item.key} :: count=${item.occurrence_count}`);
    }
    for (const item of result.state.skills) {
      console.log(`- skill: ${item.key} :: count=${item.occurrence_count}`);
    }
    return;
  }
  printSection('Lucy QA self-improvement loop', lines.slice(1));
  if (result.state.memory_notes.length) {
    console.log('');
    console.log('Memory notes');
    for (const item of result.state.memory_notes) {
      console.log(`- ${item.title}: ${item.content} (count=${item.occurrence_count})`);
    }
  }
  if (result.state.skills.length) {
    console.log('');
    console.log('Reusable skills');
    for (const item of result.state.skills) {
      console.log(`- ${item.name}: ${item.workflow} (count=${item.occurrence_count})`);
    }
  }
  if (result.state.recent_evaluations?.length) {
    console.log('');
    console.log('Recent evaluations');
    for (const item of result.state.recent_evaluations.slice(-5)) {
      console.log(`- ${item.timestamp}: ${item.nudge}`);
    }
  }
};

const printReportResult = (result, mode = 'detailed') => {
  const lines = [
    'QA report generated',
    `- run_dir: ${result.run_dir}`,
    `- report_path: ${result.report_path}`,
    `- execution_profile: ${result.execution_profile?.mode ?? 'unknown'}`,
    `- knowledge_project_key: ${result.report_insights?.knowledge_project_key ?? 'none'}`,
    `- total: ${result.summary.total}`,
    `- passed: ${result.summary.passed}`,
    `- failed: ${result.summary.failed}`,
    `- skipped: ${result.summary.skipped}`,
    `- flaky: ${result.summary.flaky}`,
    `- recurring_failures: ${result.failure_intelligence?.recurring_failures?.length ?? 0}`,
    `- likely_flaky_failures: ${result.failure_intelligence?.likely_flaky?.length ?? 0}`,
    `- defect_candidates: ${result.defect_clusters?.defect_candidates?.length ?? 0}`,
    `- linked_defect_candidates: ${result.report_insights?.linked_defect_candidates?.length ?? 0}`,
    `- annotated_screenshots: ${result.annotated_screenshots?.length ?? 0}`,
    `- videos: ${result.artifacts.videos.length}`,
    `- traces: ${result.artifacts.traces.length}`,
    `- screenshots: ${result.artifacts.screenshots.length}`
  ];

  if (mode === 'plain') {
    console.log(lines.join('\n'));
    if (result.failure_summary.length) {
      console.log('failures:');
      for (const item of result.failure_summary) {
        console.log(`- ${item}`);
      }
    }
    return;
  }

  printSection('Lucy QA report', lines.slice(1));
  if (result.stdout_path) {
    console.log(`- stdout_path: ${result.stdout_path}`);
  }
  if (result.stderr_path) {
    console.log(`- stderr_path: ${result.stderr_path}`);
  }
  if (result.intake_path) {
    console.log(`- intake_path: ${result.intake_path}`);
  }
  if (result.knowledge_path) {
    console.log(`- knowledge_path: ${result.knowledge_path}`);
  }
  if (result.execution_profile?.rationale) {
    console.log(`- execution_rationale: ${result.execution_profile.rationale}`);
  }
  if (result.failure_summary.length) {
    console.log('');
    console.log('Failure summary');
    for (const item of result.failure_summary) {
      console.log(`- ${item}`);
    }
  }
  if (result.failure_intelligence?.summary?.length) {
    console.log('');
    console.log('Failure intelligence');
    for (const item of result.failure_intelligence.summary) {
      console.log(`- ${item}`);
    }
  }
  if ((result.defect_clusters?.defect_candidates?.length ?? 0) > 0) {
    console.log('');
    console.log('Defect candidates');
    for (const item of result.defect_clusters.defect_candidates) {
      console.log(`- ${item.signature}: ${item.case_count} case(s), disposition=${item.disposition}${item.linked_bug_id ? `, linked_bug_id=${item.linked_bug_id}` : ''}`);
    }
  }
  if ((result.annotated_screenshots?.length ?? 0) > 0) {
    console.log('');
    console.log('Annotated screenshots');
    for (const item of result.annotated_screenshots) {
      console.log(`- ${item.case_title}: ${item.annotated_path} (${item.suggestion_source ?? 'unknown'})`);
    }
  }
  if (mode === 'trace') {
    console.log('');
    console.log('Artifacts');
    for (const video of result.artifacts.videos) {
      console.log(`- video: ${video}`);
    }
    for (const trace of result.artifacts.traces) {
      console.log(`- trace: ${trace}`);
    }
    for (const screenshot of result.artifacts.screenshots) {
      console.log(`- screenshot: ${screenshot}`);
    }
  }
};

const printBugsFromRunResult = (result, mode = 'detailed') => {
  const header = [
    'Lucy QA bug reports from run',
    `- run_dir: ${result.run_dir}`,
    `- total_failed_cases: ${result.total_failed_cases}`,
    `- total_defect_candidates: ${result.total_defect_candidates ?? result.bugs.length}`
  ];

  if (mode === 'plain') {
    console.log(header.join('\n'));
    for (const bug of result.bugs) {
      console.log('');
      console.log(`Defect signature: ${bug.defect_signature}`);
      console.log(`Cases: ${bug.case_titles.join(', ')}`);
      console.log(bug.report);
    }
    return;
  }

  printSection('Lucy QA bug reports from run', header.slice(1));
  for (const bug of result.bugs) {
    console.log('');
    console.log(`Defect signature: ${bug.defect_signature}`);
    console.log(`- disposition: ${bug.disposition}`);
    if (bug.linked_bug_id) {
      console.log(`- linked_bug_id: ${bug.linked_bug_id}`);
    }
    console.log(`- cases: ${bug.case_titles.join(', ')}`);
    console.log(`- project: ${bug.project}`);
    console.log(`- status: ${bug.status}`);
    console.log('');
    console.log(bug.report);
  }
};

const printBugResult = (result, mode = 'detailed') => {
  if (mode === 'plain') {
    console.log(result.report);
    return;
  }

  printSection('Lucy QA bug report', [
    `- finding: ${result.finding}`,
    `- title: ${result.title}`
  ]);
  console.log('');
  console.log(result.report);

  if (mode === 'trace') {
    console.log('');
    console.log('Trace');
    console.log('- generation_mode: local-template');
  }
};

const printDefectsResult = (result, mode = 'detailed') => {
  if (result.remote_issue) {
    const lines = [
      'Lucy QA defect signature file-remote',
      `- project_key: ${result.project_key}`,
      `- signature: ${result.linkage.signature}`,
      `- tracker_system: ${result.tracker_system}`,
      `- issue_project: ${result.issue_project ?? 'not set'}`,
      `- linked_bug_id: ${result.linkage.linked_bug_id ?? 'none'}`,
      `- tracker_status: ${result.linkage.tracker_status ?? 'unknown'}`
    ];
    if (mode === 'plain') {
      console.log(lines.join('\n'));
      if (result.remote_issue.issue_url) console.log(`- tracker_url: ${result.remote_issue.issue_url}`);
      return;
    }
    printSection('Lucy QA defect signature file-remote', lines.slice(1));
    if (result.remote_issue.issue_url) console.log(`- tracker_url: ${result.remote_issue.issue_url}`);
    console.log('');
    console.log('Bug report sent');
    console.log(result.bug_report);
    return;
  }

  if (result.defect_signatures) {
    const lines = [
      'Lucy QA defect signatures',
      `- project_key: ${result.project_key}`,
      `- total: ${result.total}`
    ];
    if (mode === 'plain') {
      console.log(lines.join('\n'));
      for (const item of result.defect_signatures) {
        console.log(`- ${item.signature} :: bug=${item.linked_bug_id ?? 'none'} :: status=${item.status} :: tracker_status=${item.tracker_status ?? 'unknown'}`);
      }
      return;
    }
    printSection('Lucy QA defect signatures', lines.slice(1));
    for (const item of result.defect_signatures) {
      console.log('');
      console.log(`- signature: ${item.signature}`);
      console.log(`- summary: ${item.summary}`);
      console.log(`- linked_bug_id: ${item.linked_bug_id ?? 'none'}`);
      console.log(`- tracker_system: ${item.tracker_system ?? 'none'}`);
      console.log(`- tracker_status: ${item.tracker_status ?? 'unknown'}`);
      if (item.tracker_url) console.log(`- tracker_url: ${item.tracker_url}`);
    }
    return;
  }

  const item = result.defect_signature;
  const lines = [
    `Lucy QA defect signature ${result.action}`,
    `- project_key: ${result.project_key}`,
    `- signature: ${item.signature}`,
    `- linked_bug_id: ${item.linked_bug_id ?? 'none'}`,
    `- tracker_system: ${item.tracker_system ?? 'none'}`,
    `- tracker_status: ${item.tracker_status ?? 'unknown'}`,
    `- defect_status: ${item.status}`
  ];
  if (mode === 'plain') {
    console.log(lines.join('\n'));
    if (item.tracker_url) {
      console.log(`- tracker_url: ${item.tracker_url}`);
    }
    return;
  }
  printSection(`Lucy QA defect signature ${result.action}`, lines.slice(1));
  if (item.tracker_url) {
    console.log(`- tracker_url: ${item.tracker_url}`);
  }
};

const printQaPublishResult = (result, mode = 'detailed') => {
  const lines = [
    'Lucy QA test management publish',
    `- system: ${result.system}`,
    `- project_code: ${result.project_code}`,
    `- run_dir: ${result.run_dir}`,
    `- passed: ${result.summary.passed}`,
    `- failed: ${result.summary.failed}`,
    `- skipped: ${result.summary.skipped}`,
    `- flaky: ${result.summary.flaky}`,
    `- remote_run_id: ${result.remote_run.run_id ?? 'unknown'}`,
    `- completed: ${result.completion.completed ? 'yes' : 'no'}`
  ];
  if (mode === 'plain') {
    console.log(lines.join('\n'));
    if (result.remote_run.url) console.log(`- remote_run_url: ${result.remote_run.url}`);
    return;
  }
  printSection('Lucy QA test management publish', lines.slice(1));
  if (result.remote_run.url) console.log(`- remote_run_url: ${result.remote_run.url}`);
};

const printExecResult = (result, mode = 'detailed') => {
  const lines = [
    'QA exec completed',
    `- status: ${result.status}`,
    `- exit_code: ${result.exit_code}`,
    `- timed_out: ${result.timed_out ? 'yes' : 'no'}`,
    `- cwd: ${result.cwd}`,
    `- command: ${result.command}`,
    `- rtk: ${result.rtk_applied ? `active (resolved: ${result.resolved_command})` : 'not applied'}`
  ];

  if (mode === 'plain') {
    console.log(lines.join('\n'));
    console.log('stdout:');
    console.log(result.stdout.trimEnd());
    if (result.stderr.trim()) {
      console.log('stderr:');
      console.log(result.stderr.trimEnd());
    }
    return;
  }

  printSection('Lucy QA exec', lines.slice(1));
  console.log('');
  console.log('stdout');
  console.log(result.stdout.trimEnd());
  if (result.stderr.trim()) {
    console.log('');
    console.log('stderr');
    console.log(result.stderr.trimEnd());
  }
  if (mode === 'trace' && result.signal) {
    console.log('');
    console.log('Trace');
    console.log(`- signal: ${result.signal}`);
    console.log(`- timeout_ms: ${result.timeout_ms}`);
  }
};

const printRunResult = (result, mode = 'detailed') => {
  const lines = [
    'QA run completed',
    `- status: ${result.status}`,
    `- target: ${result.target}`,
    `- run_id: ${result.run_id}`,
    `- run_dir: ${result.run_dir}`,
    `- execution_profile: ${result.execution_profile?.mode ?? 'standard'}`,
    `- execution_workers: ${result.execution_profile?.workers ?? 1}`,
    `- total: ${result.summary.total}`,
    `- passed: ${result.summary.passed}`,
    `- failed: ${result.summary.failed}`,
    `- skipped: ${result.summary.skipped}`,
    `- flaky: ${result.summary.flaky}`,
    `- videos: ${result.artifacts.videos.length}`,
    `- traces: ${result.artifacts.traces.length}`,
    `- screenshots: ${result.artifacts.screenshots.length}`,
    `- rtk: ${result.command?.rtk_applied ? `active (runner: ${result.command.resolved_runner})` : 'not applied'}`
  ];

  if (mode === 'plain') {
    console.log(lines.join('\n'));
    return;
  }

  printSection('Lucy QA run', lines.slice(1));
  if (result.report_path) {
    console.log(`- report_path: ${result.report_path}`);
  }
  if (result.intake_path) {
    console.log(`- intake_path: ${result.intake_path}`);
  }
  if (result.docs_context_path) {
    console.log(`- docs_context_path: ${result.docs_context_path}`);
  }
  if (result.knowledge_path) {
    console.log(`- knowledge_path: ${result.knowledge_path}`);
  }
  if (result.knowledge_markdown_path) {
    console.log(`- knowledge_markdown_path: ${result.knowledge_markdown_path}`);
  }
  if (result.execution_profile?.rationale) {
    console.log(`- execution_rationale: ${result.execution_profile.rationale}`);
  }
  console.log(`- stdout_path: ${result.stdout_path}`);
  console.log(`- stderr_path: ${result.stderr_path}`);

  if (result.failure_summary.length) {
    console.log('');
    console.log('Failure summary');
    for (const item of result.failure_summary) {
      console.log(`- ${item}`);
    }
  }

  if (mode === 'trace') {
    console.log('');
    console.log('Artifacts');
    for (const video of result.artifacts.videos) {
      console.log(`- video: ${video}`);
    }
    for (const trace of result.artifacts.traces) {
      console.log(`- trace: ${trace}`);
    }
    for (const screenshot of result.artifacts.screenshots) {
      console.log(`- screenshot: ${screenshot}`);
    }
    console.log('');
    console.log('Command');
    console.log(`- runner: ${result.command.runner}`);
    console.log(`- args: ${result.command.args.join(' ')}`);
    console.log(`- cwd: ${result.command.cwd}`);
  }
};

const printDocsResult = (result, mode = 'detailed') => {
  const lines = [
    'Context7 docs results',
    `- query: ${result.query}`,
    `- engine: ${result.engine}`,
    `- matches: ${result.results.length}`,
    `- preferred_sources: ${result.preferred_sources.join(', ') || 'none'}`
  ];

  if (mode === 'plain') {
    console.log(lines.join('\n'));
    for (const item of result.results) {
      console.log(`- ${item.title} :: ${item.url}`);
    }
    return;
  }

  printSection('Lucy QA docs lookup', lines.slice(1));
  for (const item of result.results) {
    console.log('');
    console.log(`- title: ${item.title}`);
    console.log(`- source: ${item.source}`);
    console.log(`- url: ${item.url}`);
    console.log(`- excerpt: ${item.excerpt || 'not available'}`);
    if (mode === 'trace') {
      console.log(`- score: ${item.score}`);
    }
  }
};

const printAskResult = (result, mode = 'detailed', title = 'Lucy QA response') => {
  if (mode === 'plain') {
    console.log(result.response.text ?? '');
    return;
  }

  printSection(title, [
    `- provider: ${result.provider}`,
    `- resolved_model: ${result.model_selection.resolved}`,
    `- requested_model: ${result.model_selection.requested ?? 'none'}`,
    `- task_type: ${result.model_selection.task_type ?? 'none'}`,
    `- alias_used: ${result.model_selection.alias_used ?? 'none'}`,
    `- transport: ${result.response.transport ?? 'unknown'}`,
    `- implemented: ${result.response.implemented ? 'yes' : 'no'}`
  ]);

  if (result.response.endpoint) {
    console.log(`- endpoint: ${result.response.endpoint}`);
  }
  if (result.response.auth_source) {
    console.log(`- auth_source: ${result.response.auth_source}`);
  }
  if (result.response.status) {
    console.log(`- status: ${result.response.status}`);
  }
  if (result.response.finish_reason) {
    console.log(`- finish_reason: ${result.response.finish_reason}`);
  }
  if (result.response.usage) {
    const usage = result.response.usage;
    const usageBits = [
      usage.input_tokens ?? usage.prompt_tokens,
      usage.output_tokens ?? usage.completion_tokens,
      usage.total_tokens
    ].filter((value) => value !== undefined && value !== null);
    if (usageBits.length) {
      console.log(`- usage: ${JSON.stringify(usage)}`);
    }
  }

  console.log('');
  console.log('Assistant reply');
  console.log(result.response.text ?? '');

  if (mode === 'trace') {
    console.log('');
    console.log('Trace');
    if (result.response.id) {
      console.log(`- response_id: ${result.response.id}`);
    }
    if (result.response.object) {
      console.log(`- object: ${result.response.object}`);
    }
    if (result.response.created) {
      console.log(`- created: ${result.response.created}`);
    }
    if (result.response.raw?.output_file) {
      console.log(`- output_file: ${result.response.raw.output_file}`);
    }
    if (result.response.raw?.stderr) {
      console.log('');
      console.log('stderr');
      console.log(result.response.raw.stderr.trim());
    }
    if (result.response.raw?.stdout) {
      console.log('');
      console.log('stdout');
      console.log(result.response.raw.stdout.trim());
    }
    if (result.response.raw && !result.response.raw.stderr && !result.response.raw.stdout) {
      console.log('');
      console.log('raw');
      console.log(JSON.stringify(result.response.raw, null, 2));
    }
  }
};

const printAgentResult = (result, mode = 'detailed') => {
  if (result.kind === 'clarification') {
    const lines = [
      'Lucy QA autonomous agent',
      `- goal: ${result.goal}`,
      `- status: clarification-needed`,
      `- reason: ${result.reason}`
    ];
    if (mode === 'plain') {
      console.log(lines.join('\n'));
      for (const item of result.suggestions ?? []) {
        console.log(`- suggestion: ${item}`);
      }
      return;
    }
    printSection('Lucy QA autonomous agent', lines.slice(1));
    if (result.suggestions?.length) {
      console.log('');
      console.log('Suggestions');
      for (const item of result.suggestions) {
        console.log(`- ${item}`);
      }
    }
    return;
  }

  const lines = [
    'Lucy QA autonomous agent',
    `- goal: ${result.goal}`,
    `- action: ${result.intent.type}`,
    `- status: completed`
  ];
  if (mode === 'plain') {
    console.log(lines.join('\n'));
  } else {
    printSection('Lucy QA autonomous agent', lines.slice(1));
    console.log('');
  }

  if (result.kind === 'ask') {
    printAskResult(result.result, mode, result.title ?? 'Lucy QA autonomous response');
    return;
  }
  if (result.kind === 'report') {
    printReportResult(result.result, mode);
    return;
  }
  if (result.kind === 'bugs') {
    printBugsFromRunResult(result.result, mode);
    return;
  }
  if (result.kind === 'publish') {
    printQaPublishResult(result.result, mode);
    return;
  }
  if (result.kind === 'run') {
    printRunResult(result.result, mode);
  }
};

const getResolvedProviderConfig = (providerName) => resolveProvider(providerName).provider;
const getResolvedProviderConfigOrNull = (providerName) => {
  try {
    return getResolvedProviderConfig(providerName);
  } catch {
    return null;
  }
};

const normalizeProviderSetupText = (value = '') => String(value).trim().toLowerCase();

const inferConversationalProviderSetup = (inputText = '') => {
  const text = normalizeProviderSetupText(inputText);
  if (!text) {
    return null;
  }

  const setDefault = /\b(default|make it default|set default|use it by default)\b/.test(text);

  if (/\bgithub\s+copilot\b|\bcopilot\b/.test(text)) {
    return {
      preset: 'github-copilot',
      providerName: 'github-copilot',
      setDefault
    };
  }

  if (/\badacode\b/.test(text)) {
    return {
      preset: 'adacode',
      providerName: 'adacode',
      setDefault
    };
  }

  if (/\banthropic\b|\bclaude\b/.test(text)) {
    return {
      preset: 'anthropic',
      providerName: 'anthropic',
      setDefault
    };
  }

  if (/\bglm\b|zhipu|bigmodel/.test(text)) {
    return {
      preset: 'glm',
      providerName: 'glm',
      setDefault
    };
  }

  if (/\bminimax\b|mini\s*max/.test(text)) {
    return {
      preset: 'minimax',
      providerName: 'minimax',
      setDefault
    };
  }

  if (/\bcliproxyapi\b|\bcli\s*proxy\s*api\b|\bproxy\b/.test(text)) {
    return {
      preset: 'cliproxyapi',
      providerName: 'cliproxyapi',
      setDefault
    };
  }

  if (/\bopenai[-\s]?compatible\b|\bcustom endpoint\b|\bcustom provider\b/.test(text)) {
    return {
      preset: 'openai-compatible',
      providerName: 'custom-openai-compatible',
      setDefault
    };
  }

  return null;
};

if (args.length === 0) {
  const vaultPath = process.env.LUCY_QA_VAULT_PATH ?? null;
  const startupState = await runStateStartupCommand({ vaultPath });
  printStartupStateResult(startupState);
  const showedFirstRunExperience = await maybePrintFirstRunExperience({ vaultPath, startupState });
  if (!showedFirstRunExperience) {
    await printOnboardingPrompt({ vaultPath, title: 'Lucy QA onboarding' });
  }
  console.log('');
  console.log('Lucy QA CLI');
  console.log('Available commands:');
  console.log('- auth status --provider <openai-codex|anthropic|github-copilot>');
  console.log('- auth login --provider openai-codex [--method manual-oauth|device|browser]');
  console.log('- auth login --provider anthropic [--method manual-oauth]');
  console.log('- auth login --provider github-copilot [--api-key-env <ENV>] [--base-url <url>] [--model <model>] [--label <text>] [--set-default]');
  console.log('- auth complete --provider <openai-codex|anthropic> "<callback-url>"');
  console.log('- auth pending --provider <openai-codex|anthropic>');
  console.log('- provider list');
  console.log('- provider show <name> [--model <model-or-alias>] [--task <task>]');
  console.log('- provider active');
  console.log('- provider presets [--plain|--detailed]');
  console.log('- provider connect <name>');
  console.log('- provider setup <name> --preset <openai-compatible|cliproxyapi|adacode|anthropic|github-copilot|glm|minimax> [--base-url <url>] [--api-key-env <ENV>] [--model <model>] [--label <text>] [--set-default] [--plain|--detailed]');
  console.log('- provider setup "use github copilot and make it default" [--plain|--detailed]');
  console.log('- provider use <name>');
  console.log('- provider models <name>');
  console.log('- provider default-model <name> <model>');
  console.log('- ask <prompt> [--provider <provider>] [--model <model-or-alias>] [--task <qa|research|coding|uiux>] [--plain|--detailed|--trace]');
  console.log('- agent <goal> [--provider <provider>] [--model <model-or-alias>] [--vault <path>] [--plain|--detailed|--trace]');
  console.log('- docs <query> [--limit <n>] [--plain|--detailed|--trace]');
  console.log('- state startup [--vault <path>] [--plain|--detailed]');
  console.log('- state save-session <summary> [--project <name>] [--vault <path>] [--plain|--detailed]');
  console.log('- state open-tasks <task> [more tasks...] [--vault <path>] [--plain|--detailed]');
  console.log('- state show [--vault <path>] [--plain|--detailed|--trace]');
  console.log('- state journal [--vault <path>] [--plain|--detailed|--trace]');
  console.log('- state resume [--vault <path>] [--plain|--detailed]');
  console.log('- state new-session [--project <name>] [--vault <path>] [--plain|--detailed]');
  console.log('- memory save <title> --content <text> [--category <name>] [--vault <path>] [--plain|--detailed]');
  console.log('- memory search <query> [--vault <path>] [--limit <n>] [--plain|--detailed|--trace]');
  console.log('- qa onboarding [--qa-test-management <name>] [--qa-project <code>] [--issue-tracker <name>] [--issue-project <key-or-team>] [--preferred-bug-workflow <text>] [--jira-base-url <url>] [--jira-email <email>] [--jira-api-token <token>] [--qase-base-url <url>] [--qase-api-token <token>] [--test-connections] [--vault <path>] [--plain|--detailed]');
  console.log('- qa onboarding "we use qase project WEB and jira project QA" [--vault <path>] [--plain|--detailed]');
  console.log('- qa learning [--vault <path>] [--plain|--detailed]');
  console.log('- qa agent <goal> [--provider <provider>] [--model <model-or-alias>] [--vault <path>] [--plain|--detailed|--trace]');
  console.log('- qa plan <goal> [--target-url <url>] [--provider <provider>] [--model <model-or-alias>] [--plain|--detailed|--trace]');
  console.log('- qa cases <goal> [--target-url <url>] [--provider <provider>] [--model <model-or-alias>] [--plain|--detailed|--trace]');
  console.log('- qa playwright <goal> [--target-url <url>] [--provider <provider>] [--model <model-or-alias>] [--plain|--detailed|--trace]');
  console.log('- qa run <spec-or-folder> [--base-url <url>] [--artifacts-root <path>] [--plain|--detailed|--trace]');
  console.log('- qa report <run-dir> [--plain|--detailed|--trace]');
  console.log('- qa report publish <run-dir> [--to qase] [--project <code>] [--title <title>] [--close-run] [--vault <path>] [--plain|--detailed|--trace]');
  console.log('- qa bug <finding> [--plain|--detailed|--trace]');
  console.log('- qa bugs --from-run <run-dir> [--plain|--detailed|--trace]');
  console.log('- qa defects list [--target-url <url>] [--vault <path>] [--plain|--detailed|--trace]');
  console.log('- qa defects link <signature> --bug-id <id> [--tracker <system>] [--tracker-url <url>] [--tracker-title <title>] [--tracker-status <status>] [--status <defect-status>] [--target-url <url>] [--vault <path>] [--plain|--detailed|--trace]');
  console.log('- qa defects update <signature> [--bug-id <id>] [--tracker <system>] [--tracker-url <url>] [--tracker-title <title>] [--tracker-status <status>] [--status <defect-status>] [--target-url <url>] [--vault <path>] [--plain|--detailed|--trace]');
  console.log('- qa defects file-remote <signature> [--tracker <system>] [--project <key>] [--issue-type <name>] [--title <title>] [--target-url <url>] [--vault <path>] [--plain|--detailed|--trace]');
  console.log('- qa exec <command> [--cwd <path>] [--timeout <ms>] [--plain|--detailed|--trace]');
  console.log('- rtk status');
  process.exit(0);
}

if (args[0] === 'auth' && args[1] === 'status') {
  const providerName = readFlag('--provider') ?? 'openai-codex';
  if (providerName === 'openai-codex') {
    printAuthStatus(authCodexStatus(getResolvedProviderConfig(providerName)));
    console.log('');
    await printOnboardingPrompt({ title: 'Lucy QA onboarding after login check' });
    process.exit(0);
  }
  if (providerName === 'anthropic') {
    printAnthropicAuthStatus(authAnthropicStatus(getResolvedProviderConfig(providerName)));
    console.log('');
    await printOnboardingPrompt({ title: 'Lucy QA onboarding after login check' });
    process.exit(0);
  }
  if (providerName === 'github-copilot') {
    printGitHubCopilotAuthStatus(authGitHubCopilotStatus(getResolvedProviderConfigOrNull(providerName) ?? {}));
    console.log('');
    await printOnboardingPrompt({ title: 'Lucy QA onboarding after login check' });
    process.exit(0);
  }
  throw new Error(`Unsupported auth status provider: ${providerName}`);
}

if (args[0] === 'auth' && args[1] === 'pending') {
  const providerName = readFlag('--provider') ?? 'openai-codex';
  if (providerName === 'anthropic') {
    printAuthPending(getAnthropicManualOAuthStatus({ providerName }));
    process.exit(0);
  }
  printAuthPending(getOpenAICodexManualOAuthStatus({ providerName }));
  process.exit(0);
}

if (args[0] === 'auth' && args[1] === 'login') {
  const providerName = readFlag('--provider') ?? 'openai-codex';
  const method = readFlag('--method') ?? (providerName === 'github-copilot' ? 'env' : 'manual-oauth');
  const providerConfig = getResolvedProviderConfigOrNull(providerName) ?? {};

  if (providerName === 'openai-codex') {
    if (method === 'manual-oauth') {
      printAuthLoginManual(beginOpenAICodexManualOAuth({ providerName, providerConfig }));
      process.exit(0);
    }

    if (method === 'device') {
      printSimpleAuthMethod({
        provider: providerName,
        method: 'device',
        command: 'codex login --device-auth',
        note: 'Run this command in your shell to complete device authentication for headless environments.'
      });
      process.exit(0);
    }

    if (method === 'browser') {
      printSimpleAuthMethod({
        provider: providerName,
        method: 'browser',
        command: 'codex login',
        note: 'Run this command locally when a browser can open on the same machine.'
      });
      process.exit(0);
    }

    throw new Error(`Unsupported auth login method: ${method}`);
  }

  if (providerName === 'anthropic') {
    if (method !== 'manual-oauth') {
      throw new Error(`Unsupported auth login method for anthropic: ${method}`);
    }
    printAuthLoginManual(beginAnthropicManualOAuth({ providerName, providerConfig }));
    process.exit(0);
  }

  if (providerName === 'github-copilot') {
    if (method !== 'env') {
      throw new Error(`Unsupported auth login method for github-copilot: ${method}`);
    }
    const resolvedApiKeyEnv = resolveGitHubCopilotApiKeyEnv(providerConfig, readFlag('--api-key-env') ?? null);
    if (!resolvedApiKeyEnv.env_name || !resolvedApiKeyEnv.token_present) {
      throw new Error('No GitHub Copilot token found. Set COPILOT_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN, or pass --api-key-env <ENV> with a populated environment variable.');
    }
    const built = buildProviderFromPreset({
      preset: 'github-copilot',
      providerName,
      baseUrl: readFlag('--base-url') ?? null,
      model: readFlag('--model') ?? null,
      apiKeyEnv: resolvedApiKeyEnv.env_name,
      label: readFlag('--label') ?? null
    });
    const saved = saveProviderConfigEntry({
      providerName: built.name,
      providerConfig: built.config,
      setDefault: args.includes('--set-default')
    });
    printGitHubCopilotAuthReady(saved);
    process.exit(0);
  }

  throw new Error(`Unsupported auth login provider: ${providerName}`);
}

if (args[0] === 'auth' && args[1] === 'complete') {
  const providerName = readFlag('--provider') ?? 'openai-codex';
  const callbackUrl = positionalAfter(2).join(' ').trim();
  const result = providerName === 'anthropic'
    ? await completeAnthropicManualOAuth({ providerName, callbackUrl })
    : await completeOpenAICodexManualOAuth({ providerName, callbackUrl });
  printAuthComplete(result);
  console.log('');
  await printOnboardingPrompt({ title: 'Lucy QA onboarding after provider login' });
  process.exit(0);
}

if (args[0] === 'provider' && args[1] === 'list') {
  printProviderList(listProviders(), getActiveProvider());
  process.exit(0);
}

if (args[0] === 'provider' && args[1] === 'show') {
  const name = args[2];
  const model = readFlag('--model');
  const taskType = readFlag('--task');
  printProviderShow(resolveProvider(name, undefined, model, taskType));
  process.exit(0);
}

if (args[0] === 'provider' && args[1] === 'active') {
  printActiveProvider(getActiveProvider());
  process.exit(0);
}

if (args[0] === 'provider' && args[1] === 'presets') {
  const outputMode = args.includes('--plain') ? 'plain' : 'detailed';
  printProviderPresets(listProviderPresets(), outputMode);
  process.exit(0);
}

if (args[0] === 'provider' && args[1] === 'setup') {
  const outputMode = args.includes('--plain') ? 'plain' : 'detailed';
  const rawProviderName = args[2];
  const conversational = !readFlag('--preset') ? inferConversationalProviderSetup(rawProviderName) : null;
  const providerName = conversational?.providerName ?? rawProviderName;
  const preset = readFlag('--preset') ?? conversational?.preset ?? null;
  try {
    let apiKeyEnv = readFlag('--api-key-env') ?? null;
    if (!apiKeyEnv && preset === 'github-copilot') {
      const resolvedApiKeyEnv = resolveGitHubCopilotApiKeyEnv(getResolvedProviderConfigOrNull('github-copilot') ?? {}, null);
      apiKeyEnv = resolvedApiKeyEnv.env_name ?? null;
    }
    const built = buildProviderFromPreset({
      preset,
      providerName,
      baseUrl: readFlag('--base-url') ?? null,
      model: readFlag('--model') ?? null,
      apiKeyEnv,
      label: readFlag('--label') ?? null
    });
    const saved = saveProviderConfigEntry({
      providerName: built.name,
      providerConfig: built.config,
      setDefault: args.includes('--set-default') || Boolean(conversational?.setDefault)
    });
    await persistSessionContext({
      summary: `Configured provider ${saved.provider_name} from preset ${preset}.`,
      recentCommands: [`provider setup ${saved.provider_name}`],
      decisions: [`Use provider preset ${preset} for ${saved.provider_name}.`],
      openTasks: []
    });
    printProviderSetup(saved, outputMode);
    process.exit(0);
  } catch (error) {
    printSection('Provider setup failed', [
      `- provider_name: ${providerName ?? 'not provided'}`,
      `- preset: ${preset ?? 'not provided'}`,
      `- error: ${error.message}`
    ]);
    process.exit(1);
  }
}

if (args[0] === 'provider' && args[1] === 'connect') {
  const name = args[2];
  printProviderStateSummary('Provider connected', await connectProvider({ providerName: name }));
  process.exit(0);
}

if (args[0] === 'provider' && args[1] === 'use') {
  const name = args[2];
  printProviderUse(switchProvider({ providerName: name }));
  process.exit(0);
}

if (args[0] === 'provider' && args[1] === 'models') {
  const name = args[2];
  printProviderStateSummary('Provider models discovered', await discoverProviderModels({ providerName: name }));
  process.exit(0);
}

if (args[0] === 'provider' && args[1] === 'default-model') {
  const name = args[2];
  const model = args[3];
  printProviderStateSummary('Provider default model updated', await persistDefaultModel({ providerName: name, model }));
  process.exit(0);
}

if (args[0] === 'state' && args[1] === 'startup') {
  const outputMode = args.includes('--plain') ? 'plain' : 'detailed';
  const vaultPath = readFlag('--vault');
  printStartupStateResult(await runStateStartupCommand({ vaultPath }), outputMode);
  process.exit(0);
}

if (args[0] === 'state' && args[1] === 'save-session') {
  const outputMode = args.includes('--plain') ? 'plain' : 'detailed';
  const summary = positionalAfter(2).join(' ').trim();
  const currentProject = readFlag('--project');
  const vaultPath = readFlag('--vault');
  printStateSaveResult(await runStateSaveSessionCommand({ summary, currentProject, vaultPath }), outputMode);
  process.exit(0);
}

if (args[0] === 'state' && args[1] === 'open-tasks') {
  const outputMode = args.includes('--plain') ? 'plain' : 'detailed';
  const tasks = positionalAfter(2);
  const vaultPath = readFlag('--vault');
  const result = await runStateOpenTasksCommand({ tasks, vaultPath });
  printSection(outputMode === 'plain' ? 'Open tasks saved' : 'Lucy QA open tasks saved', [
    `- tasks: ${result.tasks.length}`,
    `- path: ${result.path}`
  ]);
  process.exit(0);
}

if (args[0] === 'state' && args[1] === 'show') {
  const outputMode = args.includes('--plain') ? 'plain' : args.includes('--trace') ? 'trace' : 'detailed';
  const vaultPath = readFlag('--vault');
  printStateShowResult(await runStateShowCommand({ vaultPath }), outputMode);
  process.exit(0);
}

if (args[0] === 'state' && args[1] === 'journal') {
  const outputMode = args.includes('--plain') ? 'plain' : args.includes('--trace') ? 'trace' : 'detailed';
  const vaultPath = readFlag('--vault');
  printStateJournalResult(await runStateJournalCommand({ vaultPath }), outputMode);
  process.exit(0);
}

if (args[0] === 'state' && args[1] === 'resume') {
  const outputMode = args.includes('--plain') ? 'plain' : 'detailed';
  const vaultPath = readFlag('--vault');
  printStateResumeResult(await runStateResumeCommand({ vaultPath }), outputMode);
  process.exit(0);
}

if (args[0] === 'state' && args[1] === 'new-session') {
  const outputMode = args.includes('--plain') ? 'plain' : 'detailed';
  const projectName = readFlag('--project');
  const vaultPath = readFlag('--vault');
  printStateNewSessionResult(await runStateStartNewSessionCommand({ projectName, vaultPath }), outputMode);
  process.exit(0);
}

if (args[0] === 'memory' && args[1] === 'save') {
  const outputMode = args.includes('--plain') ? 'plain' : 'detailed';
  const title = positionalAfter(2).join(' ').trim();
  const content = readFlag('--content');
  const category = readFlag('--category') ?? 'general';
  const vaultPath = readFlag('--vault');
  printMemorySaveResult(await runMemorySaveCommand({ title, content, category, vaultPath }), outputMode);
  process.exit(0);
}

if (args[0] === 'memory' && args[1] === 'search') {
  const outputMode = args.includes('--plain') ? 'plain' : args.includes('--trace') ? 'trace' : 'detailed';
  const query = positionalAfter(2).join(' ').trim();
  const vaultPath = readFlag('--vault');
  const limit = Number(readFlag('--limit') ?? '10');
  printMemorySearchResult(await runMemorySearchCommand({ query, vaultPath, limit }), outputMode);
  process.exit(0);
}

if (args[0] === 'agent' || (args[0] === 'qa' && args[1] === 'agent')) {
  const providerName = readFlag('--provider');
  const model = readFlag('--model');
  const outputMode = args.includes('--plain') ? 'plain' : args.includes('--trace') ? 'trace' : 'detailed';
  const vaultPath = readFlag('--vault');
  const goal = args[0] === 'agent' ? positionalAfter(1).join(' ').trim() : positionalAfter(2).join(' ').trim();
  try {
    const result = await runQaAgentCommand({ goal, providerName, model, vaultPath });
    await persistSessionContext({
      ...(result.session_update ?? {
        summary: `Lucy QA agent handled: ${goal}.`,
        recentCommands: [`agent ${goal}`],
        openTasks: []
      }),
      vaultPath
    });
    printAgentResult(result, outputMode);
    process.exit(0);
  } catch (error) {
    printSection('Lucy QA autonomous agent failed', [
      `- provider: ${providerName ?? getActiveProvider() ?? 'default'}`,
      `- model: ${model ?? 'auto'}`,
      `- goal: ${goal || 'not provided'}`,
      `- error: ${error.message}`
    ]);
    process.exit(1);
  }
}

if (args[0] === 'ask') {
  const providerName = readFlag('--provider');
  const model = readFlag('--model');
  const taskType = readFlag('--task');
  const outputMode = args.includes('--plain') ? 'plain' : args.includes('--trace') ? 'trace' : 'detailed';
  const prompt = positionalAfter(1).join(' ').trim();
  try {
    const result = await runAskCommand({ prompt, providerName, model, taskType });
    await persistSessionContext({
      summary: `Asked Lucy QA to help with: ${prompt}.`,
      recentCommands: [`ask ${prompt}`],
      openTasks: []
    });
    printAskResult(result, outputMode);
    process.exit(0);
  } catch (error) {
    printSection('Lucy QA request failed', [
      `- provider: ${providerName ?? getActiveProvider() ?? 'default'}`,
      `- model: ${model ?? 'auto'}`,
      `- task_type: ${taskType ?? 'none'}`,
      `- error: ${error.message}`
    ]);
    console.log('');
    console.log('Tip');
    console.log('- If the active provider is a local proxy like gcli2api, make sure the server is running.');
    console.log('- Or switch back to Codex with: lucy provider use openai-codex');
    process.exit(1);
  }
}

if (args[0] === 'docs') {
  const outputMode = args.includes('--plain') ? 'plain' : args.includes('--trace') ? 'trace' : 'detailed';
  const query = positionalAfter(1).join(' ').trim();
  const limit = Number(readFlag('--limit') ?? '5');
  try {
    const result = await runDocsCommand({ query, limit });
    await persistSessionContext({
      summary: `Looked up current docs for: ${query}.`,
      recentCommands: [`docs ${query}`],
      openTasks: result.results.length ? [] : [`Try refining the docs query: ${query}.`],
      decisions: result.results.length ? [`Use current documentation results before generating framework-heavy output for: ${query}.`] : [],
      unresolved: result.results.length ? [] : [`No docs hits found yet for: ${query}.`],
      artifacts: result.results.map((item) => item.url),
      eventType: 'docs-lookup'
    });
    printDocsResult(result, outputMode);
    process.exit(0);
  } catch (error) {
    printSection('Lucy QA docs lookup failed', [
      `- query: ${query || 'not provided'}`,
      `- error: ${error.message}`
    ]);
    process.exit(1);
  }
}

if (args[0] === 'qa' && args[1] === 'onboarding') {
  const outputMode = args.includes('--plain') ? 'plain' : 'detailed';
  const vaultPath = readFlag('--vault');
  const conversational = inferQaOnboardingFromConversation(positionalAfter(2).join(' '));
  const result = await runQaOnboardingCommand({
    qaTestManagement: readFlag('--qa-test-management') ?? conversational?.qaTestManagement ?? undefined,
    qaProject: readFlag('--qa-project') ?? conversational?.qaProject ?? undefined,
    issueTracker: readFlag('--issue-tracker') ?? conversational?.issueTracker ?? undefined,
    issueProject: readFlag('--issue-project') ?? conversational?.issueProject ?? undefined,
    preferredBugWorkflow: readFlag('--preferred-bug-workflow') ?? conversational?.preferredBugWorkflow ?? undefined,
    jiraBaseUrl: readFlag('--jira-base-url') ?? undefined,
    jiraEmail: readFlag('--jira-email') ?? undefined,
    jiraApiToken: readFlag('--jira-api-token') ?? undefined,
    qaseBaseUrl: readFlag('--qase-base-url') ?? undefined,
    qaseApiToken: readFlag('--qase-api-token') ?? undefined,
    testConnections: args.includes('--test-connections'),
    vaultPath
  });
  await persistSessionContext({
    summary: `Updated Lucy QA onboarding and integration readiness for QA systems.`,
    recentCommands: ['qa onboarding'],
    decisions: [
      result.profile.qa_test_management ? `QA test management set to ${result.profile.qa_test_management}.` : null,
      result.profile.issue_tracker ? `Issue tracker set to ${result.profile.issue_tracker}.` : null
    ].filter(Boolean),
    openTasks: result.connection_tests?.some((item) => !item.success)
      ? ['Fix failed integration connection tests before syncing defects or publishing runs.']
      : [] ,
    vaultPath
  });
  if (outputMode === 'plain') {
    console.log(`configured: ${result.configured ? 'yes' : 'no'}`);
    console.log(`path: ${result.path}`);
    console.log(`qa_test_management: ${result.profile.qa_test_management ?? 'not set'}`);
    console.log(`qa_project: ${result.profile.qa_project ?? 'not set'}`);
    console.log(`issue_tracker: ${result.profile.issue_tracker ?? 'not set'}`);
    console.log(`issue_project: ${result.profile.issue_project ?? 'not set'}`);
    console.log(`preferred_bug_workflow: ${result.profile.preferred_bug_workflow ?? 'not set'}`);
    console.log(`credentials_path: ${result.integrations.path}`);
    console.log(`jira_ready: ${result.integrations.readiness.jira.ready ? 'yes' : 'no'}`);
    console.log(`qase_ready: ${result.integrations.readiness.qase.ready ? 'yes' : 'no'}`);
    console.log(`jira_api_token: ${result.integrations.masked.jira.api_token}`);
    console.log(`qase_api_token: ${result.integrations.masked.qase.api_token}`);
    for (const item of result.connection_tests ?? []) {
      console.log(`connection_test: ${item.system}:${item.success ? 'success' : 'failed'}${item.reason ? `:${item.reason}` : ''}`);
    }
    for (const question of result.questions ?? []) {
      console.log(`question: ${question}`);
    }
  } else {
    printSection('Lucy QA onboarding', [
      `- configured: ${result.configured ? 'yes' : 'no'}`,
      `- path: ${result.path}`,
      `- qa_test_management: ${result.profile.qa_test_management ?? 'not set'}`,
      `- qa_project: ${result.profile.qa_project ?? 'not set'}`,
      `- issue_tracker: ${result.profile.issue_tracker ?? 'not set'}`,
      `- issue_project: ${result.profile.issue_project ?? 'not set'}`,
      `- preferred_bug_workflow: ${result.profile.preferred_bug_workflow ?? 'not set'}`,
      `- credentials_path: ${result.integrations.path}`,
      `- jira_ready: ${result.integrations.readiness.jira.ready ? 'yes' : 'no'}`,
      `- qase_ready: ${result.integrations.readiness.qase.ready ? 'yes' : 'no'}`,
      `- jira_api_token: ${result.integrations.masked.jira.api_token}`,
      `- qase_api_token: ${result.integrations.masked.qase.api_token}`
    ]);
    if (result.connection_tests?.length) {
      console.log('');
      console.log('Connection tests');
      for (const item of result.connection_tests) {
        console.log(`- ${item.system}: ${item.success ? 'success' : `failed (${item.reason ?? 'unknown'})`}`);
      }
    }
    if (result.questions?.length) {
      console.log('');
      console.log('Questions');
      for (const question of result.questions) {
        console.log(`- ${question}`);
      }
    }
  }
  process.exit(0);
}

if (args[0] === 'qa' && args[1] === 'learning') {
  const outputMode = args.includes('--plain') ? 'plain' : 'detailed';
  const vaultPath = readFlag('--vault');
  printLearningResult(await loadQaLearningState({ vaultPath }), outputMode);
  process.exit(0);
}

if (args[0] === 'qa' && args[1] === 'plan') {
  const providerName = readFlag('--provider');
  const model = readFlag('--model');
  const targetUrl = readFlag('--target-url');
  const outputMode = args.includes('--plain') ? 'plain' : args.includes('--trace') ? 'trace' : 'detailed';
  const goal = positionalAfter(2).join(' ').trim();
  try {
    const result = await runQaPlanCommand({ goal, targetUrl, providerName, model, taskType: 'qa' });
    await persistSessionContext({
      summary: `Created a QA plan for: ${goal}.`,
      recentCommands: [`qa plan ${goal}`],
      openTasks: [`Review the generated QA plan for: ${goal}.`]
    });
    printAskResult(result, outputMode, 'Lucy QA plan');
    process.exit(0);
  } catch (error) {
    printSection('Lucy QA plan failed', [
      `- provider: ${providerName ?? getActiveProvider() ?? 'default'}`,
      `- model: ${model ?? 'auto'}`,
      `- error: ${error.message}`
    ]);
    console.log('');
    console.log('Tip');
    console.log('- Try provider use openai-codex if your local proxy is not running.');
    process.exit(1);
  }
}

if (args[0] === 'qa' && args[1] === 'cases') {
  const providerName = readFlag('--provider');
  const model = readFlag('--model');
  const targetUrl = readFlag('--target-url');
  const outputMode = args.includes('--plain') ? 'plain' : args.includes('--trace') ? 'trace' : 'detailed';
  const goal = positionalAfter(2).join(' ').trim();
  try {
    const result = await runQaCasesCommand({ goal, targetUrl, providerName, model, taskType: 'qa' });
    await persistSessionContext({
      summary: `Generated atomic QA cases for: ${goal}.`,
      recentCommands: [`qa cases ${goal}`],
      openTasks: [`Review and refine the generated QA cases for: ${goal}.`]
    });
    printAskResult(result, outputMode, 'Lucy QA test cases');
    process.exit(0);
  } catch (error) {
    printSection('Lucy QA test case generation failed', [
      `- provider: ${providerName ?? getActiveProvider() ?? 'default'}`,
      `- model: ${model ?? 'auto'}`,
      `- error: ${error.message}`
    ]);
    console.log('');
    console.log('Tip');
    console.log('- Try provider use openai-codex if your local proxy is not running.');
    process.exit(1);
  }
}

if (args[0] === 'qa' && args[1] === 'playwright') {
  const providerName = readFlag('--provider');
  const model = readFlag('--model');
  const targetUrl = readFlag('--target-url');
  const outputMode = args.includes('--plain') ? 'plain' : args.includes('--trace') ? 'trace' : 'detailed';
  const goal = positionalAfter(2).join(' ').trim();
  try {
    const result = await runQaPlaywrightCommand({ goal, targetUrl, providerName, model, taskType: 'qa' });
    await persistSessionContext({
      summary: `Generated a Playwright starter for: ${goal}.`,
      recentCommands: [`qa playwright ${goal}`],
      openTasks: [`Review, save, or adapt the generated Playwright starter for: ${goal}.`]
    });
    printAskResult(result, outputMode, 'Lucy QA Playwright spec');
    process.exit(0);
  } catch (error) {
    printSection('Lucy QA Playwright generation failed', [
      `- provider: ${providerName ?? getActiveProvider() ?? 'default'}`,
      `- model: ${model ?? 'auto'}`,
      `- error: ${error.message}`
    ]);
    console.log('');
    console.log('Tip');
    console.log('- Try provider use openai-codex if your local proxy is not running.');
    process.exit(1);
  }
}

if (args[0] === 'qa' && args[1] === 'run') {
  const outputMode = args.includes('--plain') ? 'plain' : args.includes('--trace') ? 'trace' : 'detailed';
  const target = positionalAfter(2).join(' ').trim();
  const baseURL = readFlag('--base-url');
  const artifactsRoot = readFlag('--artifacts-root') ?? 'artifacts/playwright';
  try {
    const result = await runQaRunCommand({ target, baseURL, artifactsRoot });
    await runStateSaveLastRun({
      runId: result.run_id,
      runDir: result.run_dir,
      status: result.status,
      target: result.target,
      reportPath: result.report_path,
      vaultPath: process.env.LUCY_QA_VAULT_PATH ?? null
    });
    await persistSessionContext({
      summary: `Latest QA run ${result.run_id} finished with status ${result.status} for ${result.target}.`,
      recentCommands: [`qa run ${result.target}`],
      openTasks: result.status === 'failed'
        ? [
            `Investigate failed QA run ${result.run_id}.`,
            `Review report at ${result.run_dir}.`,
            `Draft or review bugs from run ${result.run_id}.`
          ]
        : [
            `Review or archive QA run ${result.run_id}.`
          ]
    });
    printRunResult(result, outputMode);
    process.exit(0);
  } catch (error) {
    printSection('Lucy QA run failed', [
      `- target: ${target || 'not provided'}`,
      `- base_url: ${baseURL ?? 'not set'}`,
      `- artifacts_root: ${artifactsRoot}`,
      `- error: ${error.message}`
    ]);
    console.log('');
    console.log('Tip');
    console.log('- Make sure Playwright is installed or set LUCY_QA_RUNNER_COMMAND/LUCY_QA_RUNNER_ARGS_JSON for a custom runner.');
    console.log('- For browser runs, you may also need: npx playwright install chromium');
    process.exit(1);
  }
}

if (args[0] === 'qa' && args[1] === 'report' && args[2] !== 'publish') {
  const outputMode = args.includes('--plain') ? 'plain' : args.includes('--trace') ? 'trace' : 'detailed';
  const runDir = positionalAfter(2).join(' ').trim();
  try {
    const result = await runQaReportCommand({ runDir });
    await persistSessionContext({
      summary: `Reviewed QA report from ${result.run_dir} with ${result.summary.failed} failed cases out of ${result.summary.total}.`,
      recentCommands: [`qa report ${result.run_dir}`],
      openTasks: result.summary.failed > 0
        ? [
            `Investigate the ${result.summary.failed} failed case(s) in ${result.run_dir}.`,
            `Draft or review bugs from run ${result.run_dir}.`
          ]
        : [
            `Archive or share QA report for ${result.run_dir}.`
          ]
    });
    printReportResult(result, outputMode);
    process.exit(0);
  } catch (error) {
    printSection('Lucy QA report failed', [
      `- run_dir: ${runDir || 'not provided'}`,
      `- error: ${error.message}`
    ]);
    process.exit(1);
  }
}

if (args[0] === 'qa' && args[1] === 'report' && args[2] === 'publish') {
  const outputMode = args.includes('--plain') ? 'plain' : args.includes('--trace') ? 'trace' : 'detailed';
  const runDir = positionalAfter(3).join(' ').trim();
  const vaultPath = readFlag('--vault');
  try {
    const result = await publishQaRunToTestManagement({
      runDir,
      system: readFlag('--to') ?? 'auto',
      projectCode: readFlag('--project') ?? null,
      title: readFlag('--title') ?? null,
      completeRun: args.includes('--close-run'),
      vaultPath
    });
    printQaPublishResult(result, outputMode);
    process.exit(0);
  } catch (error) {
    printSection('Lucy QA report publish failed', [
      `- run_dir: ${runDir || 'not provided'}`,
      `- error: ${error.message}`
    ]);
    process.exit(1);
  }
}

if (args[0] === 'qa' && args[1] === 'bug') {
  const outputMode = args.includes('--plain') ? 'plain' : args.includes('--trace') ? 'trace' : 'detailed';
  const finding = positionalAfter(2).join(' ').trim();
  try {
    const result = await runQaBugCommand({ finding });
    await runStateSaveLastBugs({
      bugs: [{ title: result.title, finding: result.finding }],
      sourceRunDir: null,
      vaultPath: process.env.LUCY_QA_VAULT_PATH ?? null
    });
    await persistSessionContext({
      summary: `Drafted 1 bug report for finding: ${result.title}.`,
      recentCommands: [`qa bug ${result.finding}`],
      openTasks: [`Review and file the drafted bug report: ${result.title}.`]
    });
    printBugResult(result, outputMode);
    process.exit(0);
  } catch (error) {
    printSection('Lucy QA bug generation failed', [
      `- finding: ${finding || 'not provided'}`,
      `- error: ${error.message}`
    ]);
    process.exit(1);
  }
}

if (args[0] === 'qa' && args[1] === 'bugs' && args.includes('--from-run')) {
  const outputMode = args.includes('--plain') ? 'plain' : args.includes('--trace') ? 'trace' : 'detailed';
  const runDir = readFlag('--from-run');
  try {
    const result = await runQaBugsFromRunCommand({ runDir });
    await runStateSaveLastBugs({
      bugs: result.bugs.map((item) => ({ title: item.title, case_title: item.case_title })),
      sourceRunDir: result.run_dir,
      vaultPath: process.env.LUCY_QA_VAULT_PATH ?? null
    });
    await persistSessionContext({
      summary: `Drafted ${result.total_failed_cases} bug reports from run ${result.run_dir}.`,
      recentCommands: [`qa bugs --from-run ${result.run_dir}`],
      openTasks: result.total_failed_cases > 0
        ? [`Review and file ${result.total_failed_cases} drafted bug report(s) from ${result.run_dir}.`]
        : [`No bug drafts were created from ${result.run_dir}; archive the run if complete.`]
    });
    printBugsFromRunResult(result, outputMode);
    process.exit(0);
  } catch (error) {
    printSection('Lucy QA bug generation from run failed', [
      `- run_dir: ${runDir || 'not provided'}`,
      `- error: ${error.message}`
    ]);
    process.exit(1);
  }
}

if (args[0] === 'qa' && args[1] === 'defects' && args[2] === 'list') {
  const outputMode = args.includes('--plain') ? 'plain' : args.includes('--trace') ? 'trace' : 'detailed';
  const targetUrl = readFlag('--target-url');
  const vaultPath = readFlag('--vault');
  try {
    printDefectsResult(await runQaDefectsListCommand({ targetUrl, vaultPath }), outputMode);
    process.exit(0);
  } catch (error) {
    printSection('Lucy QA defects list failed', [
      `- target_url: ${targetUrl ?? 'not set'}`,
      `- error: ${error.message}`
    ]);
    process.exit(1);
  }
}

if (args[0] === 'qa' && args[1] === 'defects' && args[2] === 'link') {
  const outputMode = args.includes('--plain') ? 'plain' : args.includes('--trace') ? 'trace' : 'detailed';
  const signature = positionalAfter(3).join(' ').trim();
  const bugId = readFlag('--bug-id');
  const trackerSystem = readFlag('--tracker') ?? 'generic';
  const trackerUrl = readFlag('--tracker-url');
  const trackerTitle = readFlag('--tracker-title');
  const trackerStatus = readFlag('--tracker-status') ?? 'open';
  const defectStatus = readFlag('--status') ?? 'open';
  const targetUrl = readFlag('--target-url');
  const vaultPath = readFlag('--vault');
  try {
    printDefectsResult(await runQaDefectsLinkCommand({
      signature,
      bugId,
      trackerSystem,
      trackerUrl,
      trackerTitle,
      trackerStatus,
      defectStatus,
      targetUrl,
      vaultPath
    }), outputMode);
    process.exit(0);
  } catch (error) {
    printSection('Lucy QA defects link failed', [
      `- signature: ${signature || 'not provided'}`,
      `- bug_id: ${bugId ?? 'not provided'}`,
      `- error: ${error.message}`
    ]);
    process.exit(1);
  }
}

if (args[0] === 'qa' && args[1] === 'defects' && args[2] === 'update') {
  const outputMode = args.includes('--plain') ? 'plain' : args.includes('--trace') ? 'trace' : 'detailed';
  const signature = positionalAfter(3).join(' ').trim();
  const bugId = readFlag('--bug-id');
  const trackerSystem = readFlag('--tracker');
  const trackerUrl = readFlag('--tracker-url');
  const trackerTitle = readFlag('--tracker-title');
  const trackerStatus = readFlag('--tracker-status');
  const defectStatus = readFlag('--status');
  const targetUrl = readFlag('--target-url');
  const vaultPath = readFlag('--vault');
  try {
    printDefectsResult(await runQaDefectsUpdateCommand({
      signature,
      bugId,
      trackerSystem,
      trackerUrl,
      trackerTitle,
      trackerStatus,
      defectStatus,
      targetUrl,
      vaultPath
    }), outputMode);
    process.exit(0);
  } catch (error) {
    printSection('Lucy QA defects update failed', [
      `- signature: ${signature || 'not provided'}`,
      `- error: ${error.message}`
    ]);
    process.exit(1);
  }
}

if (args[0] === 'qa' && args[1] === 'defects' && args[2] === 'file-remote') {
  const outputMode = args.includes('--plain') ? 'plain' : args.includes('--trace') ? 'trace' : 'detailed';
  const signature = positionalAfter(3).join(' ').trim();
  const trackerSystem = readFlag('--tracker');
  const issueProject = readFlag('--project');
  const issueType = readFlag('--issue-type') ?? 'Bug';
  const title = readFlag('--title');
  const targetUrl = readFlag('--target-url');
  const vaultPath = readFlag('--vault');
  try {
    printDefectsResult(await runQaDefectsFileRemoteCommand({
      signature,
      trackerSystem,
      issueProject,
      issueType,
      title,
      targetUrl,
      vaultPath
    }), outputMode);
    process.exit(0);
  } catch (error) {
    printSection('Lucy QA defects file-remote failed', [
      `- signature: ${signature || 'not provided'}`,
      `- error: ${error.message}`
    ]);
    process.exit(1);
  }
}

if (args[0] === 'qa' && args[1] === 'exec') {
  const outputMode = args.includes('--plain') ? 'plain' : args.includes('--trace') ? 'trace' : 'detailed';
  const command = positionalAfter(2).join(' ').trim();
  const cwd = readFlag('--cwd') ?? process.cwd();
  const timeoutRaw = readFlag('--timeout');
  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : 120000;
  try {
    printExecResult(await runQaExecCommand({ command, cwd, timeoutMs }), outputMode);
    process.exit(0);
  } catch (error) {
    printSection('Lucy QA exec failed', [
      `- command: ${command || 'not provided'}`,
      `- cwd: ${cwd}`,
      `- error: ${error.message}`
    ]);
    process.exit(1);
  }
}

if (args[0] === 'rtk' && args[1] === 'status') {
  const rtkStatus = getRtkStatus();
  printSection('RTK status', [
    `- available: ${rtkStatus.available ? 'yes' : 'no'}`,
    `- version: ${rtkStatus.version ?? 'not installed'}`,
    `- enabled: ${rtkStatus.enabled ? 'yes' : 'no (LUCY_QA_RTK_ENABLED=false)'}`,
    `- effect: ${rtkStatus.available ? 'qa exec and qa run output is compressed before reaching LLM context' : 'none'}`
  ]);
  if (rtkStatus.install_hint) {
    console.log('');
    console.log('Setup');
    rtkStatus.install_hint.forEach((line) => console.log(`  ${line}`));
  }
  process.exit(0);
}

printSection('Lucy QA command not recognized', [
  `- input: ${args.join(' ') || 'none'}`,
  '- Try lucy to see the available commands.'
]);
process.exit(1);
