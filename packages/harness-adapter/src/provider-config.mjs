import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_EXAMPLE_CONFIG_PATH = path.resolve(__dirname, '../../../config/providers.example.json');
const DEFAULT_WRITABLE_CONFIG_PATH = path.resolve(__dirname, '../../../config/providers.local.json');

const ensureDir = (filePath) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value) => {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

export const resolveDefaultProviderConfigPath = () => {
  const envPath = process.env.LUCY_QA_PROVIDER_CONFIG_PATH;
  if (envPath) {
    return path.resolve(envPath);
  }
  if (fs.existsSync(DEFAULT_WRITABLE_CONFIG_PATH)) {
    return DEFAULT_WRITABLE_CONFIG_PATH;
  }
  return DEFAULT_EXAMPLE_CONFIG_PATH;
};

export const resolveWritableProviderConfigPath = () => {
  const envPath = process.env.LUCY_QA_PROVIDER_CONFIG_PATH;
  return path.resolve(envPath ?? DEFAULT_WRITABLE_CONFIG_PATH);
};

export const loadRawProviderConfig = (configPath = resolveDefaultProviderConfigPath()) => {
  return readJson(configPath);
};

export const ensureWritableProviderConfig = (configPath = resolveWritableProviderConfigPath()) => {
  const resolved = path.resolve(configPath);
  if (fs.existsSync(resolved)) {
    return resolved;
  }
  const seed = fs.existsSync(DEFAULT_EXAMPLE_CONFIG_PATH)
    ? readJson(DEFAULT_EXAMPLE_CONFIG_PATH)
    : { default_provider: null, providers: {} };
  writeJson(resolved, seed);
  return resolved;
};

const baseOpenAICompatiblePreset = ({
  label,
  baseUrl,
  model,
  availableModels = [],
  notes = [],
  modelAliases = {},
  taskModelPreferences = {}
}) => ({
  type: 'openai-compatible',
  enabled: true,
  label,
  base_url: baseUrl,
  api_key: '***',
  api_key_env: null,
  model,
  default_model: model,
  timeout_ms: 120000,
  default_headers: {},
  available_models: availableModels.length ? availableModels : [model].filter(Boolean),
  model_aliases: modelAliases,
  task_model_preferences: taskModelPreferences,
  streaming: true,
  notes
});

const PRESETS = {
  'openai-compatible': {
    key: 'openai-compatible',
    label: 'Custom OpenAI-compatible endpoint',
    description: 'Generic OpenAI-compatible backend for custom providers, local gateways, and enterprise relays.',
    defaults: () => baseOpenAICompatiblePreset({
      label: 'Custom OpenAI-compatible endpoint',
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-4.1',
      notes: [
        'Set base_url, API key env var, and model to match your provider.',
        'Works for vendors that expose OpenAI-compatible chat completions endpoints.'
      ],
      modelAliases: {
        balanced: 'gpt-4.1',
        fast: 'gpt-4.1-mini'
      },
      taskModelPreferences: {
        qa: ['balanced', 'fast'],
        research: ['balanced'],
        coding: ['balanced', 'fast'],
        uiux: ['balanced', 'fast']
      }
    })
  },
  cliproxyapi: {
    key: 'cliproxyapi',
    label: 'CLIProxyAPI gateway',
    description: 'Preset for CLIProxyAPI-style OpenAI-compatible bridges with multi-provider routing.',
    defaults: () => baseOpenAICompatiblePreset({
      label: 'CLIProxyAPI gateway',
      baseUrl: 'http://127.0.0.1:8080/v1',
      model: 'gpt-5',
      availableModels: ['gpt-5', 'claude-sonnet-4', 'gemini-2.5-pro'],
      notes: [
        'Use this for CLIProxyAPI or similar local/hosted OpenAI-compatible gateways.',
        'Exact model names depend on your CLIProxyAPI routing configuration.'
      ],
      modelAliases: {
        balanced: 'gpt-5',
        coding: 'gpt-5',
        anthropic: 'claude-sonnet-4',
        google: 'gemini-2.5-pro'
      },
      taskModelPreferences: {
        qa: ['balanced', 'google'],
        research: ['anthropic', 'balanced'],
        coding: ['coding', 'anthropic'],
        uiux: ['balanced', 'google']
      }
    })
  },
  adacode: {
    key: 'adacode',
    label: 'AdaCODE',
    description: 'Preset for AdaCODE’s OpenAI-compatible API endpoint.',
    defaults: () => baseOpenAICompatiblePreset({
      label: 'AdaCODE',
      baseUrl: 'https://api.adacode.ai/v1',
      model: 'claude-sonnet-4-6',
      availableModels: ['claude-sonnet-4-6', 'gpt-5.3', 'gemini-3-flash', 'glm-4.7'],
      notes: [
        'AdaCODE uses OpenAI-compatible chat completions with Bearer API keys.',
        'API keys typically start with sk-adacode-.'
      ],
      modelAliases: {
        balanced: 'claude-sonnet-4-6',
        fast: 'gemini-3-flash',
        reasoning: 'gpt-5.3',
        multilingual: 'glm-4.7'
      },
      taskModelPreferences: {
        qa: ['balanced', 'fast'],
        research: ['reasoning', 'balanced'],
        coding: ['balanced', 'reasoning'],
        uiux: ['balanced', 'fast']
      }
    })
  },
  'github-copilot': {
    key: 'github-copilot',
    label: 'GitHub Copilot',
    description: 'Preset for GitHub Copilot chat-completions compatible access using a Copilot token and integration header.',
    defaults: () => baseOpenAICompatiblePreset({
      label: 'GitHub Copilot',
      baseUrl: 'https://api.githubcopilot.com',
      model: 'gpt-4o',
      availableModels: ['gpt-4o', 'gpt-4.1', 'claude-3.7-sonnet', 'gemini-2.0-flash-001'],
      notes: [
        'Use a Copilot-compatible token from COPILOT_GITHUB_TOKEN, GH_TOKEN, GITHUB_TOKEN, or another env var you provide during setup.',
        'This preset sets Copilot-Integration-Id to vscode-chat by default.'
      ],
      modelAliases: {
        balanced: 'gpt-4o',
        fast: 'gemini-2.0-flash-001',
        reasoning: 'claude-3.7-sonnet'
      },
      taskModelPreferences: {
        qa: ['balanced', 'fast'],
        research: ['reasoning', 'balanced'],
        coding: ['balanced', 'reasoning'],
        uiux: ['balanced', 'fast']
      }
    })
  },
  glm: {
    key: 'glm',
    label: 'Zhipu AI GLM',
    description: 'Preset for Zhipu AI GLM models (GLM-4 family) using their OpenAI-compatible chat completions API.',
    defaults: () => baseOpenAICompatiblePreset({
      label: 'Zhipu AI GLM',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4-plus',
      availableModels: ['glm-4-plus', 'glm-4-air', 'glm-4-airx', 'glm-4-flash', 'glm-4v-plus', 'glm-z1-plus', 'glm-z1-air'],
      notes: [
        'Get an API key from https://open.bigmodel.cn — set ZHIPU_API_KEY or GLM_API_KEY.',
        'The GLM-4 family supports Chinese and English natively.',
        'glm-4-flash is the fastest and cheapest tier; glm-4-plus is the most capable.'
      ],
      modelAliases: {
        balanced: 'glm-4-plus',
        fast: 'glm-4-flash',
        vision: 'glm-4v-plus',
        reasoning: 'glm-z1-plus',
        air: 'glm-4-air'
      },
      taskModelPreferences: {
        qa: ['balanced', 'fast'],
        research: ['reasoning', 'balanced'],
        coding: ['balanced', 'reasoning'],
        uiux: ['balanced', 'vision', 'fast']
      }
    })
  },
  minimax: {
    key: 'minimax',
    label: 'MiniMax',
    description: 'Preset for MiniMax AI models using their OpenAI-compatible chat completions API.',
    defaults: () => baseOpenAICompatiblePreset({
      label: 'MiniMax',
      baseUrl: 'https://api.minimax.chat/v1',
      model: 'MiniMax-Text-01',
      availableModels: ['MiniMax-Text-01', 'MiniMax-M1', 'abab6.5s-chat', 'abab6.5g-chat', 'abab5.5s-chat'],
      notes: [
        'Get an API key from https://www.minimax.chat — set MINIMAX_API_KEY.',
        'MiniMax-Text-01 supports 1M context and is the flagship model.',
        'MiniMax-M1 is a reasoning model with extended thinking capabilities.',
        'The abab series are older tiers; prefer MiniMax-Text-01 for new projects.'
      ],
      modelAliases: {
        balanced: 'MiniMax-Text-01',
        fast: 'abab6.5s-chat',
        reasoning: 'MiniMax-M1',
        long_context: 'MiniMax-Text-01'
      },
      taskModelPreferences: {
        qa: ['balanced', 'fast'],
        research: ['reasoning', 'long_context'],
        coding: ['balanced', 'reasoning'],
        uiux: ['balanced', 'fast']
      }
    })
  }
};

export const listProviderPresets = () => Object.values(PRESETS).map((item) => ({
  key: item.key,
  label: item.label,
  description: item.description,
  defaults: item.defaults()
}));

export const buildProviderFromPreset = ({ preset, providerName, baseUrl = null, model = null, apiKeyEnv = null, label = null, headers = null } = {}) => {
  const selected = PRESETS[preset];
  if (!selected) {
    throw new Error(`Unknown provider preset: ${preset}`);
  }
  const config = selected.defaults();
  const resolvedModel = model ?? config.model;
  const mergedHeaders = {
    ...(config.default_headers ?? {}),
    ...(headers ?? {}),
    ...(preset === 'github-copilot' ? { 'Copilot-Integration-Id': headers?.['Copilot-Integration-Id'] ?? 'vscode-chat' } : {})
  };
  return {
    name: providerName,
    config: {
      ...config,
      ...(label ? { label } : {}),
      ...(baseUrl ? { base_url: baseUrl.replace(/\/$/, '') } : {}),
      model: resolvedModel,
      default_model: resolvedModel,
      available_models: [...new Set([...(config.available_models ?? []), resolvedModel].filter(Boolean))],
      ...(apiKeyEnv ? { api_key_env: apiKeyEnv } : {}),
      ...(preset === 'github-copilot' && !apiKeyEnv ? { api_key_env: 'COPILOT_GITHUB_TOKEN' } : {}),
      ...(Object.keys(mergedHeaders).length ? { default_headers: mergedHeaders } : {})
    }
  };
};

export const saveProviderConfigEntry = ({ providerName, providerConfig, setDefault = false, configPath = resolveWritableProviderConfigPath() } = {}) => {
  if (!providerName?.trim()) {
    throw new Error('providerName is required');
  }
  const targetPath = ensureWritableProviderConfig(configPath);
  const current = loadRawProviderConfig(targetPath);
  const next = {
    ...current,
    providers: {
      ...(current.providers ?? {}),
      [providerName]: providerConfig
    }
  };
  if (setDefault || !next.default_provider) {
    next.default_provider = providerName;
  }
  writeJson(targetPath, next);
  return {
    implemented: true,
    path: targetPath,
    default_provider: next.default_provider,
    provider_name: providerName,
    provider: next.providers[providerName]
  };
};
