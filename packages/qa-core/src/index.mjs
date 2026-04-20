import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const QA_BASELINE_PATH = path.resolve(__dirname, '../../../prompts/modes/qa-mode-baseline.md');
const QA_TEMPLATE_PATH = path.resolve(__dirname, '../../../vault/templates/qa-output-template.md');

const loadText = (filePath) => fs.readFileSync(filePath, 'utf8').trim();
const normalizeWhitespace = (value = '') => String(value).replace(/\s+/g, ' ').trim();
const unique = (items = []) => [...new Set(items.filter(Boolean).map((item) => normalizeWhitespace(item)))];
const fileExists = (filePath) => fs.existsSync(filePath);

const readJsonIfExists = (filePath) => {
  if (!fileExists(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
};

const RUNTIME_FETCH_TIMEOUT_MS = 10000;
const BROWSER_INSPECT_TIMEOUT_MS = 20000;
const BROWSER_VIRTUAL_TIME_BUDGET_MS = 3000;
const INTERACTIVE_PROBE_TIMEOUT_MS = 30000;
const INTERACTIVE_PROBE_MAX_ACTIONS = 2;
const INTERACTIVE_PROBE_DELAY_MS = 600;
const URL_PATTERN = /https?:\/\/[^\s)]+/i;
const KNOWN_RUNTIME_HEADERS = ['x-powered-by', 'server', 'x-vercel-id', 'x-vercel-cache', 'cf-ray', 'x-nf-request-id'];
const CLOUDFLARE_API_BASE = process.env.LUCY_QA_CLOUDFLARE_API_BASE || 'https://api.cloudflare.com/client/v4';
const CLOUDFLARE_CRAWL_MAX_POLLS = Math.max(1, Number(process.env.LUCY_QA_CLOUDFLARE_CRAWL_MAX_POLLS || 3));
const CLOUDFLARE_CRAWL_POLL_INTERVAL_MS = Math.max(200, Number(process.env.LUCY_QA_CLOUDFLARE_CRAWL_POLL_INTERVAL_MS || 500));
const BROWSER_EXECUTABLE_CANDIDATES = [
  process.env.LUCY_QA_BROWSER_EXECUTABLE,
  '/root/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',
  '/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
  '/root/.cache/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-linux64/chrome-headless-shell',
  '/root/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell'
].filter(Boolean);

const toHeaderObject = (headers) => {
  const result = {};
  for (const key of KNOWN_RUNTIME_HEADERS) {
    const value = headers.get(key);
    if (value) {
      result[key] = value;
    }
  }
  return result;
};

const extractTargetUrl = (goal, explicitTargetUrl = null) => {
  if (explicitTargetUrl) {
    return explicitTargetUrl;
  }
  const match = normalizeWhitespace(goal).match(URL_PATTERN);
  return match ? match[0] : null;
};

const countMatches = (text, pattern) => (text.match(pattern) ?? []).length;

const findBrowserExecutable = () => BROWSER_EXECUTABLE_CANDIDATES.find((candidate) => candidate && fs.existsSync(candidate)) ?? null;

const summarizeHtmlDom = (html = '') => ({
  forms: countMatches(html, /<form\b/gi),
  buttons: countMatches(html, /<button\b/gi),
  inputs: countMatches(html, /<input\b/gi),
  dialogs: countMatches(html, /<dialog\b/gi) + countMatches(html, /role=["']dialog["']/gi),
  tables: countMatches(html, /<table\b/gi) + countMatches(html, /role=["']grid["']/gi),
  navs: countMatches(html, /<nav\b/gi),
  mains: countMatches(html, /<main\b/gi),
  iframes: countMatches(html, /<iframe\b/gi),
  canvases: countMatches(html, /<canvas\b/gi),
  test_ids: countMatches(html, /data-testid=/gi) + countMatches(html, /data-test=/gi),
  roles: countMatches(html, /role=["'][^"']+["']/gi)
});

const deriveBrowserFindings = (html = '') => {
  const lowered = html.toLowerCase();
  const domSummary = summarizeHtmlDom(html);
  const frameworkHints = [];
  const evidence = [];
  const interactions = [];
  const risks = [];
  const addUnique = (arr, value) => {
    if (value && !arr.includes(value)) {
      arr.push(value);
    }
  };

  if (lowered.includes('__next_data__') || lowered.includes('/_next/')) {
    addUnique(frameworkHints, 'Next.js');
    evidence.push('Browser-rendered DOM still contains Next.js markers.');
  }
  if (lowered.includes('__nuxt') || lowered.includes('/_nuxt/')) {
    addUnique(frameworkHints, 'Nuxt');
    evidence.push('Browser-rendered DOM contains Nuxt markers.');
  }
  if (lowered.includes('/@vite/client') || lowered.includes('vite.svg')) {
    addUnique(frameworkHints, 'Vite');
    evidence.push('Browser-rendered DOM contains Vite markers.');
  }
  if (lowered.includes('ng-version=')) {
    addUnique(frameworkHints, 'Angular');
    evidence.push('Browser-rendered DOM contains ng-version marker.');
  }
  if (lowered.includes('data-sveltekit') || lowered.includes('/_app/immutable/')) {
    addUnique(frameworkHints, 'SvelteKit');
    evidence.push('Browser-rendered DOM contains SvelteKit markers.');
  }
  if (domSummary.dialogs > 0) addUnique(interactions, 'modal/dialog');
  if (domSummary.tables > 0) addUnique(interactions, 'table/grid');
  if (domSummary.iframes > 0) addUnique(interactions, 'iframe');
  if (domSummary.canvases > 0) addUnique(interactions, 'canvas/chart');
  if (domSummary.test_ids > 0) evidence.push('Browser-rendered DOM contains test id attributes.');
  if (domSummary.roles > 0) evidence.push('Browser-rendered DOM contains ARIA roles.');
  if (domSummary.iframes > 0) risks.push('Browser DOM includes iframe content boundaries.');
  if (domSummary.canvases > 0) risks.push('Browser DOM includes canvas content that may need non-semantic assertions.');
  if (!domSummary.roles && !domSummary.test_ids) risks.push('Hydrated DOM still lacks obvious semantic roles or test IDs.');

  const pageType = domSummary.forms > 0 && /login|sign in|password|email/.test(lowered)
    ? 'auth'
    : domSummary.tables > 0
      ? 'dashboard/data view'
      : domSummary.forms > 0
        ? 'form'
        : 'general web page';

  return {
    page_type: pageType,
    framework_hints: unique(frameworkHints),
    dom_summary: domSummary,
    interactions: unique(interactions),
    risks: unique(risks),
    evidence: unique(evidence)
  };
};

const getFreePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.unref();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : null;
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(port);
    });
  });
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const openWebSocket = async (url) => {
  if (typeof WebSocket !== 'function') {
    throw new Error('Global WebSocket support is not available in this Node runtime.');
  }

  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const cleanup = () => {
      socket.removeEventListener('open', handleOpen);
      socket.removeEventListener('error', handleError);
    };
    const handleOpen = () => {
      cleanup();
      resolve(socket);
    };
    const handleError = (event) => {
      cleanup();
      const error = event?.error instanceof Error ? event.error : new Error('WebSocket connection failed.');
      reject(error);
    };
    socket.addEventListener('open', handleOpen);
    socket.addEventListener('error', handleError);
  });
};

const createCdpSession = async (wsUrl) => {
  const socket = await openWebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const eventListeners = new Map();

  socket.addEventListener('message', (event) => {
    let payload = null;
    try {
      payload = JSON.parse(String(event.data));
    } catch {
      return;
    }

    if (payload.id && pending.has(payload.id)) {
      const { resolve, reject } = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) {
        reject(new Error(payload.error.message ?? 'CDP request failed.'));
      } else {
        resolve(payload.result ?? {});
      }
      return;
    }

    const listeners = eventListeners.get(payload.method);
    if (listeners?.length) {
      listeners.forEach((listener) => listener(payload.params ?? {}));
    }
  });

  const send = (method, params = {}, sessionId = null) => new Promise((resolve, reject) => {
    nextId += 1;
    pending.set(nextId, { resolve, reject });
    socket.send(JSON.stringify({ id: nextId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  const on = (method, listener) => {
    const listeners = eventListeners.get(method) ?? [];
    listeners.push(listener);
    eventListeners.set(method, listeners);
    return () => {
      const nextListeners = (eventListeners.get(method) ?? []).filter((item) => item !== listener);
      if (nextListeners.length) {
        eventListeners.set(method, nextListeners);
      } else {
        eventListeners.delete(method);
      }
    };
  };

  const close = async () => {
    for (const { reject } of pending.values()) {
      reject(new Error('CDP session closed.'));
    }
    pending.clear();
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
      await delay(20);
    }
  };

  return { send, on, close };
};

const buildProbeSnapshotExpression = () => `(() => {
  const candidateNodes = Array.from(document.querySelectorAll('button, [role="button"], summary, [aria-haspopup], a[href^="#"], [data-testid]'));
  const controls = candidateNodes.slice(0, 16).map((node, index) => {
    if (!node.hasAttribute('data-lucy-probe-id')) {
      node.setAttribute('data-lucy-probe-id', String(index + 1));
    }
    const text = (node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
    const type = (node.getAttribute('type') || '').toLowerCase();
    const href = node.getAttribute('href') || '';
    const role = node.getAttribute('role') || '';
    const probeId = node.getAttribute('data-lucy-probe-id');
    const safe = (
      node.tagName === 'SUMMARY' ||
      role === 'button' ||
      node.hasAttribute('aria-haspopup') ||
      node.hasAttribute('aria-expanded') ||
      (node.tagName === 'BUTTON' && !['submit', 'reset'].includes(type)) ||
      (node.tagName === 'A' && href.startsWith('#'))
    );
    return {
      probe_id: probeId,
      tag: node.tagName.toLowerCase(),
      text,
      role,
      type,
      href,
      testid: node.getAttribute('data-testid') || node.getAttribute('data-test') || '',
      aria_controls: node.getAttribute('aria-controls') || '',
      aria_expanded: node.getAttribute('aria-expanded') || '',
      safe
    };
  });
  return {
    title: document.title || '',
    url: location.href,
    dom_summary: {
      forms: document.querySelectorAll('form').length,
      buttons: document.querySelectorAll('button,[role="button"]').length,
      inputs: document.querySelectorAll('input,textarea,select').length,
      dialogs: document.querySelectorAll('dialog,[role="dialog"],[aria-modal="true"]').length,
      tables: document.querySelectorAll('table,[role="grid"]').length,
      navs: document.querySelectorAll('nav').length,
      mains: document.querySelectorAll('main').length,
      iframes: document.querySelectorAll('iframe').length,
      canvases: document.querySelectorAll('canvas').length,
      test_ids: document.querySelectorAll('[data-testid],[data-test]').length,
      roles: document.querySelectorAll('[role]').length
    },
    interactions: {
      dialogs: document.querySelectorAll('dialog,[role="dialog"],[aria-modal="true"]').length,
      expanded: document.querySelectorAll('[aria-expanded="true"]').length,
      menus: document.querySelectorAll('[role="menu"],[role="listbox"],[role="tree"],[role="tabpanel"]').length,
      active_tabs: document.querySelectorAll('[role="tab"][aria-selected="true"]').length
    },
    controls
  };
})()`;

const buildProbeClickExpression = (probeId, delayMs) => `async () => {
  const node = document.querySelector('[data-lucy-probe-id="${probeId}"]');
  if (!node) {
    return { ok: false, error: 'Probe target not found.' };
  }
  const beforeUrl = location.href;
  const beforeDialogs = document.querySelectorAll('dialog,[role="dialog"],[aria-modal="true"]').length;
  const beforeExpanded = document.querySelectorAll('[aria-expanded="true"]').length;
  const beforeMenus = document.querySelectorAll('[role="menu"],[role="listbox"],[role="tree"],[role="tabpanel"]').length;
  node.click();
  await new Promise((resolve) => setTimeout(resolve, ${delayMs}));
  return {
    ok: true,
    after: (${buildProbeSnapshotExpression()}),
    deltas: {
      url_changed: location.href !== beforeUrl,
      dialogs_opened: document.querySelectorAll('dialog,[role="dialog"],[aria-modal="true"]').length - beforeDialogs,
      expanded_added: document.querySelectorAll('[aria-expanded="true"]').length - beforeExpanded,
      menus_opened: document.querySelectorAll('[role="menu"],[role="listbox"],[role="tree"],[role="tabpanel"]').length - beforeMenus
    }
  };
}`;

const summarizeInteractiveProbe = ({ initial = null, actions = [] } = {}) => {
  const domSummary = initial?.dom_summary ?? summarizeHtmlDom('');
  const interactions = [];
  const risks = [];
  const evidence = [];
  const observedRoutes = unique([initial?.url, ...actions.map((action) => action.after?.url)].filter(Boolean));
  const safeActions = actions.filter((action) => action.ok);

  if (safeActions.some((action) => (action.deltas?.dialogs_opened ?? 0) > 0)) {
    interactions.push('modal/dialog');
    evidence.push('Interactive probe opened a dialog/modal after clicking a safe control.');
  }
  if (safeActions.some((action) => (action.deltas?.menus_opened ?? 0) > 0 || (action.deltas?.expanded_added ?? 0) > 0)) {
    interactions.push('dropdown/menu');
    evidence.push('Interactive probe expanded a menu/listbox/tab-like control.');
  }
  if (safeActions.some((action) => action.deltas?.url_changed)) {
    interactions.push('client-side navigation/state change');
    risks.push('Safe interactive probe changed the URL or route state; tests should assert navigation waits carefully.');
    evidence.push('Interactive probe changed the current URL after a safe action.');
  }
  if ((initial?.controls ?? []).length === 0) {
    risks.push('Interactive probe did not find safe controls to click on the initial page state.');
  }
  if (safeActions.length === 0 && (initial?.controls ?? []).length > 0) {
    risks.push('Interactive probe found controls but none matched the safe-click heuristic.');
  }
  if ((initial?.dom_summary?.roles ?? 0) === 0 && (initial?.dom_summary?.test_ids ?? 0) === 0) {
    risks.push('Interactive probe still did not observe semantic roles or test IDs in the hydrated state.');
  }
  if (safeActions.length > 0) {
    evidence.push(`Interactive probe exercised ${safeActions.length} safe control${safeActions.length === 1 ? '' : 's'}.`);
  }

  return {
    page_type: safeActions.some((action) => (action.after?.dom_summary?.dialogs ?? 0) > 0)
      ? 'interactive application view'
      : 'general web page',
    dom_summary: domSummary,
    interactions: unique(interactions),
    risks: unique(risks),
    evidence: unique(evidence),
    observed_routes: observedRoutes,
    safe_action_count: safeActions.length,
    discovered_controls: initial?.controls ?? []
  };
};

export const analyzeBrowserTarget = async (targetUrl, { executablePath = null, timeoutMs = BROWSER_INSPECT_TIMEOUT_MS } = {}) => {
  if (!targetUrl) {
    return {
      target_url: null,
      status: 'unknown',
      page_type: 'unknown',
      executable_path: null,
      dom_summary: summarizeHtmlDom(''),
      framework_hints: [],
      interactions: [],
      risks: [],
      evidence: []
    };
  }

  const browserExecutable = executablePath ?? findBrowserExecutable();
  if (!browserExecutable) {
    return {
      target_url: targetUrl,
      status: 'unknown',
      page_type: 'unknown',
      executable_path: null,
      dom_summary: summarizeHtmlDom(''),
      framework_hints: [],
      interactions: [],
      risks: [],
      evidence: ['No browser executable available for browser-backed inspection.']
    };
  }

  const args = [
    ...(browserExecutable.includes('chrome-headless-shell') ? [] : ['--headless=new']),
    '--no-sandbox',
    '--disable-gpu',
    `--virtual-time-budget=${BROWSER_VIRTUAL_TIME_BUDGET_MS}`,
    '--run-all-compositor-stages-before-draw',
    '--dump-dom',
    targetUrl
  ];

  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));

  const result = await new Promise((resolve) => {
    const child = spawn('timeout', [`${timeoutSeconds}s`, browserExecutable, ...args], {
      stdio: ['ignore', 'pipe', 'ignore']
    });
    let stdout = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 1024 * 1024 * 5) {
        child.kill('SIGTERM');
      }
    });

    child.on('error', (error) => resolve({ status: null, stdout, error }));
    child.on('close', (code) => resolve({ status: code, stdout }));
  });

  if (result.error) {
    return {
      target_url: targetUrl,
      status: 'unknown',
      page_type: 'unknown',
      executable_path: browserExecutable,
      dom_summary: summarizeHtmlDom(''),
      framework_hints: [],
      interactions: [],
      risks: [],
      evidence: [`Browser-backed inspection failed: ${result.error.message}`]
    };
  }

  if (result.status === 124) {
    return {
      target_url: targetUrl,
      status: 'unknown',
      page_type: 'unknown',
      executable_path: browserExecutable,
      dom_summary: summarizeHtmlDom(''),
      framework_hints: [],
      interactions: [],
      risks: [],
      evidence: ['Browser-backed inspection timed out.']
    };
  }

  if (result.status !== 0 && result.status !== null) {
    return {
      target_url: targetUrl,
      status: 'unknown',
      page_type: 'unknown',
      executable_path: browserExecutable,
      dom_summary: summarizeHtmlDom(''),
      framework_hints: [],
      interactions: [],
      risks: [],
      evidence: [`Browser-backed inspection failed with exit code ${result.status}.`]
    };
  }

  const html = String(result.stdout ?? '').trim();
  const findings = deriveBrowserFindings(html);
  return {
    target_url: targetUrl,
    status: findings.evidence.length || findings.interactions.length ? 'inferred' : 'unknown',
    executable_path: browserExecutable,
    html_length: html.length,
    ...findings
  };
};

export const analyzeInteractiveBrowserTarget = async (targetUrl, {
  executablePath = null,
  timeoutMs = INTERACTIVE_PROBE_TIMEOUT_MS,
  maxActions = INTERACTIVE_PROBE_MAX_ACTIONS,
  settleDelayMs = INTERACTIVE_PROBE_DELAY_MS
} = {}) => {
  if (!targetUrl) {
    return {
      target_url: null,
      status: 'unknown',
      page_type: 'unknown',
      dom_summary: summarizeHtmlDom(''),
      interactions: [],
      risks: [],
      evidence: [],
      observed_routes: [],
      safe_action_count: 0,
      discovered_controls: [],
      actions: []
    };
  }

  const browserExecutable = executablePath ?? findBrowserExecutable();
  if (!browserExecutable) {
    return {
      target_url: targetUrl,
      status: 'unknown',
      page_type: 'unknown',
      executable_path: null,
      dom_summary: summarizeHtmlDom(''),
      interactions: [],
      risks: [],
      evidence: ['No browser executable available for interactive probing.'],
      observed_routes: [],
      safe_action_count: 0,
      discovered_controls: [],
      actions: []
    };
  }

  const port = await getFreePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucy-qa-probe-'));
  const args = [
    ...(browserExecutable.includes('chrome-headless-shell') ? [] : ['--headless=new']),
    '--no-sandbox',
    '--disable-gpu',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ];

  const child = spawn(browserExecutable, args, {
    stdio: ['ignore', 'ignore', 'pipe']
  });

  const startedAt = Date.now();
  let stderr = '';
  let browserKilled = false;
  const killBrowser = () => {
    if (!browserKilled && child.exitCode === null) {
      browserKilled = true;
      child.kill('SIGTERM');
    }
  };

  try {
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    let jsonVersion = null;
    while (Date.now() - startedAt < timeoutMs) {
      if (child.exitCode !== null) {
        break;
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (response.ok) {
          jsonVersion = await response.json();
          break;
        }
      } catch {
        // browser not ready yet
      }
      await delay(150);
    }

    if (!jsonVersion?.webSocketDebuggerUrl) {
      return {
        target_url: targetUrl,
        status: 'unknown',
        page_type: 'unknown',
        executable_path: browserExecutable,
        dom_summary: summarizeHtmlDom(''),
        interactions: [],
        risks: [],
        evidence: ['Interactive browser probe could not connect to the DevTools endpoint.'],
        observed_routes: [],
        safe_action_count: 0,
        discovered_controls: [],
        actions: []
      };
    }

    const cdp = await createCdpSession(jsonVersion.webSocketDebuggerUrl);
    try {
      const { targetId } = await cdp.send('Target.createTarget', { url: targetUrl });
      const { sessionId } = await cdp.send('Target.attachToTarget', {
        targetId,
        flatten: true
      });
      await cdp.send('Page.enable', {}, sessionId);
      await cdp.send('Runtime.enable', {}, sessionId);
      await cdp.send('DOM.enable', {}, sessionId);
      await delay(settleDelayMs);

      const initialEval = await cdp.send('Runtime.evaluate', {
        expression: buildProbeSnapshotExpression(),
        awaitPromise: true,
        returnByValue: true
      }, sessionId);
      const initial = initialEval?.result?.value ?? null;
      const safeCandidates = (initial?.controls ?? []).filter((item) => item.safe).slice(0, maxActions);
      const actions = [];

      for (const candidate of safeCandidates) {
        const actionEval = await cdp.send('Runtime.evaluate', {
          expression: `(${buildProbeClickExpression(candidate.probe_id, settleDelayMs)})()`,
          awaitPromise: true,
          returnByValue: true
        }, sessionId);
        const actionResult = actionEval?.result?.value ?? { ok: false, error: 'Probe action returned no value.' };
        actions.push({
          probe_id: candidate.probe_id,
          text: candidate.text,
          tag: candidate.tag,
          ...actionResult
        });
      }

      const summary = summarizeInteractiveProbe({ initial, actions });
      return {
        target_url: targetUrl,
        status: summary.evidence.length || summary.interactions.length ? 'inferred' : 'unknown',
        executable_path: browserExecutable,
        page_title: initial?.title ?? '',
        ...summary,
        actions
      };
    } finally {
      await cdp.close();
    }
  } catch (error) {
    return {
      target_url: targetUrl,
      status: 'unknown',
      page_type: 'unknown',
      executable_path: browserExecutable,
      dom_summary: summarizeHtmlDom(''),
      interactions: [],
      risks: [],
      evidence: [`Interactive browser probe failed: ${error.message}`],
      observed_routes: [],
      safe_action_count: 0,
      discovered_controls: [],
      actions: []
    };
  } finally {
    killBrowser();
    if (child.exitCode === null) {
      await new Promise((resolve) => child.once('close', resolve));
    }
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
};

const summarizeCloudflareCrawlPayload = (payload = {}, targetUrl = null) => {
  const result = payload?.result ?? payload ?? {};
  const pages = result.pages ?? result.results ?? result.items ?? [];
  const discoveredRoutes = unique(pages.map((item) => item.url || item.final_url || item.href).filter(Boolean)).slice(0, 50);
  const sampleContent = pages.map((item) => item.markdown || item.html || JSON.stringify(item.json ?? item.structured_data ?? '')).join('\n');
  const lowered = sampleContent.toLowerCase();
  const evidence = [];
  const risks = [];
  const formats = unique(pages.flatMap((item) => Object.keys(item).filter((key) => ['html', 'markdown', 'json', 'structured_data'].includes(key))));

  if (discoveredRoutes.length) {
    evidence.push(`Cloudflare crawl discovered ${discoveredRoutes.length} route(s).`);
  }
  if (formats.length) {
    evidence.push(`Cloudflare crawl returned formats: ${formats.join(', ')}.`);
  }
  if (/login|sign in|password/.test(lowered)) {
    evidence.push('Crawl content suggests auth-related routes are present.');
  }
  if (/dashboard|table|grid/.test(lowered)) {
    evidence.push('Crawl content suggests dashboard or data-view routes are present.');
  }
  if (discoveredRoutes.length > 20) {
    risks.push('Large crawl route set suggests route prioritization will matter for QA coverage.');
  }

  return {
    target_url: targetUrl,
    status: discoveredRoutes.length ? 'inferred' : 'unknown',
    job_id: result.id ?? result.job_id ?? null,
    page_count: pages.length,
    discovered_routes: discoveredRoutes,
    formats,
    evidence,
    risks
  };
};

export const analyzeCloudflareCrawlTarget = async (targetUrl, { fetchImpl = globalThis.fetch } = {}) => {
  if (!targetUrl) {
    return {
      target_url: null,
      status: 'unknown',
      job_id: null,
      page_count: 0,
      discovered_routes: [],
      formats: [],
      evidence: [],
      risks: []
    };
  }

  const fixturePath = process.env.LUCY_QA_CLOUDFLARE_CRAWL_FIXTURE;
  if (fixturePath && fs.existsSync(fixturePath)) {
    const payload = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    return summarizeCloudflareCrawlPayload(payload, targetUrl);
  }

  const accountId = process.env.LUCY_QA_CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.LUCY_QA_CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    return {
      target_url: targetUrl,
      status: 'unknown',
      job_id: null,
      page_count: 0,
      discovered_routes: [],
      formats: [],
      evidence: ['Cloudflare crawl not configured; set LUCY_QA_CLOUDFLARE_ACCOUNT_ID and LUCY_QA_CLOUDFLARE_API_TOKEN or provide a fixture.'],
      risks: []
    };
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('Cloudflare crawl analysis requires fetch support');
  }

  const createResponse = await fetchImpl(`${CLOUDFLARE_API_BASE}/accounts/${accountId}/browser-rendering/crawl`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${apiToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ url: targetUrl })
  });
  if (!createResponse.ok) {
    throw new Error(`Cloudflare crawl start failed: ${createResponse.status} ${createResponse.statusText}`);
  }
  const created = await createResponse.json();
  const jobId = created?.result?.id ?? created?.result?.job_id ?? created?.id ?? null;
  if (!jobId) {
    return summarizeCloudflareCrawlPayload(created, targetUrl);
  }

  let latest = created;
  for (let poll = 0; poll < CLOUDFLARE_CRAWL_MAX_POLLS; poll += 1) {
    await delay(CLOUDFLARE_CRAWL_POLL_INTERVAL_MS);
    const response = await fetchImpl(`${CLOUDFLARE_API_BASE}/accounts/${accountId}/browser-rendering/crawl/${jobId}`, {
      headers: {
        'authorization': `Bearer ${apiToken}`
      }
    });
    if (!response.ok) {
      throw new Error(`Cloudflare crawl polling failed: ${response.status} ${response.statusText}`);
    }
    latest = await response.json();
    const status = latest?.result?.status ?? latest?.status ?? '';
    if (/complete|completed|success|done/i.test(status)) {
      break;
    }
  }

  return summarizeCloudflareCrawlPayload(latest, targetUrl);
};

export const analyzeRuntimeTarget = async (targetUrl, { fetchImpl = globalThis.fetch } = {}) => {
  if (!targetUrl) {
    return {
      target_url: null,
      status: 'unknown',
      page_type: 'unknown',
      framework_hints: [],
      deployment_hints: [],
      script_sources: [],
      runtime_headers: {},
      dom_summary: {
        forms: 0,
        buttons: 0,
        inputs: 0,
        dialogs: 0,
        tables: 0,
        navs: 0,
        mains: 0,
        iframes: 0,
        canvases: 0,
        test_ids: 0,
        roles: 0
      },
      interactions: [],
      risks: [],
      evidence: []
    };
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('Runtime target analysis requires fetch support');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RUNTIME_FETCH_TIMEOUT_MS);

  try {
    const response = await fetchImpl(targetUrl, {
      headers: {
        'user-agent': 'Lucy-QA-Runtime-Inspector/0.1'
      },
      signal: controller.signal
    });

    const html = await response.text();
    const lowered = html.toLowerCase();
    const runtimeHeaders = toHeaderObject(response.headers);
    const scriptSources = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((match) => match[1]).slice(0, 20);
    const frameworkHints = [];
    const deploymentHints = [];
    const evidence = [];
    const interactions = [];
    const risks = [];

    const addUnique = (arr, value) => {
      if (value && !arr.includes(value)) {
        arr.push(value);
      }
    };

    if (lowered.includes('__next_data__') || lowered.includes('/_next/') || runtimeHeaders['x-powered-by'] === 'Next.js') {
      addUnique(frameworkHints, 'Next.js');
      evidence.push('Runtime markers suggest Next.js.');
    }
    if (lowered.includes('__nuxt') || lowered.includes('/_nuxt/')) {
      addUnique(frameworkHints, 'Nuxt');
      evidence.push('Runtime markers suggest Nuxt.');
    }
    if (lowered.includes('ng-version=')) {
      addUnique(frameworkHints, 'Angular');
      evidence.push('ng-version marker suggests Angular.');
    }
    if (lowered.includes('/@vite/client') || lowered.includes('vite.svg')) {
      addUnique(frameworkHints, 'Vite');
      evidence.push('Runtime markers suggest Vite.');
    }
    if (lowered.includes('/_app/immutable/') || lowered.includes('data-sveltekit')) {
      addUnique(frameworkHints, 'SvelteKit');
      evidence.push('Runtime markers suggest SvelteKit.');
    }
    if (lowered.includes('__remix_context')) {
      addUnique(frameworkHints, 'Remix');
      evidence.push('Runtime markers suggest Remix.');
    }
    if (lowered.includes('wp-content') || lowered.includes('wordpress')) {
      addUnique(frameworkHints, 'WordPress');
      evidence.push('Runtime markers suggest WordPress.');
    }
    if (runtimeHeaders['x-vercel-id'] || lowered.includes('vercel.app')) {
      addUnique(deploymentHints, 'Vercel');
      evidence.push('Deployment headers/markers suggest Vercel.');
    }
    if (runtimeHeaders['x-nf-request-id']) {
      addUnique(deploymentHints, 'Netlify');
      evidence.push('Netlify request header detected.');
    }
    if ((runtimeHeaders.server ?? '').toLowerCase().includes('cloudflare') || runtimeHeaders['cf-ray']) {
      addUnique(deploymentHints, 'Cloudflare');
      evidence.push('Cloudflare edge headers detected.');
    }

    const domSummary = {
      forms: countMatches(html, /<form\b/gi),
      buttons: countMatches(html, /<button\b/gi),
      inputs: countMatches(html, /<input\b/gi),
      dialogs: countMatches(html, /<dialog\b/gi) + countMatches(html, /role=["']dialog["']/gi),
      tables: countMatches(html, /<table\b/gi) + countMatches(html, /role=["']grid["']/gi),
      navs: countMatches(html, /<nav\b/gi),
      mains: countMatches(html, /<main\b/gi),
      iframes: countMatches(html, /<iframe\b/gi),
      canvases: countMatches(html, /<canvas\b/gi),
      test_ids: countMatches(html, /data-testid=/gi) + countMatches(html, /data-test=/gi),
      roles: countMatches(html, /role=["'][^"']+["']/gi)
    };

    if (domSummary.dialogs > 0) addUnique(interactions, 'modal/dialog');
    if (domSummary.tables > 0) addUnique(interactions, 'table/grid');
    if (domSummary.iframes > 0) addUnique(interactions, 'iframe');
    if (domSummary.canvases > 0) addUnique(interactions, 'canvas/chart');
    if (domSummary.test_ids > 0) addUnique(evidence, 'Runtime DOM contains test id attributes.');
    if (domSummary.roles > 0) addUnique(evidence, 'Runtime DOM contains explicit ARIA roles.');
    if (domSummary.iframes > 0) addUnique(risks, 'Iframe content may require frame-aware automation and assertions.');
    if (domSummary.canvases > 0) addUnique(risks, 'Canvas-heavy UI may reduce semantic locator coverage.');
    if (!domSummary.roles && !domSummary.test_ids) addUnique(risks, 'No obvious semantic roles or test IDs were detected in the initial HTML response.');

    const pageType = domSummary.forms > 0 && /login|sign in|password|email/.test(lowered)
      ? 'auth'
      : domSummary.tables > 0
        ? 'dashboard/data view'
        : domSummary.forms > 0
          ? 'form'
          : 'general web page';

    return {
      target_url: targetUrl,
      final_url: response.url,
      status: evidence.length || interactions.length ? 'inferred' : 'unknown',
      http_status: response.status,
      page_type: pageType,
      framework_hints: frameworkHints,
      deployment_hints: deploymentHints,
      script_sources: scriptSources,
      runtime_headers: runtimeHeaders,
      dom_summary: domSummary,
      interactions,
      risks,
      evidence
    };
  } finally {
    clearTimeout(timer);
  }
};

const EXPLICIT_MODE_PATTERNS = [
  { mode: 'e2e', label: 'E2E', pattern: /\b(e2e|end-to-end|end to end)\b/i },
  { mode: 'whitebox', label: 'Whitebox', pattern: /\b(whitebox|white-box)\b/i },
  { mode: 'blackbox', label: 'Blackbox', pattern: /\b(blackbox|black-box)\b/i },
  { mode: 'api', label: 'API', pattern: /\bapi\b/i },
  { mode: 'unit', label: 'Unit', pattern: /\bunit\b/i },
  { mode: 'integration', label: 'Integration', pattern: /\bintegration\b/i }
];

export const buildQaTypeClarificationMessage = () => [
  'Testing type is not clear yet, so Lucy QA should not guess.',
  '',
  'Please specify one of these options:',
  '- E2E: full user flow through the browser/app from the user perspective.',
  '- Whitebox: test using internal code/logic knowledge such as services, middleware, hooks, or implementation details.',
  '- Blackbox: test only observable behavior without depending on internals.',
  '- API: validate endpoints, contracts, auth, payloads, and backend behavior.',
  '- Unit: test isolated functions, components, hooks, or modules.',
  '- Integration: test multiple parts working together such as API + DB or frontend + backend.',
  '',
  'You can also combine them when appropriate, for example:',
  '- E2E + Blackbox',
  '- API + Integration',
  '- Unit + Whitebox'
].join('\n');

export const classifyQaIntent = (goal) => {
  const normalizedGoal = normalizeWhitespace(goal);
  const explicitMatches = EXPLICIT_MODE_PATTERNS.filter(({ pattern }) => pattern.test(normalizedGoal));
  const explicitModes = explicitMatches.map(({ mode }) => mode);
  const primary = explicitModes[0] ?? null;
  const secondary = explicitModes.slice(1);
  const needsClarification = explicitModes.length === 0;

  const reasoning = explicitModes.length
    ? [`User explicitly requested: ${explicitMatches.map((item) => item.label).join(', ')}.`]
    : ['Testing type was not explicitly specified, so Lucy QA should ask instead of guessing.'];

  return {
    primary_mode: primary,
    secondary_modes: secondary,
    explicit_modes: explicitModes,
    status: explicitModes.length ? 'confirmed' : 'unknown',
    needs_clarification: needsClarification,
    reasoning,
    clarification_message: needsClarification ? buildQaTypeClarificationMessage() : null
  };
};

export const detectRepoStack = ({ cwd = process.cwd() } = {}) => {
  const packageJson = readJsonIfExists(path.join(cwd, 'package.json'));
  const dependencies = {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {})
  };

  const stack = {
    cwd,
    frontend: [],
    backend: [],
    test_frameworks: [],
    api_styles: [],
    data_layers: [],
    deployment: [],
    evidence: []
  };

  const add = (category, value, evidence) => {
    if (value && !stack[category].includes(value)) {
      stack[category].push(value);
    }
    if (evidence) {
      stack.evidence.push(evidence);
    }
  };

  const hasDep = (name) => Boolean(dependencies[name]);
  const hasFile = (name) => fileExists(path.join(cwd, name));
  const hasAnyFile = (...names) => names.some((name) => hasFile(name));

  if (hasDep('next') || hasAnyFile('next.config.js', 'next.config.mjs', 'next.config.ts')) add('frontend', 'Next.js', 'Detected next dependency/config.');
  if (hasDep('react') || hasDep('react-dom')) add('frontend', 'React', 'Detected react dependency.');
  if (hasDep('vue') || hasDep('nuxt')) add('frontend', hasDep('nuxt') ? 'Nuxt' : 'Vue', 'Detected vue/nuxt dependency.');
  if (hasDep('svelte') || hasDep('@sveltejs/kit')) add('frontend', hasDep('@sveltejs/kit') ? 'SvelteKit' : 'Svelte', 'Detected svelte dependency.');
  if (hasDep('@angular/core')) add('frontend', 'Angular', 'Detected Angular dependency.');
  if (hasDep('vite') || hasAnyFile('vite.config.js', 'vite.config.mjs', 'vite.config.ts')) add('frontend', 'Vite', 'Detected Vite dependency/config.');

  if (hasDep('express')) add('backend', 'Express', 'Detected express dependency.');
  if (hasDep('fastify')) add('backend', 'Fastify', 'Detected fastify dependency.');
  if (hasDep('@nestjs/core')) add('backend', 'NestJS', 'Detected NestJS dependency.');
  if (hasDep('hono')) add('backend', 'Hono', 'Detected Hono dependency.');

  if (hasDep('@playwright/test') || hasAnyFile('playwright.config.js', 'playwright.config.mjs', 'playwright.config.ts')) add('test_frameworks', 'Playwright', 'Detected Playwright dependency/config.');
  if (hasDep('cypress') || hasAnyFile('cypress.config.js', 'cypress.config.mjs', 'cypress.config.ts')) add('test_frameworks', 'Cypress', 'Detected Cypress dependency/config.');
  if (hasDep('vitest') || hasAnyFile('vitest.config.js', 'vitest.config.mjs', 'vitest.config.ts')) add('test_frameworks', 'Vitest', 'Detected Vitest dependency/config.');
  if (hasDep('jest') || hasDep('@jest/globals') || hasAnyFile('jest.config.js', 'jest.config.mjs', 'jest.config.ts')) add('test_frameworks', 'Jest', 'Detected Jest dependency/config.');
  if (hasDep('supertest')) add('test_frameworks', 'Supertest', 'Detected Supertest dependency.');

  if (hasDep('graphql') || hasDep('@apollo/server') || hasDep('urql')) add('api_styles', 'GraphQL', 'Detected GraphQL-related dependency.');
  if (hasDep('@trpc/server') || hasDep('@trpc/client')) add('api_styles', 'tRPC', 'Detected tRPC dependency.');
  if (stack.backend.length || hasAnyFile('openapi.yaml', 'openapi.yml', 'swagger.json')) add('api_styles', 'REST-ish HTTP', 'Detected backend/openapi evidence.');

  if (hasDep('@prisma/client') || hasFile('prisma/schema.prisma')) add('data_layers', 'Prisma', 'Detected Prisma dependency/schema.');
  if (hasDep('drizzle-orm')) add('data_layers', 'Drizzle', 'Detected Drizzle dependency.');
  if (hasDep('mongoose')) add('data_layers', 'Mongoose', 'Detected Mongoose dependency.');
  if (hasDep('typeorm')) add('data_layers', 'TypeORM', 'Detected TypeORM dependency.');
  if (hasDep('sequelize')) add('data_layers', 'Sequelize', 'Detected Sequelize dependency.');

  if (hasFile('vercel.json') || hasDep('vercel')) add('deployment', 'Vercel', 'Detected Vercel config/dependency.');
  if (hasFile('netlify.toml')) add('deployment', 'Netlify', 'Detected Netlify config.');
  if (hasAnyFile('Dockerfile', 'docker-compose.yml', 'docker-compose.yaml')) add('deployment', 'Docker', 'Detected Docker config.');

  return {
    ...stack,
    status: stack.evidence.length ? 'inferred' : 'unknown'
  };
};

export const analyzeDomStrategy = (goal, stack = {}) => {
  const normalizedGoal = normalizeWhitespace(goal).toLowerCase();
  const interactions = [];
  const risks = [];

  const includeIf = (condition, target, value) => {
    if (condition && !target.includes(value)) {
      target.push(value);
    }
  };

  includeIf(/modal|dialog/.test(normalizedGoal), interactions, 'modal/dialog');
  includeIf(/dropdown|menu|select/.test(normalizedGoal), interactions, 'dropdown/menu');
  includeIf(/combobox|autocomplete/.test(normalizedGoal), interactions, 'combobox/autocomplete');
  includeIf(/table|grid|datatable/.test(normalizedGoal), interactions, 'table/grid');
  includeIf(/upload|file/.test(normalizedGoal), interactions, 'file upload');
  includeIf(/iframe/.test(normalizedGoal), interactions, 'iframe');
  includeIf(/drag|drop/.test(normalizedGoal), interactions, 'drag and drop');
  includeIf(/canvas|chart/.test(normalizedGoal), interactions, 'canvas/chart');
  includeIf(/scroll|infinite/.test(normalizedGoal), interactions, 'scroll/infinite content');
  includeIf(/accessibility|a11y|aria|screen reader/.test(normalizedGoal), interactions, 'accessibility-sensitive UI');
  includeIf(/virtual|virtualized/.test(normalizedGoal), risks, 'Virtualized content can make selectors and assertions flaky.');
  includeIf(/iframe/.test(normalizedGoal), risks, 'Iframe boundaries need frame-aware selectors and waits.');
  includeIf(/canvas/.test(normalizedGoal), risks, 'Canvas-heavy UI may need fallback assertions beyond semantic DOM locators.');
  includeIf(/dynamic|hydration|loading/.test(normalizedGoal), risks, 'Hydration/loading states may require explicit waits and resilient assertions.');

  let selector_strategy = 'role-first';
  if (stack.test_frameworks.includes('Playwright')) {
    selector_strategy = 'role-first with getByRole/getByLabel before test IDs or CSS';
  } else if (stack.test_frameworks.includes('Cypress')) {
    selector_strategy = 'data-testid-first, then accessible text or role-based assertions where available';
  } else if (interactions.includes('canvas/chart') || interactions.includes('iframe')) {
    selector_strategy = 'mixed strategy with semantic locators first and targeted fallbacks for complex widgets';
  }

  const page_type = /login|sign in|auth/.test(normalizedGoal)
    ? 'auth'
    : /checkout|cart|payment/.test(normalizedGoal)
      ? 'transactional flow'
      : /dashboard/.test(normalizedGoal)
        ? 'dashboard'
        : /settings|profile/.test(normalizedGoal)
          ? 'settings'
          : /form/.test(normalizedGoal)
            ? 'form'
            : 'general web flow';

  const accessibility_quality = /accessibility|a11y|aria|label/.test(normalizedGoal) ? 'focus explicitly on accessibility semantics' : 'unknown';
  const selector_quality = /testid|data-testid|aria|label|role/.test(normalizedGoal) ? 'likely workable if semantics exist' : 'unknown — inspect DOM before finalizing locators';

  return {
    page_type,
    selector_strategy,
    selector_quality,
    accessibility_quality,
    interactions,
    risks,
    status: interactions.length || risks.length ? 'inferred' : 'unknown'
  };
};

export const buildContext7Queries = ({ goal, intent, stack, dom, crawl = null }) => {
  const focus = [];
  const primaryFramework = stack.test_frameworks[0] ?? stack.frontend[0] ?? stack.backend[0] ?? null;
  const primaryModeLabel = intent.primary_mode === 'e2e' ? 'end-to-end' : intent.primary_mode;

  if (primaryFramework && primaryModeLabel) {
    focus.push(`${primaryFramework} ${primaryModeLabel} testing best practices for ${goal}`);
  }
  if (stack.frontend[0] && stack.test_frameworks[0] && stack.frontend[0] !== stack.test_frameworks[0]) {
    focus.push(`${stack.test_frameworks[0]} testing guidance for ${stack.frontend[0]} ${goal}`);
  }
  if (intent.primary_mode === 'api' && stack.backend[0]) {
    focus.push(`${stack.backend[0]} API testing patterns for ${goal}`);
  }
  if (dom.interactions.includes('modal/dialog')) {
    focus.push(`${stack.test_frameworks[0] ?? 'Playwright'} modal dialog locator and assertion patterns`);
  }
  if (dom.interactions.includes('table/grid')) {
    focus.push(`${stack.test_frameworks[0] ?? 'Playwright'} table grid sorting filtering assertion patterns`);
  }
  if (dom.interactions.includes('accessibility-sensitive UI')) {
    focus.push(`${stack.test_frameworks[0] ?? 'Playwright'} accessibility locator role label assertion guidance`);
  }
  if (crawl?.discovered_routes?.length >= 3) {
    focus.push(`${stack.test_frameworks[0] ?? 'Playwright'} multi-page navigation coverage for discovered site routes`);
  }
  if (!focus.length) {
    focus.push(`QA testing guidance for ${goal}`);
  }

  return unique(focus).slice(0, 3);
};

export const buildQaIntake = (goal, { cwd = process.cwd(), targetUrl = null } = {}) => {
  const intent = classifyQaIntent(goal);
  const stack = detectRepoStack({ cwd });
  const dom = analyzeDomStrategy(goal, stack);
  const detectedTargetUrl = extractTargetUrl(goal, targetUrl);

  return {
    goal: normalizeWhitespace(goal),
    target_url: detectedTargetUrl,
    intent,
    stack,
    dom,
    runtime: {
      target_url: detectedTargetUrl,
      status: detectedTargetUrl ? 'pending' : 'unknown',
      page_type: 'unknown',
      framework_hints: [],
      deployment_hints: [],
      script_sources: [],
      runtime_headers: {},
      dom_summary: summarizeHtmlDom(''),
      interactions: [],
      risks: [],
      evidence: []
    },
    browser: {
      target_url: detectedTargetUrl,
      status: detectedTargetUrl ? 'pending' : 'unknown',
      page_type: 'unknown',
      executable_path: null,
      html_length: 0,
      dom_summary: summarizeHtmlDom(''),
      framework_hints: [],
      interactions: [],
      risks: [],
      evidence: []
    },
    probe: {
      target_url: detectedTargetUrl,
      status: detectedTargetUrl ? 'pending' : 'unknown',
      page_type: 'unknown',
      executable_path: null,
      dom_summary: summarizeHtmlDom(''),
      interactions: [],
      risks: [],
      evidence: [],
      observed_routes: [],
      safe_action_count: 0,
      discovered_controls: [],
      actions: []
    },
    crawl: {
      target_url: detectedTargetUrl,
      status: detectedTargetUrl ? 'pending' : 'unknown',
      job_id: null,
      page_count: 0,
      discovered_routes: [],
      formats: [],
      evidence: [],
      risks: []
    },
    knowledge: {
      status: 'unknown',
      project_key: null,
      summary: 'No reusable QA knowledge loaded yet.',
      learned_frameworks: [],
      preferred_selector_strategies: [],
      known_risks: [],
      observed_routes: [],
      proven_interactions: []
    },
    docs_queries: intent.needs_clarification ? [] : buildContext7Queries({ goal, intent, stack, dom }),
    recommended_test_strategy: intent.needs_clarification
      ? 'Pause and clarify the requested testing type before planning or generating test assets.'
      : intent.primary_mode === 'e2e'
        ? 'Start with smoke-critical browser flows, then expand with risk-based UI and integration checks.'
        : intent.primary_mode === 'api'
          ? 'Start with backend contract and auth validation, then cover error handling and integration boundaries.'
          : intent.primary_mode === 'unit'
            ? 'Start with isolated logic coverage, then add edge cases and mock-driven dependency checks.'
            : 'Proceed using the explicitly requested test type and expand only where the scope requires it.'
  };
};

export const enrichQaIntakeWithRuntime = (intake, runtime) => {
  if (!runtime?.target_url) {
    return intake;
  }

  const nextStack = {
    ...intake.stack,
    frontend: unique([...intake.stack.frontend, ...runtime.framework_hints]),
    deployment: unique([...intake.stack.deployment, ...runtime.deployment_hints]),
    evidence: unique([...intake.stack.evidence, ...runtime.evidence]),
    status: intake.stack.status === 'unknown' && (runtime.framework_hints.length || runtime.deployment_hints.length || runtime.evidence.length)
      ? 'inferred'
      : intake.stack.status
  };

  const nextDom = {
    ...intake.dom,
    page_type: runtime.page_type !== 'unknown' ? runtime.page_type : intake.dom.page_type,
    interactions: unique([...intake.dom.interactions, ...runtime.interactions]),
    risks: unique([...intake.dom.risks, ...runtime.risks]),
    selector_strategy: runtime.dom_summary.test_ids > 0
      ? 'data-testid or role-first, depending on observed markup'
      : runtime.dom_summary.roles > 0
        ? 'role-first based on observed semantic markup'
        : intake.dom.selector_strategy,
    selector_quality: runtime.dom_summary.test_ids > 0 || runtime.dom_summary.roles > 0
      ? 'runtime DOM shows test IDs or semantic roles'
      : intake.dom.selector_quality,
    accessibility_quality: runtime.dom_summary.roles > 0
      ? 'runtime DOM includes semantic roles; validate labels and focus behavior'
      : intake.dom.accessibility_quality,
    status: runtime.status === 'inferred' ? 'inferred' : intake.dom.status
  };

  const enriched = {
    ...intake,
    stack: nextStack,
    dom: nextDom,
    runtime,
    docs_queries: intake.intent.needs_clarification
      ? []
      : buildContext7Queries({ goal: intake.goal, intent: intake.intent, stack: nextStack, dom: nextDom })
  };

  return enriched;
};

export const enrichQaIntakeWithBrowser = (intake, browser) => {
  if (!browser?.target_url) {
    return intake;
  }

  const nextStack = {
    ...intake.stack,
    frontend: unique([...intake.stack.frontend, ...browser.framework_hints]),
    evidence: unique([...intake.stack.evidence, ...browser.evidence]),
    status: intake.stack.status === 'unknown' && (browser.framework_hints.length || browser.evidence.length)
      ? 'inferred'
      : intake.stack.status
  };

  const nextDom = {
    ...intake.dom,
    page_type: browser.page_type !== 'unknown' ? browser.page_type : intake.dom.page_type,
    interactions: unique([...intake.dom.interactions, ...browser.interactions]),
    risks: unique([...intake.dom.risks, ...browser.risks]),
    selector_strategy: browser.dom_summary.test_ids > 0
      ? 'browser-backed DOM shows test IDs; combine data-testid and role-first selectors'
      : browser.dom_summary.roles > 0
        ? 'browser-backed DOM shows semantic roles; prefer role-first selectors'
        : intake.dom.selector_strategy,
    selector_quality: browser.dom_summary.test_ids > 0 || browser.dom_summary.roles > 0
      ? 'browser-backed DOM confirms selector hooks in the hydrated page'
      : intake.dom.selector_quality,
    accessibility_quality: browser.dom_summary.roles > 0
      ? 'hydrated DOM exposes semantic roles; validate labels, focus order, and keyboard behavior'
      : intake.dom.accessibility_quality,
    status: browser.status === 'inferred' ? 'inferred' : intake.dom.status
  };

  return {
    ...intake,
    stack: nextStack,
    dom: nextDom,
    browser,
    docs_queries: intake.intent.needs_clarification
      ? []
      : buildContext7Queries({ goal: intake.goal, intent: intake.intent, stack: nextStack, dom: nextDom })
  };
};

export const enrichQaIntakeWithProbe = (intake, probe) => {
  if (!probe?.target_url) {
    return intake;
  }

  const nextDom = {
    ...intake.dom,
    page_type: probe.page_type !== 'unknown' ? probe.page_type : intake.dom.page_type,
    interactions: unique([...intake.dom.interactions, ...probe.interactions]),
    risks: unique([...intake.dom.risks, ...probe.risks]),
    selector_strategy: probe.safe_action_count > 0
      ? 'browser-probed selectors should prioritize controls proven stable during safe interactive probing'
      : intake.dom.selector_strategy,
    selector_quality: probe.safe_action_count > 0
      ? 'interactive probe validated at least some stable controls in the hydrated page'
      : intake.dom.selector_quality,
    accessibility_quality: probe.dom_summary.roles > 0
      ? 'interactive probe observed semantic roles during hydrated interactions; validate keyboard and focus behavior'
      : intake.dom.accessibility_quality,
    status: probe.status === 'inferred' ? 'inferred' : intake.dom.status
  };

  return {
    ...intake,
    dom: nextDom,
    probe,
    docs_queries: intake.intent.needs_clarification
      ? []
      : buildContext7Queries({ goal: intake.goal, intent: intake.intent, stack: intake.stack, dom: nextDom, crawl: intake.crawl })
  };
};

export const enrichQaIntakeWithCrawl = (intake, crawl) => {
  if (!crawl?.target_url) {
    return intake;
  }

  const nextDom = {
    ...intake.dom,
    risks: unique([...intake.dom.risks, ...(crawl.risks ?? [])]),
    status: crawl.status === 'inferred' ? 'inferred' : intake.dom.status
  };

  return {
    ...intake,
    dom: nextDom,
    crawl,
    docs_queries: intake.intent.needs_clarification
      ? []
      : buildContext7Queries({ goal: intake.goal, intent: intake.intent, stack: intake.stack, dom: nextDom, crawl })
  };
};

export const enrichQaIntakeWithKnowledge = (intake, knowledge) => {
  if (!knowledge?.project_key) {
    return intake;
  }

  const hasKnowledge = Boolean(
    knowledge.learned_frameworks?.length ||
    knowledge.deployment_hints?.length ||
    knowledge.preferred_selector_strategies?.length ||
    knowledge.known_risks?.length ||
    knowledge.observed_routes?.length ||
    knowledge.proven_interactions?.length ||
    (knowledge.stats?.runs_total ?? 0) > 0
  );

  const nextStack = {
    ...intake.stack,
    frontend: unique([...(intake.stack.frontend ?? []), ...(knowledge.learned_frameworks ?? [])]),
    deployment: unique([...(intake.stack.deployment ?? []), ...(knowledge.deployment_hints ?? [])]),
    status: knowledge.learned_frameworks?.length || knowledge.deployment_hints?.length
      ? (intake.stack.status === 'unknown' ? 'inferred' : intake.stack.status)
      : intake.stack.status
  };

  const nextDom = {
    ...intake.dom,
    selector_strategy: intake.dom.selector_strategy === 'role-first' && knowledge.preferred_selector_strategies?.[0]
      ? `${intake.dom.selector_strategy}; project memory also suggests ${knowledge.preferred_selector_strategies[0]}`
      : intake.dom.selector_strategy,
    risks: unique([...(intake.dom.risks ?? []), ...(knowledge.known_risks ?? [])]),
    interactions: unique([...(intake.dom.interactions ?? []), ...(knowledge.proven_interactions ?? [])]),
    status: knowledge.known_risks?.length || knowledge.proven_interactions?.length
      ? (intake.dom.status === 'unknown' ? 'inferred' : intake.dom.status)
      : intake.dom.status
  };

  return {
    ...intake,
    stack: nextStack,
    dom: nextDom,
    knowledge: {
      status: hasKnowledge ? 'inferred' : 'unknown',
      project_key: knowledge.project_key,
      summary: hasKnowledge ? `Loaded reusable QA knowledge for ${knowledge.project_key}.` : `No prior reusable QA knowledge found for ${knowledge.project_key} yet.`,
      learned_frameworks: knowledge.learned_frameworks ?? [],
      preferred_selector_strategies: knowledge.preferred_selector_strategies ?? [],
      known_risks: knowledge.known_risks ?? [],
      observed_routes: knowledge.observed_routes ?? [],
      proven_interactions: knowledge.proven_interactions ?? []
    },
    docs_queries: intake.intent.needs_clarification
      ? []
      : buildContext7Queries({ goal: intake.goal, intent: intake.intent, stack: nextStack, dom: nextDom, crawl: intake.crawl })
  };
};

const formatList = (items = [], emptyText = 'none detected yet') => items.length ? items.join(', ') : emptyText;
const formatBulletLines = (items = [], emptyText = 'none') => items.length ? items.map((item) => `- ${item}`) : [`- ${emptyText}`];

const buildIntakeSummaryBlock = (analysis) => {
  if (!analysis) {
    return ['No structured intake analysis available.'];
  }

  return [
    'Structured intake analysis:',
    `- Primary testing mode: ${analysis.intent.primary_mode ?? 'not confirmed yet'}`,
    `- Secondary modes: ${formatList(analysis.intent.secondary_modes, 'none')}`,
    `- Intent status: ${analysis.intent.status}`,
    `- Frontend stack: ${formatList(analysis.stack.frontend)}`,
    `- Backend stack: ${formatList(analysis.stack.backend)}`,
    `- Stack status: ${analysis.stack.status}`,
    `- Test frameworks: ${formatList(analysis.stack.test_frameworks)}`,
    `- API styles: ${formatList(analysis.stack.api_styles)}`,
    `- Data layers: ${formatList(analysis.stack.data_layers)}`,
    `- Deployment hints: ${formatList(analysis.stack.deployment)}`,
    `- Runtime target: ${analysis.runtime?.target_url ?? 'none'}`,
    `- Runtime status: ${analysis.runtime?.status ?? 'unknown'}`,
    `- Runtime framework hints: ${formatList(analysis.runtime?.framework_hints ?? [])}`,
    `- Runtime deployment hints: ${formatList(analysis.runtime?.deployment_hints ?? [])}`,
    `- Runtime DOM counts: forms=${analysis.runtime?.dom_summary?.forms ?? 0}, buttons=${analysis.runtime?.dom_summary?.buttons ?? 0}, inputs=${analysis.runtime?.dom_summary?.inputs ?? 0}, dialogs=${analysis.runtime?.dom_summary?.dialogs ?? 0}, tables=${analysis.runtime?.dom_summary?.tables ?? 0}, test_ids=${analysis.runtime?.dom_summary?.test_ids ?? 0}, roles=${analysis.runtime?.dom_summary?.roles ?? 0}`,
    `- Browser inspection status: ${analysis.browser?.status ?? 'unknown'}`,
    `- Browser framework hints: ${formatList(analysis.browser?.framework_hints ?? [])}`,
    `- Browser DOM counts: forms=${analysis.browser?.dom_summary?.forms ?? 0}, buttons=${analysis.browser?.dom_summary?.buttons ?? 0}, inputs=${analysis.browser?.dom_summary?.inputs ?? 0}, dialogs=${analysis.browser?.dom_summary?.dialogs ?? 0}, tables=${analysis.browser?.dom_summary?.tables ?? 0}, test_ids=${analysis.browser?.dom_summary?.test_ids ?? 0}, roles=${analysis.browser?.dom_summary?.roles ?? 0}`,
    `- Interactive probe status: ${analysis.probe?.status ?? 'unknown'}`,
    `- Interactive probe actions: ${analysis.probe?.safe_action_count ?? 0}`,
    `- Interactive probe routes: ${formatList(analysis.probe?.observed_routes ?? [])}`,
    `- Crawl status: ${analysis.crawl?.status ?? 'unknown'}`,
    `- Crawl page count: ${analysis.crawl?.page_count ?? 0}`,
    `- Crawl discovered routes: ${formatList(analysis.crawl?.discovered_routes ?? [])}`,
    `- Knowledge status: ${analysis.knowledge?.status ?? 'unknown'}`,
    `- Knowledge project key: ${analysis.knowledge?.project_key ?? 'none'}`,
    `- DOM/page type: ${analysis.dom.page_type}`,
    `- DOM status: ${analysis.dom.status}`,
    `- Selector strategy: ${analysis.dom.selector_strategy}`,
    `- Selector quality: ${analysis.dom.selector_quality}`,
    `- Accessibility signal: ${analysis.dom.accessibility_quality}`,
    `- Interaction types: ${formatList(analysis.dom.interactions)}`,
    `- DOM/testing risks: ${formatList(analysis.dom.risks)}`,
    '',
    'Intent reasoning:',
    ...formatBulletLines(analysis.intent.reasoning),
    '',
    'Repo evidence:',
    ...formatBulletLines(analysis.stack.evidence, 'No strong repo evidence detected.'),
    '',
    'Runtime evidence:',
    ...formatBulletLines(analysis.runtime?.evidence ?? [], 'No runtime evidence detected yet.'),
    '',
    'Browser evidence:',
    ...formatBulletLines(analysis.browser?.evidence ?? [], 'No browser-backed evidence detected yet.'),
    '',
    'Interactive probe evidence:',
    ...formatBulletLines(analysis.probe?.evidence ?? [], 'No interactive probe evidence detected yet.'),
    '',
    'Cloudflare crawl evidence:',
    ...formatBulletLines(analysis.crawl?.evidence ?? [], 'No crawl evidence detected yet.'),
    '',
    'Project knowledge evidence:',
    ...formatBulletLines([
      analysis.knowledge?.summary,
      ...(analysis.knowledge?.learned_frameworks?.length ? [`Known frameworks: ${analysis.knowledge.learned_frameworks.join(', ')}`] : []),
      ...(analysis.knowledge?.known_risks?.length ? [`Known risks: ${analysis.knowledge.known_risks.join('; ')}`] : [])
    ].filter(Boolean), 'No reusable project knowledge detected yet.'),
    '',
    'Recommended strategy:',
    `- ${analysis.recommended_test_strategy}`,
    ...(analysis.intent.needs_clarification ? ['', 'Clarification needed:', `- ${analysis.intent.clarification_message.replace(/\n/g, '\n- ').replace(/^- /, '')}`] : []),
    ...(analysis.intent.needs_clarification ? [] : ['', 'Planned Context7 docs queries:', ...formatBulletLines(analysis.docs_queries)])
  ];
};

const buildDocsSummaryBlock = (docsContext = []) => {
  if (!docsContext.length) {
    return ['Context7 documentation hints: none fetched yet.'];
  }

  const lines = ['Context7 documentation hints:'];
  docsContext.forEach((doc, index) => {
    lines.push(`- Query ${index + 1}: ${doc.query}`);
    lines.push(`  - Engine: ${doc.engine}`);
    if (doc.selected_library) {
      lines.push(`  - Selected library: ${doc.selected_library}`);
    }
    if (doc.results?.[0]) {
      lines.push(`  - Top result: ${doc.results[0].title} — ${doc.results[0].url}`);
      lines.push(`  - Excerpt: ${doc.results[0].excerpt || 'none'}`);
    } else {
      lines.push('  - Top result: none');
    }
  });
  return lines;
};

export const buildQaPlanPrompt = (goal, { analysis = null, docsContext = [] } = {}) => {
  const baseline = loadText(QA_BASELINE_PATH);
  const template = loadText(QA_TEMPLATE_PATH);

  return [
    'You are Lucy QA in /qa mode.',
    'Generate a practical QA plan for the user goal below.',
    'Follow the QA baseline strictly.',
    'Use beginner-friendly wording.',
    'Make the output actionable and structured.',
    'Return the final answer in markdown-like plain text using the required section headings.',
    '',
    'User goal:',
    goal,
    '',
    ...buildIntakeSummaryBlock(analysis),
    '',
    ...buildDocsSummaryBlock(docsContext),
    '',
    'QA baseline:',
    baseline,
    '',
    'Preferred output template:',
    template,
    '',
    'Additional requirements:',
    '- Include smoke-first coverage and then risk-based expansion.',
    '- Include both positive and negative scenarios.',
    '- Mention UI and UX checks where relevant.',
    '- Distinguish severity from priority if defects are mentioned.',
    '- Use the detected testing mode, stack hints, DOM risks, interactive probe findings, Cloudflare crawl site-discovery clues, reusable project knowledge, and Context7 guidance when available.',
    '- If the task is UI-heavy, explicitly mention locator strategy, proven interactive controls, known project risks, and UI flakiness risks in the plan.',
    '- Do not leave sections empty; if something is unknown, state an assumption explicitly.'
  ].join('\n');
};

export const buildQaCasesPrompt = (goal, { analysis = null, docsContext = [] } = {}) => {
  const baseline = loadText(QA_BASELINE_PATH);
  const template = loadText(QA_TEMPLATE_PATH);

  return [
    'You are Lucy QA in /qa mode.',
    'Generate atomic QA test cases for the user goal below.',
    'Follow the QA baseline strictly.',
    'Use beginner-friendly wording.',
    'Keep every test case atomic: one behavior, one expected result, one clear purpose.',
    'Return the final answer in markdown-like plain text using the required section headings.',
    '',
    'User goal:',
    goal,
    '',
    ...buildIntakeSummaryBlock(analysis),
    '',
    ...buildDocsSummaryBlock(docsContext),
    '',
    'QA baseline:',
    baseline,
    '',
    'Reference output template:',
    template,
    '',
    'Required output sections:',
    '- Test Scope',
    '- Assumptions',
    '- Suite List',
    '- Atomic Test Cases',
    '- Severity Model',
    '- Next Steps',
    '',
    'Atomic Test Cases section rules:',
    '- Organize cases by suite.',
    '- Give each case a stable ID such as TC-001.',
    '- For each case include: Title, Type, Priority, Preconditions, Steps, Expected Result, Actual Result, Status, Evidence.',
    '- Use Type values such as positive, negative, edge, ui, ux, accessibility, or security when relevant.',
    '- Steps must be short, numbered, and executable by a beginner tester.',
    '- Expected Result must describe one focused outcome only.',
    '- Set Actual Result to T.B.D. and Status to Not Run for generated cases.',
    '- Evidence should state what screenshot, log, or observation should be captured.',
    '',
    'Coverage requirements:',
    '- Start with smoke-critical flows first.',
    '- Include positive, negative, and edge scenarios.',
    '- Include UI and UX checks when relevant.',
    '- If the primary testing mode is e2e or blackbox, include realistic user-journey cases and observable behavior only.',
    '- If the primary testing mode is whitebox, unit, api, or integration, include stack-aware cases that fit the detected implementation and test toolchain.',
    '- Use the detected stack, interactive probe findings, Cloudflare crawl discovery, reusable project knowledge, and Context7 hints when they are available; do not invent frameworks that were not detected unless clearly labeled as an assumption.',
    '- Reflect DOM findings in UI-related cases: locator strategy, accessibility expectations, complex widgets, proven interactive controls, known project risks, and flakiness risks must influence the cases.',
    '- Call out assumptions explicitly if product behavior is unknown.',
    '- Do not merge multiple behaviors into one case.'
  ].join('\n');
};

export const buildQaBugPrompt = (finding) => {
  const baseline = loadText(QA_BASELINE_PATH);

  return [
    'You are Lucy QA in /qa mode.',
    'Generate a defect-ready bug report from the finding below.',
    'Follow the QA baseline strictly.',
    'Use beginner-friendly wording.',
    'Start the output with the heading: Lucy QA bug report.',
    'Return the final answer in markdown-like plain text using the required section headings.',
    '',
    'Finding:',
    finding,
    '',
    'QA baseline:',
    baseline,
    '',
    'Required sections:',
    '- Title',
    '- Environment',
    '- Precondition',
    '- Exact steps',
    '- Expected vs Actual',
    '- Severity',
    '- Priority',
    '- Evidence',
    '- Notes',
    '',
    'Rules:',
    '- If information is unknown, state an explicit assumption.',
    '- Distinguish severity from priority.',
    '- Keep steps exact and reproducible.',
    '- Keep the wording concise and defect-ready.'
  ].join('\n');
};

export const planQaTask = (goal) => ({
  goal,
  implemented: true,
  task_type: 'qa',
  prompt: buildQaPlanPrompt(goal)
});

export const designQaCasesTask = (goal, options = {}) => ({
  goal,
  implemented: true,
  task_type: 'qa',
  prompt: buildQaCasesPrompt(goal, options)
});

export const designQaBugTask = (finding) => ({
  finding,
  implemented: true,
  task_type: 'qa',
  prompt: buildQaBugPrompt(finding)
});
