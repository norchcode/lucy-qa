import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_VAULT_PATH = process.env.LUCY_QA_VAULT_PATH
  ? path.resolve(process.env.LUCY_QA_VAULT_PATH)
  : path.resolve(process.cwd(), 'vault');

const slugify = (value = '') => String(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'qa-project';

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
};

const unique = (items = []) => [...new Set((items ?? []).filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
const normalizeWhitespace = (value = '') => String(value).replace(/\s+/g, ' ').trim();
const truncateText = (value = '', limit = 140) => String(value).trim().slice(0, limit);

const knowledgeDir = (vaultPath = DEFAULT_VAULT_PATH) => ensureDir(path.join(path.resolve(vaultPath), 'qa-knowledge'));

const inferHostname = (targetUrl = null) => {
  if (!targetUrl) return null;
  try {
    return new URL(targetUrl).hostname;
  } catch {
    return null;
  }
};

export const inferQaProjectKey = ({ cwd = process.cwd(), targetUrl = null } = {}) => {
  const cwdName = path.basename(path.resolve(cwd || process.cwd()));
  const hostname = inferHostname(targetUrl);
  return slugify(hostname ? `${cwdName}-${hostname}` : cwdName);
};

const jsonPathForKey = ({ projectKey, vaultPath = DEFAULT_VAULT_PATH }) => path.join(knowledgeDir(vaultPath), `${projectKey}.json`);
const markdownPathForKey = ({ projectKey, vaultPath = DEFAULT_VAULT_PATH }) => path.join(knowledgeDir(vaultPath), `${projectKey}.md`);

const emptyKnowledge = ({ projectKey, cwd = process.cwd(), targetUrl = null } = {}) => ({
  project_key: projectKey,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  identifiers: {
    cwd: path.resolve(cwd || process.cwd()),
    hostnames: unique([inferHostname(targetUrl)])
  },
  stats: {
    runs_total: 0,
    passed_runs: 0,
    failed_runs: 0
  },
  learned_frameworks: [],
  deployment_hints: [],
  preferred_selector_strategies: [],
  known_risks: [],
  observed_routes: [],
  proven_interactions: [],
  docs_queries: [],
  failure_patterns: [],
  defect_signatures: [],
  notes: []
});

const renderKnowledgeMarkdown = (knowledge) => [
  `# QA Knowledge: ${knowledge.project_key}`,
  '',
  `- Updated: ${knowledge.updated_at}`,
  `- Runs total: ${knowledge.stats.runs_total}`,
  `- Passed runs: ${knowledge.stats.passed_runs}`,
  `- Failed runs: ${knowledge.stats.failed_runs}`,
  `- Hostnames: ${knowledge.identifiers.hostnames.join(', ') || 'none'}`,
  '',
  '## Learned frameworks',
  ...knowledge.learned_frameworks.map((item) => `- ${item}`),
  ...(knowledge.learned_frameworks.length ? [] : ['- none']),
  '',
  '## Deployment hints',
  ...knowledge.deployment_hints.map((item) => `- ${item}`),
  ...(knowledge.deployment_hints.length ? [] : ['- none']),
  '',
  '## Preferred selector strategies',
  ...knowledge.preferred_selector_strategies.map((item) => `- ${item}`),
  ...(knowledge.preferred_selector_strategies.length ? [] : ['- none']),
  '',
  '## Known risks',
  ...knowledge.known_risks.map((item) => `- ${item}`),
  ...(knowledge.known_risks.length ? [] : ['- none']),
  '',
  '## Observed routes',
  ...knowledge.observed_routes.map((item) => `- ${item}`),
  ...(knowledge.observed_routes.length ? [] : ['- none']),
  '',
  '## Proven interactions',
  ...knowledge.proven_interactions.map((item) => `- ${item}`),
  ...(knowledge.proven_interactions.length ? [] : ['- none']),
  '',
  '## Failure patterns',
  ...knowledge.failure_patterns.map((item) => `- ${item.title} (${item.failure_type ?? 'unknown'}, count=${item.count}, last_seen=${item.last_seen})`),
  ...(knowledge.failure_patterns.length ? [] : ['- none']),
  '',
  '## Defect signatures',
  ...knowledge.defect_signatures.map((item) => `- ${item.signature} (${item.failure_type ?? 'unknown'}, count=${item.count}, last_seen=${item.last_seen}) -> ${item.summary}`),
  ...(knowledge.defect_signatures.length ? [] : ['- none']),
  '',
  '## Notes',
  ...knowledge.notes.map((item) => `- ${item}`),
  ...(knowledge.notes.length ? [] : ['- none'])
].join('\n');

export const loadQaKnowledge = async ({ cwd = process.cwd(), targetUrl = null, vaultPath = DEFAULT_VAULT_PATH } = {}) => {
  const projectKey = inferQaProjectKey({ cwd, targetUrl });
  const jsonPath = jsonPathForKey({ projectKey, vaultPath });
  if (!fs.existsSync(jsonPath)) {
    return {
      implemented: true,
      project_key: projectKey,
      path: jsonPath,
      markdown_path: markdownPathForKey({ projectKey, vaultPath }),
      knowledge: emptyKnowledge({ projectKey, cwd, targetUrl })
    };
  }

  const knowledge = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  return {
    implemented: true,
    project_key: projectKey,
    path: jsonPath,
    markdown_path: markdownPathForKey({ projectKey, vaultPath }),
    knowledge
  };
};

const normalizeFailureText = (value = '') => normalizeWhitespace(String(value).toLowerCase())
  .replace(/https?:\/\/\S+/g, '<url>')
  .replace(/\b\d+ms\b/g, '<duration>')
  .replace(/\b\d+(?:\.\d+)?s\b/g, '<duration>')
  .replace(/#\d+/g, '#<n>')
  .replace(/\b\d+\b/g, '<n>');

const classifyFailureType = ({ title = '', errorMessage = '' } = {}) => {
  const text = normalizeFailureText(`${title} ${errorMessage}`);
  if (/timeout|timed out|waiting for|navigation.*failed|test timeout/i.test(text)) return 'timeout';
  if (/net::|network|fetch failed|econn|socket|dns|connection/i.test(text)) return 'network';
  if (/locator|selector|getby|strict mode|element.*not found|resolved to/i.test(text)) return 'locator';
  if (/assert|expect\(|expected|toequal|tomatch|received/i.test(text)) return 'assertion';
  if (/auth|login|password|otp|unauthorized|forbidden|permission/i.test(text)) return 'auth';
  if (/visual|screenshot|snapshot|pixel|image/i.test(text)) return 'visual';
  if (/server|500|502|503|504|graphql|api error/i.test(text)) return 'server';
  return 'unknown';
};

const inferFeatureArea = ({ title = '', suite = '', route = '', errorMessage = '' } = {}) => {
  const text = normalizeFailureText(`${title} ${suite} ${route} ${errorMessage}`);
  if (/login|sign in|signin|password|otp|auth/.test(text)) return 'login';
  if (/checkout|payment|billing|order/.test(text)) return 'checkout';
  if (/dashboard|home/.test(text)) return 'dashboard';
  if (/settings|profile|account/.test(text)) return 'settings';
  if (/cart|basket/.test(text)) return 'cart';
  if (/search|filter/.test(text)) return 'search';
  if (/table|grid/.test(text)) return 'table';
  if (/modal|dialog/.test(text)) return 'modal';
  return route ? slugify(route.split('?')[0].replace(/^https?:\/\/[^/]+/i, '').replace(/\//g, '-')) || 'app' : 'app';
};

const inferSymptomKey = ({ title = '', errorMessage = '' } = {}) => {
  const text = normalizeFailureText(`${title} ${errorMessage}`);
  if (/banner|alert|toast/.test(text)) return 'error-surface-missing';
  if (/timeout|timed out|waiting for/.test(text)) return 'operation-timeout';
  if (/redirect|navigation/.test(text)) return 'navigation-regression';
  if (/modal|dialog/.test(text)) return 'modal-not-rendering';
  if (/table|grid/.test(text)) return 'table-state-regression';
  if (/button.*disabled|not enabled/.test(text)) return 'action-never-enabled';
  if (/403|401|unauthorized|forbidden/.test(text)) return 'permission-failure';
  if (/500|502|503|504|server/.test(text)) return 'server-error';
  if (/locator|selector|not found/.test(text)) return 'locator-target-missing';
  return slugify(text.split(' ').slice(0, 8).join(' ')) || 'general-failure';
};

const buildFailurePatternKey = ({ title = '', error_message: errorMessage = '' } = {}) => {
  return slugify(`${normalizeFailureText(title).slice(0, 80)}-${normalizeFailureText(errorMessage).slice(0, 120)}`);
};

export const buildDefectSignature = ({
  title = '',
  suite = '',
  project = '',
  status = '',
  error_message: errorMessage = '',
  route = '',
  description = ''
} = {}) => {
  const failure_type = classifyFailureType({ title, errorMessage });
  const feature_area = inferFeatureArea({ title, suite, route, errorMessage });
  const symptom_key = inferSymptomKey({ title: `${title} ${description}`.trim(), errorMessage });
  const route_key = route ? slugify(route.split('?')[0].replace(/^https?:\/\/[^/]+/i, '').replace(/\//g, '-')) || 'route' : null;
  const signature = [feature_area, failure_type, symptom_key, route_key].filter(Boolean).join('|');
  const summary = truncateText(
    `${feature_area} ${symptom_key.replace(/-/g, ' ')}${route ? ` on ${route}` : ''}${errorMessage ? ` — ${errorMessage}` : ''}`,
    180
  );
  return {
    signature,
    feature_area,
    failure_type,
    symptom_key,
    route: route || null,
    project: project || null,
    status: status || null,
    summary
  };
};

const normalizeExistingPattern = (item = {}) => ({
  key: item.key ?? slugify(item.title ?? 'failure-pattern'),
  title: item.title ?? 'Unnamed failure pattern',
  error_sample: item.error_sample ?? item.error_message ?? null,
  failure_type: item.failure_type ?? classifyFailureType({ title: item.title, errorMessage: item.error_sample ?? item.error_message ?? '' }),
  count: Number(item.count ?? 0),
  first_seen: item.first_seen ?? item.last_seen ?? new Date().toISOString(),
  last_seen: item.last_seen ?? new Date().toISOString(),
  statuses: unique(item.statuses ?? []),
  projects: unique(item.projects ?? []),
  suites: unique(item.suites ?? [])
});

const normalizeExistingDefectSignature = (item = {}) => ({
  signature: item.signature ?? 'app|unknown|general-failure',
  summary: item.summary ?? item.signature ?? 'Unnamed defect signature',
  feature_area: item.feature_area ?? 'app',
  failure_type: item.failure_type ?? 'unknown',
  symptom_key: item.symptom_key ?? 'general-failure',
  route: item.route ?? null,
  count: Number(item.count ?? 0),
  first_seen: item.first_seen ?? item.last_seen ?? new Date().toISOString(),
  last_seen: item.last_seen ?? new Date().toISOString(),
  related_cases: unique(item.related_cases ?? []),
  related_projects: unique(item.related_projects ?? []),
  related_routes: unique(item.related_routes ?? []),
  linked_bug_id: item.linked_bug_id ?? null,
  tracker_system: item.tracker_system ?? null,
  tracker_url: item.tracker_url ?? null,
  tracker_title: item.tracker_title ?? null,
  tracker_status: item.tracker_status ?? null,
  last_linked_at: item.last_linked_at ?? null,
  status: item.status ?? 'unknown'
});

const saveKnowledgeDocument = ({ projectKey, vaultPath = DEFAULT_VAULT_PATH, knowledge }) => {
  const jsonPath = jsonPathForKey({ projectKey, vaultPath });
  const markdownPath = markdownPathForKey({ projectKey, vaultPath });
  fs.writeFileSync(jsonPath, JSON.stringify(knowledge, null, 2));
  fs.writeFileSync(markdownPath, renderKnowledgeMarkdown(knowledge));
  return { jsonPath, markdownPath };
};

const mergeFailurePatterns = (existing = [], nextCases = []) => {
  const map = new Map((existing ?? []).map((item) => {
    const normalized = normalizeExistingPattern(item);
    return [normalized.key, normalized];
  }));
  const now = new Date().toISOString();

  for (const failure of nextCases) {
    const status = String(failure?.status ?? '').trim();
    if (!['failed', 'timedOut', 'interrupted', 'flaky'].includes(status)) continue;
    const title = normalizeWhitespace(failure?.title ?? '');
    if (!title) continue;
    const errorMessage = normalizeWhitespace(failure?.error_message ?? '');
    const key = buildFailurePatternKey({ title, error_message: errorMessage });
    const current = map.get(key) ?? {
      key,
      title,
      error_sample: errorMessage || null,
      failure_type: classifyFailureType({ title, errorMessage }),
      count: 0,
      first_seen: now,
      last_seen: now,
      statuses: [],
      projects: [],
      suites: []
    };
    current.count += 1;
    current.last_seen = now;
    current.error_sample = current.error_sample ?? errorMessage ?? null;
    current.failure_type = current.failure_type === 'unknown'
      ? classifyFailureType({ title, errorMessage: current.error_sample ?? errorMessage })
      : current.failure_type;
    current.statuses = unique([...(current.statuses ?? []), status]);
    current.projects = unique([...(current.projects ?? []), failure?.project]);
    current.suites = unique([...(current.suites ?? []), failure?.suite]);
    map.set(key, current);
  }

  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.last_seen.localeCompare(a.last_seen) || a.title.localeCompare(b.title))
    .slice(0, 30);
};

export const clusterQaDefects = ({ summaryCases = [], annotations = [], knowledge = null, baseUrl = null } = {}) => {
  const annotationsByCase = new Map((annotations ?? []).map((item) => [item.case_title, item]));
  const currentFailures = (summaryCases ?? []).filter((item) => ['failed', 'timedOut', 'interrupted', 'flaky'].includes(item?.status));
  const existingSignatures = (knowledge?.defect_signatures ?? []).map((item) => normalizeExistingDefectSignature(item));
  const signatureHistory = new Map(existingSignatures.map((item) => [item.signature, item]));
  const clusters = new Map();

  for (const item of currentFailures) {
    const annotation = annotationsByCase.get(item.title) ?? null;
    const route = annotation?.route ?? baseUrl ?? null;
    const signatureData = buildDefectSignature({
      title: item.title,
      suite: item.suite,
      project: item.project,
      status: item.status,
      error_message: item.error_message,
      route,
      description: annotation?.description ?? ''
    });
    const history = signatureHistory.get(signatureData.signature) ?? null;
    const cluster = clusters.get(signatureData.signature) ?? {
      signature: signatureData.signature,
      summary: history?.summary ?? signatureData.summary,
      feature_area: signatureData.feature_area,
      failure_type: signatureData.failure_type,
      symptom_key: signatureData.symptom_key,
      route: route,
      cases: [],
      related_case_titles: [],
      projects: [],
      statuses: [],
      error_samples: [],
      recurring: Boolean(history),
      existing_occurrence_count: history?.count ?? 0,
      linked_bug_id: history?.linked_bug_id ?? null,
      tracker_system: history?.tracker_system ?? null,
      tracker_url: history?.tracker_url ?? null,
      tracker_title: history?.tracker_title ?? null,
      tracker_status: history?.tracker_status ?? null,
      last_linked_at: history?.last_linked_at ?? null,
      prior_status: history?.status ?? 'unknown'
    };
    cluster.cases.push({ ...item, defect_signature: signatureData.signature });
    cluster.related_case_titles = unique([...cluster.related_case_titles, item.title]);
    cluster.projects = unique([...cluster.projects, item.project]);
    cluster.statuses = unique([...cluster.statuses, item.status]);
    cluster.error_samples = unique([...cluster.error_samples, item.error_message]).slice(0, 5);
    clusters.set(signatureData.signature, cluster);
  }

  const defect_candidates = [...clusters.values()].map((cluster) => {
    const likely_flaky = cluster.statuses.includes('flaky')
      || (cluster.existing_occurrence_count >= 2 && ['timeout', 'network'].includes(cluster.failure_type))
      || (cluster.existing_occurrence_count >= 3 && cluster.failure_type === 'locator');
    return {
      ...cluster,
      case_count: cluster.cases.length,
      disposition: cluster.linked_bug_id
        ? 'append-to-existing-bug'
        : cluster.recurring
          ? 'probable-duplicate'
          : 'new-defect-candidate',
      likely_flaky,
      likely_regression: !likely_flaky,
      bug_recommendation: cluster.linked_bug_id
        ? `Append new evidence to existing bug ${cluster.linked_bug_id}.`
        : cluster.recurring
          ? 'Review as a likely duplicate or same-root-cause defect before opening a new bug.'
          : 'Create a new grouped defect bug draft.'
    };
  }).sort((a, b) => b.case_count - a.case_count || b.existing_occurrence_count - a.existing_occurrence_count || a.signature.localeCompare(b.signature));

  const summary = [];
  summary.push(`${currentFailures.length} failing case(s) clustered into ${defect_candidates.length} defect candidate(s).`);
  if (defect_candidates.some((item) => item.recurring)) {
    summary.push(`${defect_candidates.filter((item) => item.recurring).length} defect candidate(s) match previously seen signatures.`);
  }
  if (defect_candidates.some((item) => item.likely_flaky)) {
    summary.push(`${defect_candidates.filter((item) => item.likely_flaky).length} defect candidate(s) look likely flaky or environment-sensitive.`);
  }
  if (defect_candidates.some((item) => item.disposition === 'append-to-existing-bug')) {
    summary.push(`${defect_candidates.filter((item) => item.disposition === 'append-to-existing-bug').length} defect candidate(s) already link to existing bug IDs.`);
  }

  return {
    implemented: true,
    defect_candidates,
    summary
  };
};

const mergeDefectSignatures = (existing = [], nextClusters = []) => {
  const map = new Map((existing ?? []).map((item) => {
    const normalized = normalizeExistingDefectSignature(item);
    return [normalized.signature, normalized];
  }));
  const now = new Date().toISOString();

  for (const cluster of nextClusters) {
    const current = map.get(cluster.signature) ?? {
      signature: cluster.signature,
      summary: cluster.summary,
      feature_area: cluster.feature_area,
      failure_type: cluster.failure_type,
      symptom_key: cluster.symptom_key,
      route: cluster.route ?? null,
      count: 0,
      first_seen: now,
      last_seen: now,
      related_cases: [],
      related_projects: [],
      related_routes: [],
      linked_bug_id: cluster.linked_bug_id ?? null,
      status: cluster.prior_status ?? 'unknown'
    };
    current.summary = current.summary || cluster.summary;
    current.feature_area = current.feature_area || cluster.feature_area;
    current.failure_type = current.failure_type === 'unknown' ? cluster.failure_type : current.failure_type;
    current.symptom_key = current.symptom_key || cluster.symptom_key;
    current.route = current.route || cluster.route || null;
    current.count += cluster.case_count ?? cluster.cases?.length ?? 1;
    current.last_seen = now;
    current.related_cases = unique([...(current.related_cases ?? []), ...(cluster.related_case_titles ?? [])]).slice(0, 25);
    current.related_projects = unique([...(current.related_projects ?? []), ...(cluster.projects ?? [])]);
    current.related_routes = unique([...(current.related_routes ?? []), cluster.route]);
    current.linked_bug_id = current.linked_bug_id ?? cluster.linked_bug_id ?? null;
    current.tracker_system = current.tracker_system ?? cluster.tracker_system ?? null;
    current.tracker_url = current.tracker_url ?? cluster.tracker_url ?? null;
    current.tracker_title = current.tracker_title ?? cluster.tracker_title ?? current.summary;
    current.tracker_status = current.tracker_status ?? cluster.tracker_status ?? null;
    current.last_linked_at = current.last_linked_at ?? cluster.last_linked_at ?? null;
    current.status = current.status === 'unknown' ? (cluster.likely_flaky ? 'likely-flaky' : 'open') : current.status;
    map.set(cluster.signature, current);
  }

  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.last_seen.localeCompare(a.last_seen) || a.signature.localeCompare(b.signature))
    .slice(0, 40);
};

export const analyzeQaFailurePatterns = ({ summaryCases = [], knowledge = null, annotations = [], baseUrl = null } = {}) => {
  const normalizedPatterns = (knowledge?.failure_patterns ?? []).map((item) => normalizeExistingPattern(item));
  const patterns = new Map(normalizedPatterns.map((item) => [item.key, item]));
  const currentFailures = (summaryCases ?? []).filter((item) => ['failed', 'timedOut', 'interrupted', 'flaky'].includes(item?.status));
  const defect_clusters = clusterQaDefects({ summaryCases, annotations, knowledge, baseUrl });

  const recurring_failures = [];
  const likely_flaky = [];
  const likely_regressions = [];

  for (const item of currentFailures) {
    const key = buildFailurePatternKey(item);
    const fallbackTitle = normalizeFailureText(item.title ?? '');
    const fallbackError = normalizeFailureText(item.error_message ?? '');
    const pattern = patterns.get(key)
      ?? normalizedPatterns.find((entry) => normalizeFailureText(entry.title) === fallbackTitle && normalizeFailureText(entry.error_sample ?? '') === fallbackError)
      ?? normalizedPatterns.find((entry) => normalizeFailureText(entry.title) === fallbackTitle);
    const failure_type = classifyFailureType({ title: item.title, errorMessage: item.error_message });
    const occurrence_count = pattern?.count ?? 0;
    const defect_cluster = defect_clusters.defect_candidates.find((entry) => entry.related_case_titles.includes(item.title));
    const enriched = {
      key,
      title: item.title,
      project: item.project,
      status: item.status,
      error_message: item.error_message ?? null,
      failure_type,
      occurrence_count,
      seen_before: occurrence_count > 0,
      pattern_statuses: pattern?.statuses ?? [],
      last_seen: pattern?.last_seen ?? null,
      defect_signature: defect_cluster?.signature ?? null,
      defect_disposition: defect_cluster?.disposition ?? null
    };

    if (enriched.seen_before) {
      recurring_failures.push(enriched);
    }

    const flakyHeuristic = item.status === 'flaky'
      || (occurrence_count >= 2 && ['timeout', 'network'].includes(failure_type))
      || (occurrence_count >= 3 && failure_type === 'locator');

    if (flakyHeuristic) {
      likely_flaky.push(enriched);
    } else {
      likely_regressions.push(enriched);
    }
  }

  const summary = [];
  if (currentFailures.length) {
    summary.push(`${currentFailures.length} current failure(s) analyzed against stored project history.`);
  } else {
    summary.push('No current failures to analyze against stored project history.');
  }
  if (recurring_failures.length) {
    summary.push(`${recurring_failures.length} failure(s) match previously seen patterns.`);
  }
  if (likely_flaky.length) {
    summary.push(`${likely_flaky.length} failure(s) look likely flaky or environment-sensitive based on recurrence and failure type.`);
  }
  if (likely_regressions.length) {
    summary.push(`${likely_regressions.length} failure(s) look more like real regressions than transient execution noise.`);
  }
  summary.push(...defect_clusters.summary);

  return {
    implemented: true,
    recurring_failures,
    likely_flaky,
    likely_regressions,
    defect_clusters,
    summary
  };
};

export const saveQaKnowledgeFromRun = async ({
  result,
  intake = null,
  docsContext = [],
  cwd = process.cwd(),
  targetUrl = null,
  vaultPath = DEFAULT_VAULT_PATH
} = {}) => {
  const loaded = await loadQaKnowledge({ cwd, targetUrl, vaultPath });
  const previous = loaded.knowledge;
  const defectClusters = clusterQaDefects({
    summaryCases: result?.summary?.cases ?? [],
    annotations: result?.annotated_screenshots ?? [],
    knowledge: previous,
    baseUrl: targetUrl ?? intake?.target_url ?? null
  });
  const next = {
    ...previous,
    updated_at: new Date().toISOString(),
    identifiers: {
      cwd: path.resolve(cwd || process.cwd()),
      hostnames: unique([...(previous.identifiers?.hostnames ?? []), inferHostname(targetUrl), inferHostname(intake?.target_url)])
    },
    stats: {
      runs_total: (previous.stats?.runs_total ?? 0) + 1,
      passed_runs: (previous.stats?.passed_runs ?? 0) + (result?.status === 'passed' ? 1 : 0),
      failed_runs: (previous.stats?.failed_runs ?? 0) + (result?.status === 'failed' ? 1 : 0)
    },
    learned_frameworks: unique([
      ...(previous.learned_frameworks ?? []),
      ...(intake?.stack?.frontend ?? []),
      ...(intake?.stack?.backend ?? []),
      ...(intake?.stack?.test_frameworks ?? []),
      ...(intake?.runtime?.framework_hints ?? []),
      ...(intake?.browser?.framework_hints ?? [])
    ]),
    deployment_hints: unique([
      ...(previous.deployment_hints ?? []),
      ...(intake?.stack?.deployment ?? []),
      ...(intake?.runtime?.deployment_hints ?? [])
    ]),
    preferred_selector_strategies: unique([
      ...(previous.preferred_selector_strategies ?? []),
      intake?.dom?.selector_strategy
    ]),
    known_risks: unique([
      ...(previous.known_risks ?? []),
      ...(intake?.dom?.risks ?? []),
      ...(intake?.runtime?.risks ?? []),
      ...(intake?.browser?.risks ?? []),
      ...(intake?.probe?.risks ?? [])
    ]),
    observed_routes: unique([
      ...(previous.observed_routes ?? []),
      ...(intake?.probe?.observed_routes ?? []),
      ...(intake?.crawl?.discovered_routes ?? []),
      intake?.target_url,
      targetUrl
    ]).slice(0, 50),
    proven_interactions: unique([
      ...(previous.proven_interactions ?? []),
      ...(intake?.dom?.interactions ?? []),
      ...(intake?.probe?.interactions ?? [])
    ]),
    docs_queries: unique([
      ...(previous.docs_queries ?? []),
      ...(intake?.docs_queries ?? []),
      ...docsContext.map((item) => item.query)
    ]).slice(0, 30),
    failure_patterns: mergeFailurePatterns(previous.failure_patterns, result?.summary?.cases ?? []),
    defect_signatures: mergeDefectSignatures(previous.defect_signatures, defectClusters.defect_candidates),
    notes: unique([
      ...(previous.notes ?? []),
      result?.execution_profile?.rationale,
      intake?.knowledge?.summary,
      ...defectClusters.summary
    ]).slice(0, 40)
  };

  const { jsonPath, markdownPath } = saveKnowledgeDocument({
    projectKey: loaded.project_key,
    vaultPath,
    knowledge: next
  });

  return {
    implemented: true,
    project_key: loaded.project_key,
    path: jsonPath,
    markdown_path: markdownPath,
    knowledge: next
  };
};

export const listQaDefectSignatures = async ({ cwd = process.cwd(), targetUrl = null, vaultPath = DEFAULT_VAULT_PATH } = {}) => {
  const loaded = await loadQaKnowledge({ cwd, targetUrl, vaultPath });
  const signatures = (loaded.knowledge.defect_signatures ?? []).map((item) => normalizeExistingDefectSignature(item));
  return {
    implemented: true,
    project_key: loaded.project_key,
    path: loaded.path,
    markdown_path: loaded.markdown_path,
    total: signatures.length,
    defect_signatures: signatures
  };
};

export const linkQaDefectSignature = async ({
  signature,
  bugId,
  trackerSystem = 'generic',
  trackerUrl = null,
  trackerTitle = null,
  trackerStatus = 'open',
  defectStatus = 'open',
  cwd = process.cwd(),
  targetUrl = null,
  vaultPath = DEFAULT_VAULT_PATH
} = {}) => {
  if (!signature) {
    throw new Error('signature is required');
  }
  if (!bugId) {
    throw new Error('bugId is required');
  }

  const loaded = await loadQaKnowledge({ cwd, targetUrl, vaultPath });
  const now = new Date().toISOString();
  const signatures = (loaded.knowledge.defect_signatures ?? []).map((item) => normalizeExistingDefectSignature(item));
  const match = signatures.find((item) => item.signature === signature);
  if (!match) {
    throw new Error(`Defect signature not found: ${signature}`);
  }

  const next = {
    ...loaded.knowledge,
    updated_at: now,
    defect_signatures: signatures.map((item) => item.signature === signature
      ? {
          ...item,
          linked_bug_id: bugId,
          tracker_system: trackerSystem,
          tracker_url: trackerUrl,
          tracker_title: trackerTitle ?? item.tracker_title ?? item.summary,
          tracker_status: trackerStatus,
          last_linked_at: now,
          status: defectStatus
        }
      : item)
  };

  const { jsonPath, markdownPath } = saveKnowledgeDocument({
    projectKey: loaded.project_key,
    vaultPath,
    knowledge: next
  });

  return {
    implemented: true,
    action: 'link',
    project_key: loaded.project_key,
    path: jsonPath,
    markdown_path: markdownPath,
    defect_signature: next.defect_signatures.find((item) => item.signature === signature)
  };
};

export const updateQaDefectSignature = async ({
  signature,
  bugId = null,
  trackerSystem = undefined,
  trackerUrl = undefined,
  trackerTitle = undefined,
  trackerStatus = undefined,
  defectStatus = undefined,
  cwd = process.cwd(),
  targetUrl = null,
  vaultPath = DEFAULT_VAULT_PATH
} = {}) => {
  if (!signature) {
    throw new Error('signature is required');
  }

  const loaded = await loadQaKnowledge({ cwd, targetUrl, vaultPath });
  const now = new Date().toISOString();
  const signatures = (loaded.knowledge.defect_signatures ?? []).map((item) => normalizeExistingDefectSignature(item));
  const match = signatures.find((item) => item.signature === signature);
  if (!match) {
    throw new Error(`Defect signature not found: ${signature}`);
  }

  const next = {
    ...loaded.knowledge,
    updated_at: now,
    defect_signatures: signatures.map((item) => item.signature === signature
      ? {
          ...item,
          linked_bug_id: bugId === null ? item.linked_bug_id : bugId,
          tracker_system: trackerSystem === undefined ? item.tracker_system : trackerSystem,
          tracker_url: trackerUrl === undefined ? item.tracker_url : trackerUrl,
          tracker_title: trackerTitle === undefined ? item.tracker_title : trackerTitle,
          tracker_status: trackerStatus === undefined ? item.tracker_status : trackerStatus,
          last_linked_at: bugId !== null || trackerStatus !== undefined || trackerUrl !== undefined || trackerTitle !== undefined ? now : item.last_linked_at,
          status: defectStatus === undefined ? item.status : defectStatus
        }
      : item)
  };

  const { jsonPath, markdownPath } = saveKnowledgeDocument({
    projectKey: loaded.project_key,
    vaultPath,
    knowledge: next
  });

  return {
    implemented: true,
    action: 'update',
    project_key: loaded.project_key,
    path: jsonPath,
    markdown_path: markdownPath,
    defect_signature: next.defect_signatures.find((item) => item.signature === signature)
  };
};
