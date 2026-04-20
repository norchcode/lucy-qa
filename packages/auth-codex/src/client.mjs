import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getCodexAuthHeader } from './auth-store.mjs';

const normalizeBaseUrl = (baseUrl) => {
  if (!baseUrl) {
    throw new Error('Codex provider is missing api_base_url');
  }

  return baseUrl.replace(/\/$/, '');
};

const toInputContent = (content) => {
  if (typeof content === 'string') {
    return [{ type: 'input_text', text: content }];
  }

  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === 'string') {
        return { type: 'input_text', text: item };
      }
      if (item?.type === 'text') {
        return { type: 'input_text', text: item.text ?? '' };
      }
      return item;
    });
  }

  return [{ type: 'input_text', text: String(content ?? '') }];
};

const mapMessagesToInput = (messages = []) => {
  return messages.map((message) => ({
    role: message.role,
    content: toInputContent(message.content)
  }));
};

const extractOutputText = (payload) => {
  const output = Array.isArray(payload.output) ? payload.output : [];
  const textParts = [];
  let assistantMessage = null;

  for (const item of output) {
    if (item?.type !== 'message') {
      continue;
    }

    if (!assistantMessage && item.role === 'assistant') {
      assistantMessage = item;
    }

    for (const part of item.content ?? []) {
      if (part?.type === 'output_text') {
        textParts.push(part.text ?? '');
      }
    }
  }

  return {
    text: textParts.join('').trim(),
    message: assistantMessage
  };
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

const renderPromptFromMessages = (messages = []) => {
  return messages
    .map((message) => {
      const parts = Array.isArray(message.content)
        ? message.content.map((item) => item?.text ?? (typeof item === 'string' ? item : JSON.stringify(item))).join('\n')
        : typeof message.content === 'string'
          ? message.content
          : JSON.stringify(message.content ?? '');
      return `${message.role.toUpperCase()}\n${parts}`;
    })
    .join('\n\n');
};

const runViaCodexCli = async (providerConfig, { messages, model, timeoutMs }) => {
  const prompt = renderPromptFromMessages(messages);
  const outputPath = path.join(os.tmpdir(), `lucy-codex-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
  const command = providerConfig.codex_cli_command ?? 'codex';
  const args = [
    'exec',
    '--skip-git-repo-check',
    '-C', providerConfig.workdir ?? process.cwd(),
    '-m', model,
    '--sandbox', providerConfig.codex_sandbox_mode ?? 'read-only',
    '-o', outputPath,
    '-'
  ];

  if (providerConfig.codex_profile) {
    args.splice(1, 0, '-p', providerConfig.codex_profile);
  }

  const env = {
    ...process.env,
    ...(providerConfig.codex_env ?? {})
  };

  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        child.kill('SIGTERM');
        reject(new Error(`Codex CLI exec timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (settled) {
          return;
        }
        settled = true;
        if (code !== 0) {
          reject(new Error(stderr || stdout || `Codex exited with code ${code}`));
          return;
        }
        resolve({ stdout, stderr });
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });

    const text = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8').trim() : result.stdout.trim();
    return {
      implemented: true,
      transport: 'native-codex-cli',
      model,
      text,
      message: {
        role: 'assistant',
        content: [{ type: 'output_text', text }]
      },
      usage: null,
      raw: {
        stdout: result.stdout,
        stderr: result.stderr,
        output_file: outputPath
      }
    };
  } catch (error) {
    throw new Error(`Codex CLI exec failed: ${error.message}`);
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
};

const runViaResponsesApi = async (providerConfig, { messages, model, instructions, temperature, text, reasoning, stream = false, signal, ...rest } = {}) => {
  const baseUrl = normalizeBaseUrl(providerConfig.api_base_url);
  const auth = getCodexAuthHeader(providerConfig);
  const headers = {
    'content-type': 'application/json',
    authorization: auth.header,
    ...providerConfig.default_headers
  };

  const response = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      input: mapMessagesToInput(messages),
      stream,
      ...(instructions === undefined ? {} : { instructions }),
      ...(temperature === undefined ? {} : { temperature }),
      ...(text === undefined ? {} : { text }),
      ...(reasoning === undefined ? {} : { reasoning }),
      ...rest
    }),
    signal
  });

  if (!response.ok) {
    const errorMessage = await parseErrorPayload(response);
    throw new Error(`Codex responses call failed: ${response.status} ${response.statusText} - ${errorMessage}`);
  }

  const payload = await response.json();
  const extracted = extractOutputText(payload);

  return {
    implemented: true,
    transport: 'native-codex-responses-api',
    endpoint: `${baseUrl}/responses`,
    auth_source: auth.source,
    model: payload.model ?? model,
    id: payload.id ?? null,
    object: payload.object ?? null,
    status: payload.status ?? null,
    message: extracted.message,
    text: extracted.text,
    usage: payload.usage ?? null,
    raw: payload
  };
};

export const createCodexClient = (providerConfig) => {
  return {
    provider: providerConfig,
    async chat({ messages, model, ...rest } = {}) {
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('chat() requires at least one message');
      }

      if (!model) {
        throw new Error('chat() requires a resolved model');
      }

      const timeoutMs = providerConfig.timeout_ms ?? 120000;
      const transport = providerConfig.transport ?? 'codex-cli';

      if (transport === 'responses-api') {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          return await runViaResponsesApi(providerConfig, { messages, model, ...rest, signal: controller.signal });
        } catch (error) {
          if (error?.name === 'AbortError') {
            throw new Error(`Codex responses call timed out after ${timeoutMs}ms`);
          }
          throw error;
        } finally {
          clearTimeout(timeout);
        }
      }

      return await runViaCodexCli(providerConfig, { messages, model, timeoutMs, ...rest });
    }
  };
};
