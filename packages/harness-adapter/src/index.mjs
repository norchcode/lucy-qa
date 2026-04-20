import { listProviders, resolveProvider, resolveModelSelection } from './provider-loader.mjs';
import { createProviderClient } from './provider-client.mjs';
import { connectProvider, discoverProviderModels, persistDefaultModel } from './provider-connect.mjs';
import { switchProvider, getActiveProvider } from './provider-switch.mjs';
import { listProviderPresets, buildProviderFromPreset, saveProviderConfigEntry, resolveWritableProviderConfigPath, resolveDefaultProviderConfigPath } from './provider-config.mjs';
import { authCodexStatus, beginOpenAICodexManualOAuth, completeOpenAICodexManualOAuth, getOpenAICodexManualOAuthStatus } from '../../auth-codex/src/index.mjs';
import { authAnthropicStatus, beginAnthropicManualOAuth, completeAnthropicManualOAuth, getAnthropicManualOAuthStatus } from '../../auth-anthropic/src/index.mjs';
import { authGitHubCopilotStatus, resolveGitHubCopilotApiKeyEnv } from '../../auth-github-copilot/src/index.mjs';

export const createHarnessAdapter = () => ({
  name: 'claw-code-adapter',
  implemented: false,
  capabilities: ['provider-loading', 'model-selection', 'provider-client', 'provider-connect', 'model-discovery', 'provider-switch']
});

export {
  listProviders,
  resolveProvider,
  resolveModelSelection,
  createProviderClient,
  connectProvider,
  discoverProviderModels,
  persistDefaultModel,
  listProviderPresets,
  buildProviderFromPreset,
  saveProviderConfigEntry,
  resolveWritableProviderConfigPath,
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
};
