const resolveApiKey = (providerConfig) => {
  if (providerConfig.api_key && providerConfig.api_key !== '***') {
    return providerConfig.api_key;
  }

  if (providerConfig.api_key_env) {
    return process.env[providerConfig.api_key_env] ?? null;
  }

  return null;
};

export const fetchOpenAICompatibleModels = async (providerConfig) => {
  const base = providerConfig.base_url.replace(/\/$/, '');
  const apiKey = resolveApiKey(providerConfig);
  const headers = {
    ...(providerConfig.default_headers ?? {}),
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
  };
  const controller = new AbortController();
  const timeoutMs = providerConfig.timeout_ms ?? 120000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${base}/models`, {
      headers,
      signal: controller.signal
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Model discovery failed: ${response.status} ${response.statusText} - ${message}`);
    }

    const payload = await response.json();
    const data = Array.isArray(payload.data) ? payload.data : [];
    return data.map((item) => item.id).filter(Boolean);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Model discovery timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};
