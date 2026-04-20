import { getAnthropicApiKey } from './auth-store.mjs';

const normalizeBaseUrl = (baseUrl) => {
  if (!baseUrl) throw new Error('Anthropic provider is missing api_base_url');
  return baseUrl.replace(/\/$/, '');
};

const toAnthropicText = (content) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === 'string') return item;
      if (item?.type === 'text') return item.text ?? '';
      if (item?.type === 'input_text') return item.text ?? '';
      return '';
    }).join('').trim();
  }
  return String(content ?? '');
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

export const createAnthropicClient = (providerConfig) => {
  const baseUrl = normalizeBaseUrl(providerConfig.api_base_url);

  return {
    provider: providerConfig,
    async chat({ messages, model, temperature, stream = false, max_tokens, system = null } = {}) {
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('chat() requires at least one message');
      }
      if (!model) {
        throw new Error('chat() requires a resolved model');
      }

      const auth = getAnthropicApiKey(providerConfig);
      const headers = {
        'content-type': 'application/json',
        'x-api-key': auth.api_key,
        'anthropic-version': providerConfig.api_version ?? '2023-06-01',
        ...providerConfig.default_headers
      };
      const timeoutMs = providerConfig.timeout_ms ?? 120000;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${baseUrl}/v1/messages`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages: messages.map((message) => ({
              role: message.role === 'assistant' ? 'assistant' : 'user',
              content: [{ type: 'text', text: toAnthropicText(message.content) }]
            })),
            stream,
            max_tokens: max_tokens ?? providerConfig.max_tokens ?? 4096,
            ...(system === undefined || system === null ? {} : { system }),
            ...(temperature === undefined ? {} : { temperature })
          }),
          signal: controller.signal
        });
        if (!response.ok) {
          const errorMessage = await parseErrorPayload(response);
          throw new Error(`Anthropic messages call failed: ${response.status} ${response.statusText} - ${errorMessage}`);
        }
        const payload = await response.json();
        const text = (payload.content ?? []).filter((item) => item?.type === 'text').map((item) => item.text ?? '').join('').trim();
        return {
          implemented: true,
          transport: 'native-anthropic-messages-api',
          api_base_url: providerConfig.api_base_url,
          auth_source: auth.source,
          model: payload.model ?? model,
          id: payload.id ?? null,
          type: payload.type ?? null,
          role: payload.role ?? 'assistant',
          stop_reason: payload.stop_reason ?? null,
          message: {
            role: payload.role ?? 'assistant',
            content: payload.content ?? []
          },
          text,
          usage: payload.usage ?? null,
          raw: payload
        };
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error(`Anthropic messages call timed out after ${timeoutMs}ms`);
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
  };
};
