const SUPPORTED_GITHUB_COPILOT_ENV_VARS = ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'];

const resolveConfiguredApiKey = (providerConfig = {}) => {
  if (providerConfig.api_key && providerConfig.api_key !== '***') {
    return providerConfig.api_key;
  }
  if (providerConfig.api_key_env) {
    return process.env[providerConfig.api_key_env] ?? null;
  }
  return null;
};

const detectEnvironmentToken = (providerConfig = {}) => {
  if (providerConfig.api_key_env && process.env[providerConfig.api_key_env]) {
    return {
      env_name: providerConfig.api_key_env,
      token: process.env[providerConfig.api_key_env]
    };
  }

  for (const envName of SUPPORTED_GITHUB_COPILOT_ENV_VARS) {
    if (process.env[envName]) {
      return {
        env_name: envName,
        token: process.env[envName]
      };
    }
  }

  return {
    env_name: null,
    token: null
  };
};

export const authGitHubCopilotStatus = (providerConfig = {}) => {
  const configuredApiKey = resolveConfiguredApiKey(providerConfig);
  const detected = detectEnvironmentToken(providerConfig);
  const effectiveApiKey = configuredApiKey ?? detected.token;

  return {
    provider: 'github-copilot',
    implemented: true,
    auth_mode: effectiveApiKey ? (providerConfig.api_key ? 'configured-api-key' : 'env-token') : 'missing',
    supported_api_key_envs: SUPPORTED_GITHUB_COPILOT_ENV_VARS,
    configured_api_key_env: providerConfig.api_key_env ?? null,
    detected_api_key_env: detected.env_name,
    has_api_key: Boolean(effectiveApiKey),
    base_url: providerConfig.base_url ?? 'https://api.githubcopilot.com',
    integration_id: providerConfig.default_headers?.['Copilot-Integration-Id'] ?? 'vscode-chat'
  };
};

export const resolveGitHubCopilotApiKeyEnv = (providerConfig = {}, requestedEnvName = null) => {
  if (requestedEnvName) {
    return {
      env_name: requestedEnvName,
      token_present: Boolean(process.env[requestedEnvName])
    };
  }

  const detected = detectEnvironmentToken(providerConfig);
  return {
    env_name: detected.env_name,
    token_present: Boolean(detected.token)
  };
};

export { SUPPORTED_GITHUB_COPILOT_ENV_VARS };
