import { getAnthropicApiKey } from './auth-store.mjs';

const normalizeBaseUrl = (baseUrl) => {
  if (!baseUrl) throw new Error('Anthropic provider is missing api_base_url');
  return baseUrl.replace(/\/$/, '');
};

export const fetchAnthropicModels = async (providerConfig = {}) => {
  const baseUrl = normalizeBaseUrl(providerConfig.api_base_url ?? 'https://api.anthropic.com');
  const auth = getAnthropicApiKey(providerConfig);
  const response = await fetch(`${baseUrl}/v1/models`, {
    headers: {
      'x-api-key': auth.api_key,
      'anthropic-version': providerConfig.api_version ?? '2023-06-01',
      ...providerConfig.default_headers
    }
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Anthropic models fetch failed: ${response.status} ${response.statusText} - ${message}`);
  }
  const payload = await response.json();
  return (payload.data ?? payload.models ?? []).map((item) => item.id ?? item.name ?? item.model).filter(Boolean);
};
