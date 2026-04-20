import fs from 'node:fs';
import { spawn } from 'node:child_process';

const DEFAULT_LIMIT = 5;
const DEFAULT_PROTOCOL_VERSION = '2024-11-05';
const DEFAULT_COMMAND = process.env.LUCY_QA_CONTEXT7_COMMAND || 'npx';
const DEFAULT_ARGS = process.env.LUCY_QA_CONTEXT7_ARGS_JSON
  ? JSON.parse(process.env.LUCY_QA_CONTEXT7_ARGS_JSON)
  : ['-y', '@upstash/context7-mcp'];

const KNOWN_SOURCES = [
  {
    id: 'playwright',
    title: 'Playwright',
    libraryName: 'Playwright',
    domains: ['playwright.dev'],
    hints: ['playwright', 'locator', 'trace', 'test', 'expect', 'page', 'browser']
  },
  {
    id: 'quarto',
    title: 'Quarto',
    libraryName: 'Quarto',
    domains: ['quarto.org'],
    hints: ['quarto', 'qmd']
  },
  {
    id: 'obsidian',
    title: 'Obsidian',
    libraryName: 'Obsidian',
    domains: ['obsidian.md', 'help.obsidian.md'],
    hints: ['obsidian', 'vault', 'markdown']
  },
  {
    id: 'javascript',
    title: 'MDN',
    libraryName: 'MDN',
    domains: ['developer.mozilla.org', 'mdn.mozilla.org'],
    hints: ['javascript', 'mdn', 'fetch', 'promise', 'array', 'object']
  }
];

const normalizeWhitespace = (value = '') => String(value).replace(/\s+/g, ' ').trim();
const uniqueByUrl = (items = []) => {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.url || seen.has(item.url)) {
      return false;
    }
    seen.add(item.url);
    return true;
  });
};

const scoreResult = (queryTerms, item) => {
  const haystack = `${item.title}\n${item.excerpt}\n${item.url}\n${item.source}`.toLowerCase();
  return queryTerms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
};

const detectPreferredSources = (query) => {
  const lowered = query.toLowerCase();
  return KNOWN_SOURCES.filter((source) => source.hints.some((hint) => lowered.includes(hint)));
};

const loadFixtureResults = (fixturePath) => {
  const parsed = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  return Array.isArray(parsed.results) ? parsed.results : [];
};

const buildSearchUrl = (query, preferredSources) => {
  const siteFilter = preferredSources.length
    ? preferredSources.flatMap((source) => source.domains.map((domain) => `site:${domain}`)).join(' OR ')
    : '';
  const combined = [query, siteFilter].filter(Boolean).join(' ');
  return `https://duckduckgo.com/html/?q=${encodeURIComponent(combined)}`;
};

const stripTags = (html = '') => normalizeWhitespace(html.replace(/<[^>]+>/g, ' '));

const decodeDuckDuckGoUrl = (url) => {
  try {
    const parsed = new URL(url, 'https://duckduckgo.com');
    const target = parsed.searchParams.get('uddg');
    return target ? decodeURIComponent(target) : parsed.toString();
  } catch {
    return url;
  }
};

const parseDuckDuckGoHtml = (html, preferredSources) => {
  const results = [];
  const pattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>)?/gi;

  let match;
  while ((match = pattern.exec(html)) !== null) {
    const url = decodeDuckDuckGoUrl(match[1]);
    const title = stripTags(match[2]);
    const excerpt = stripTags(match[3] ?? match[4] ?? '');
    const source = preferredSources.find((item) => item.domains.some((domain) => url.includes(domain)))?.id ?? 'web';
    if (!url || !title) {
      continue;
    }
    results.push({ title, url, excerpt, source });
  }

  return uniqueByUrl(results);
};

const searchWebDocs = async (query, preferredSources) => {
  const response = await fetch(buildSearchUrl(query, preferredSources), {
    headers: {
      'user-agent': 'Lucy-QA-Context7/1.0 (+local docs lookup)'
    }
  });
  if (!response.ok) {
    throw new Error(`Context7 lookup failed with status ${response.status}`);
  }
  const html = await response.text();
  return parseDuckDuckGoHtml(html, preferredSources);
};

const parseResolveText = (text = '') => {
  const blocks = String(text)
    .split('----------')
    .map((item) => item.trim())
    .filter(Boolean);

  return blocks.map((block) => {
    const get = (label) => {
      const match = block.match(new RegExp(`- ${label}:\\s*(.+)`));
      return match ? match[1].trim() : null;
    };
    return {
      title: get('Title'),
      library_id: get('Context7-compatible library ID'),
      description: get('Description'),
      code_snippets: Number(get('Code Snippets') ?? '0'),
      source_reputation: get('Source Reputation'),
      benchmark_score: Number(get('Benchmark Score') ?? '0'),
      versions: (get('Versions') ?? '').split(',').map((item) => item.trim()).filter(Boolean)
    };
  }).filter((item) => item.library_id);
};

const parseQueryDocsText = (text = '', source = 'context7') => {
  const sections = String(text)
    .split('--------------------------------')
    .map((item) => item.trim())
    .filter(Boolean);

  return sections.map((section, index) => {
    const lines = section.split('\n').map((line) => line.trimEnd());
    const title = lines.find((line) => line.startsWith('### '))?.replace(/^###\s*/, '') ?? `Result ${index + 1}`;
    const sourceLine = lines.find((line) => line.startsWith('Source:'));
    const url = sourceLine?.replace(/^Source:\s*/, '').trim() ?? null;
    const excerptLines = [];
    for (const line of lines.slice((lines.indexOf(sourceLine) + 1) || 0)) {
      if (!line || line.startsWith('```')) {
        if (excerptLines.length) {
          break;
        }
        continue;
      }
      excerptLines.push(line);
      if (excerptLines.length >= 3) {
        break;
      }
    }
    return {
      title: normalizeWhitespace(title),
      url,
      excerpt: normalizeWhitespace(excerptLines.join(' ')),
      source,
      raw: section
    };
  }).filter((item) => item.url);
};

const createMcpClient = ({ command = DEFAULT_COMMAND, args = DEFAULT_ARGS, timeoutMs = 20000 } = {}) => {
  const child = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env
  });

  let nextId = 1;
  let buffer = '';
  const pending = new Map();
  let ready = false;

  const settleAll = (error) => {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    pending.clear();
  };

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) {
        continue;
      }
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (message.id && pending.has(message.id)) {
        const { resolve, reject, timer } = pending.get(message.id);
        pending.delete(message.id);
        clearTimeout(timer);
        if (message.error) {
          reject(new Error(message.error.message ?? 'Context7 MCP request failed'));
        } else {
          resolve(message.result);
        }
      }
    }
  });

  child.on('error', (error) => settleAll(error));
  child.on('close', (code, signal) => {
    if (pending.size) {
      settleAll(new Error(`Context7 MCP process exited early (code=${code}, signal=${signal})`));
    }
  });

  const send = (payload) => child.stdin.write(`${JSON.stringify(payload)}\n`);

  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId += 1;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Context7 MCP timeout for method ${method}`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    send({ jsonrpc: '2.0', id, method, params });
  });

  return {
    initialize: async () => {
      if (ready) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      await call('initialize', {
        protocolVersion: DEFAULT_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: 'lucy-qa-context7-client',
          version: '0.1.0'
        }
      });
      send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
      ready = true;
    },
    callTool: async (name, argsObj) => {
      await ready || null;
      return call('tools/call', { name, arguments: argsObj });
    },
    close: async () => {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    }
  };
};

const recordForcedFailureAttempt = () => {
  const counterPath = process.env.LUCY_QA_CONTEXT7_ATTEMPT_COUNTER;
  if (!counterPath) {
    return;
  }
  let current = 0;
  if (fs.existsSync(counterPath)) {
    current = Number(fs.readFileSync(counterPath, 'utf8').trim() || '0');
  }
  fs.writeFileSync(counterPath, String(current + 1));
};

const lookupViaRealContext7 = async (query, preferredSources, limit) => {
  if (process.env.LUCY_QA_CONTEXT7_FORCE_FAIL === '1') {
    recordForcedFailureAttempt();
    throw new Error('Forced Context7 failure for test');
  }

  const libraryName = preferredSources[0]?.libraryName
    ?? normalizeWhitespace(query).split(/\s+/).slice(0, 2).join(' ');
  const client = createMcpClient();

  try {
    await client.initialize();
    const resolveResult = await client.callTool('resolve-library-id', {
      libraryName,
      query
    });
    const resolveText = resolveResult?.content?.map((item) => item.text ?? '').join('\n') ?? '';
    const libraries = parseResolveText(resolveText);
    const selected = libraries[0];
    if (!selected?.library_id) {
      return {
        engine: 'context7-mcp',
        preferred_sources: preferredSources.map((item) => item.id),
        selected_library: null,
        results: []
      };
    }

    const queryResult = await client.callTool('query-docs', {
      libraryId: selected.library_id,
      query
    });
    const queryText = queryResult?.content?.map((item) => item.text ?? '').join('\n') ?? '';
    const results = parseQueryDocsText(queryText, selected.title ?? preferredSources[0]?.id ?? 'context7')
      .slice(0, limit);

    return {
      engine: 'context7-mcp',
      preferred_sources: preferredSources.map((item) => item.id),
      selected_library: selected,
      results
    };
  } finally {
    await client.close();
  }
};

export const fetchContext7Docs = async (query, { limit = DEFAULT_LIMIT } = {}) => {
  const normalizedQuery = normalizeWhitespace(query);
  if (!normalizedQuery) {
    throw new Error('query is required');
  }

  const preferredSources = detectPreferredSources(normalizedQuery);
  const fixturePath = process.env.LUCY_QA_CONTEXT7_FIXTURE;
  let engine = 'context7-mcp';
  let selectedLibrary = null;
  let rawResults;
  let context7Attempts = 0;
  let context7Failed = false;

  if (fixturePath) {
    engine = 'context7-fixture';
    rawResults = loadFixtureResults(fixturePath);
  } else {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      context7Attempts = attempt;
      try {
        const real = await lookupViaRealContext7(normalizedQuery, preferredSources, limit);
        engine = real.engine;
        selectedLibrary = real.selected_library;
        rawResults = real.results;
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!rawResults) {
      context7Failed = true;
      if (process.env.LUCY_QA_CONTEXT7_FALLBACK_FIXTURE) {
        engine = 'context7-web-fallback';
        rawResults = JSON.parse(process.env.LUCY_QA_CONTEXT7_FALLBACK_FIXTURE);
      } else {
        engine = 'context7-web-fallback';
        rawResults = await searchWebDocs(normalizedQuery, preferredSources);
      }
      if (!rawResults && lastError) {
        throw lastError;
      }
    }
  }

  const queryTerms = normalizedQuery.toLowerCase().split(/\s+/).filter(Boolean);
  const results = uniqueByUrl(rawResults)
    .map((item) => ({
      title: normalizeWhitespace(item.title),
      url: item.url,
      excerpt: normalizeWhitespace(item.excerpt ?? ''),
      source: item.source ?? preferredSources[0]?.id ?? 'web',
      score: scoreResult(queryTerms, item)
    }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);

  return {
    query: normalizedQuery,
    implemented: true,
    engine,
    preferred_sources: preferredSources.map((item) => item.id),
    selected_library: selectedLibrary,
    context7_attempts: context7Attempts,
    context7_failed: context7Failed,
    results
  };
};
