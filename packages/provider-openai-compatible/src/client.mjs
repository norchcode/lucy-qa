const normalizeBaseUrl = (baseUrl) => {
  if (!baseUrl) {
    throw new Error('OpenAI-compatible provider is missing base_url');
  }

  return baseUrl.replace(/\/$/, '');
};

const resolveApiKey = (providerConfig) => {
  if (providerConfig.api_key && providerConfig.api_key !== '***') {
    return providerConfig.api_key;
  }

  if (providerConfig.api_key_env) {
    return process.env[providerConfig.api_key_env] ?? null;
  }

  return null;
};

const extractText = (content) => {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part?.type === 'text') {
          return part.text ?? '';
        }
        return '';
      })
      .join('')
      .trim();
  }

  return '';
};

const parseErrorPayload = async (response) => {
  const raw = await response.text();

  try {
    const parsed = JSON.parse(raw);
    return parsed.error?.message ?? parsed.message ?? raw;
  } catch {
    return raw;
  }
};

export const createOpenAICompatibleClient = (providerConfig) => {
  const baseUrl = normalizeBaseUrl(providerConfig.base_url);
  const apiKey = resolveApiKey(providerConfig);

  return {
    provider: providerConfig,
    async chat({ messages, model, temperature, stream = false, ...rest } = {}) {
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('chat() requires at least one message');
      }

      if (!model) {
        throw new Error('chat() requires a resolved model');
      }

      const headers = {
        'content-type': 'application/json',
        ...providerConfig.default_headers
      };

      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const timeoutMs = providerConfig.timeout_ms ?? 120000;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages,
            stream,
            ...(temperature === undefined ? {} : { temperature }),
            ...rest
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          const errorMessage = await parseErrorPayload(response);
          throw new Error(`OpenAI-compatible chat failed: ${response.status} ${response.statusText} - ${errorMessage}`);
        }

        const payload = await response.json();
        const firstChoice = Array.isArray(payload.choices) ? payload.choices[0] ?? null : null;
        const message = firstChoice?.message ?? null;

        return {
          implemented: true,
          transport: 'openai-compatible',
          base_url: providerConfig.base_url,
          model,
          id: payload.id ?? null,
          object: payload.object ?? null,
          created: payload.created ?? null,
          finish_reason: firstChoice?.finish_reason ?? null,
          message,
          text: extractText(message?.content),
          usage: payload.usage ?? null,
          raw: payload
        };
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error(`OpenAI-compatible chat timed out after ${timeoutMs}ms`);
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
  };
};
