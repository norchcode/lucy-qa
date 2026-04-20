import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const STATE_DIR = path.join(os.homedir(), '.lucy');
const STATE_PATH = path.join(STATE_DIR, 'provider-state.json');
const PREFERENCES_PATH = path.join(STATE_DIR, 'preferences.json');

const ensureStateDir = () => {
  fs.mkdirSync(STATE_DIR, { recursive: true });
};

export const loadProviderState = () => {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { connected: {}, discovered_models: {}, default_models: {} };
  }
};

export const saveProviderState = (state) => {
  ensureStateDir();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  return state;
};

export const markProviderConnected = (providerName, details = {}) => {
  const state = loadProviderState();
  state.connected[providerName] = {
    connected: true,
    updated_at: new Date().toISOString(),
    ...details
  };
  return saveProviderState(state);
};

export const setDiscoveredModels = (providerName, models = []) => {
  const state = loadProviderState();
  state.discovered_models[providerName] = {
    models,
    updated_at: new Date().toISOString()
  };
  return saveProviderState(state);
};

export const setDefaultModel = (providerName, model) => {
  const state = loadProviderState();
  state.default_models[providerName] = {
    model,
    updated_at: new Date().toISOString()
  };
  return saveProviderState(state);
};

export const loadPreferences = () => {
  try {
    const raw = fs.readFileSync(PREFERENCES_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { active_provider: null };
  }
};

export const savePreferences = (preferences) => {
  ensureStateDir();
  fs.writeFileSync(PREFERENCES_PATH, JSON.stringify(preferences, null, 2));
  return preferences;
};

export const setActiveProvider = (providerName) => {
  const preferences = loadPreferences();
  preferences.active_provider = providerName;
  preferences.updated_at = new Date().toISOString();
  return savePreferences(preferences);
};

export const getProviderStateSummary = (providerName) => {
  const state = loadProviderState();
  const preferences = loadPreferences();
  return {
    provider: providerName,
    active_provider: preferences.active_provider,
    connected: state.connected[providerName] ?? null,
    discovered_models: state.discovered_models[providerName] ?? null,
    default_model: state.default_models[providerName] ?? null
  };
};
