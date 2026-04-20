import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { analyzeQaFailurePatterns, clusterQaDefects } from '../../../packages/qa-knowledge/src/index.mjs';
import { buildRtkSpawnArgs, isRtkAvailable } from '../../../packages/rtk-filter/src/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const QA_BASELINE_PATH = path.resolve(__dirname, '../../../prompts/modes/qa-mode-baseline.md');

const loadText = (filePath) => fs.readFileSync(filePath, 'utf8').trim();
const normalizeWhitespace = (value = '') => String(value).replace(/\s+/g, ' ').trim();
const formatList = (items = [], emptyText = 'none detected yet') => items.length ? items.join(', ') : emptyText;
const formatBulletLines = (items = [], emptyText = 'none') => items.length ? items.map((item) => `- ${item}`) : [`- ${emptyText}`];

const hasFfmpeg = () => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const sanitizeSegment = (value) => String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'run';

const collectFilesRecursive = (dirPath, extensions = []) => {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const results = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFilesRecursive(fullPath, extensions));
      continue;
    }
    if (!extensions.length || extensions.some((ext) => fullPath.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results.sort();
};

const safeJsonParse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const fileExists = (filePath) => Boolean(filePath) && fs.existsSync(filePath);
const resolveIfRelative = (baseDir, filePath) => {
  if (!filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
};
const imageMimeFromPath = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
};
const escapeXml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const getImageDimensions = (buffer) => {
  if (buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20)
    };
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length - 9) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const size = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && offset + 8 < buffer.length) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7)
        };
      }
      offset += Math.max(size + 2, 2);
    }
  }

  return { width: 1280, height: 720 };
};

const readDefectHints = (runDir) => {
  const hintsPath = path.join(runDir, 'qa-defect-hints.json');
  return fileExists(hintsPath) ? safeJsonParse(fs.readFileSync(hintsPath, 'utf8')) ?? {} : {};
};

const maybeReadVisionSuggestionFixture = () => {
  const fixturePath = process.env.LUCY_QA_VISION_SUGGESTION_FIXTURE;
  if (!fixturePath || !fileExists(fixturePath)) {
    return null;
  }
  return safeJsonParse(fs.readFileSync(fixturePath, 'utf8'));
};

const suggestBoxesFromVisionCommand = ({ imagePath, description, caseTitle }) => {
  const command = process.env.LUCY_QA_VISION_SUGGESTION_COMMAND;
  if (!command) {
    return null;
  }
  const args = process.env.LUCY_QA_VISION_SUGGESTION_ARGS_JSON
    ? safeJsonParse(process.env.LUCY_QA_VISION_SUGGESTION_ARGS_JSON) ?? []
    : [];
  const execution = execFileSync(command, [...args, imagePath, description || '', caseTitle || ''], { encoding: 'utf8' });
  return safeJsonParse(execution);
};

const suggestBoxesFromVision = ({ imagePath, description, caseTitle, width, height }) => {
  const fixture = maybeReadVisionSuggestionFixture();
  const fixtureSuggestion = fixture?.[path.basename(imagePath)] ?? fixture?.default ?? null;
  if (fixtureSuggestion?.boxes?.length) {
    return {
      source: 'vision-fixture',
      description: fixtureSuggestion.description ?? description,
      boxes: fixtureSuggestion.boxes
    };
  }

  try {
    const commandSuggestion = suggestBoxesFromVisionCommand({ imagePath, description, caseTitle });
    if (commandSuggestion?.boxes?.length) {
      return {
        source: 'vision-command',
        description: commandSuggestion.description ?? description,
        boxes: commandSuggestion.boxes
      };
    }
  } catch {
    // Ignore command failures and fall back to heuristics.
  }

  const normalized = String(description || caseTitle || '').toLowerCase();
  if (/banner|alert|toast|error/.test(normalized)) {
    return {
      source: 'vision-heuristic',
      description,
      boxes: [{
        x: Math.max(12, Math.round(width * 0.08)),
        y: Math.max(12, Math.round(height * 0.1)),
        width: Math.max(48, Math.round(width * 0.84)),
        height: Math.max(28, Math.round(height * 0.18)),
        label: 'Suggested error/alert region'
      }]
    };
  }
  if (/modal|dialog/.test(normalized)) {
    return {
      source: 'vision-heuristic',
      description,
      boxes: [{
        x: Math.max(12, Math.round(width * 0.18)),
        y: Math.max(12, Math.round(height * 0.18)),
        width: Math.max(64, Math.round(width * 0.64)),
        height: Math.max(64, Math.round(height * 0.56)),
        label: 'Suggested modal/dialog region'
      }]
    };
  }
  if (/table|grid|row|list/.test(normalized)) {
    return {
      source: 'vision-heuristic',
      description,
      boxes: [{
        x: Math.max(12, Math.round(width * 0.06)),
        y: Math.max(12, Math.round(height * 0.22)),
        width: Math.max(64, Math.round(width * 0.88)),
        height: Math.max(64, Math.round(height * 0.58)),
        label: 'Suggested table/list region'
      }]
    };
  }
  return null;
};

const normalizeCaseKey = ({ title = '', project = '' } = {}) => `${String(title).trim()}::${String(project).trim()}`;

const buildDefaultBox = ({ width, height, description }) => ({
  x: Math.max(16, Math.round(width * 0.04)),
  y: Math.max(16, Math.round(height * 0.08)),
  width: Math.max(80, Math.round(width * 0.92) - Math.max(16, Math.round(width * 0.04))),
  height: Math.max(80, Math.round(height * 0.84) - Math.max(16, Math.round(height * 0.08))),
  label: description || 'Observed defect region'
});

const sanitizeAnnotationName = (value) => String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'annotation';

const createAnnotatedScreenshot = ({ imagePath, runDir, caseTitle, description, boxes = [], precise_boxes = false }) => {
  if (!fileExists(imagePath)) {
    return null;
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const { width, height } = getImageDimensions(imageBuffer);
  const annotationDir = path.join(runDir, 'annotated-screenshots');
  fs.mkdirSync(annotationDir, { recursive: true });
  const visionSuggestion = !boxes.length ? suggestBoxesFromVision({ imagePath, description, caseTitle, width, height }) : null;
  const fallbackBoxes = boxes.length
    ? boxes
    : visionSuggestion?.boxes?.length
      ? visionSuggestion.boxes
      : [buildDefaultBox({ width, height, description })];
  const safeBoxes = fallbackBoxes.map((box, index) => ({
    x: Math.max(0, Number(box.x ?? 0)),
    y: Math.max(0, Number(box.y ?? 0)),
    width: Math.max(24, Number(box.width ?? width * 0.5)),
    height: Math.max(24, Number(box.height ?? height * 0.2)),
    label: String(box.label ?? description ?? `Defect ${index + 1}`).slice(0, 120)
  }));
  const labelBandHeight = Math.max(72, 40 + safeBoxes.length * 28);
  const svgPath = path.join(
    annotationDir,
    `${sanitizeAnnotationName(caseTitle || path.basename(imagePath, path.extname(imagePath)))}-${sanitizeAnnotationName(path.basename(imagePath))}.annotated.svg`
  );
  const textLines = [
    String(visionSuggestion?.description ?? description ?? caseTitle ?? 'Observed defect').slice(0, 140),
    precise_boxes
      ? 'Bounding boxes from defect hints.'
      : visionSuggestion?.source === 'vision-fixture' || visionSuggestion?.source === 'vision-command'
        ? `Bounding boxes suggested by ${visionSuggestion.source}.`
        : visionSuggestion?.source === 'vision-heuristic'
          ? 'Bounding boxes suggested by vision heuristics.'
          : 'Bounding box is a review aid; precise defect bounds were not confirmed automatically.'
  ];
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + labelBandHeight}" viewBox="0 0 ${width} ${height + labelBandHeight}">`,
    `<rect x="0" y="0" width="${width}" height="${height + labelBandHeight}" fill="#0f172a"/>`,
    `<image href="data:${imageMimeFromPath(imagePath)};base64,${imageBuffer.toString('base64')}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`,
    ...safeBoxes.flatMap((box, index) => {
      const tagY = Math.max(0, box.y - 28);
      return [
        `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="none" stroke="#ef4444" stroke-width="4" rx="6" ry="6"/>`,
        `<rect x="${box.x}" y="${tagY}" width="${Math.min(width - box.x, Math.max(220, box.label.length * 8))}" height="24" fill="#ef4444" rx="4" ry="4"/>`,
        `<text x="${box.x + 8}" y="${tagY + 16}" fill="#ffffff" font-size="14" font-family="Arial, Helvetica, sans-serif">${escapeXml(`${index + 1}. ${box.label}`)}</text>`
      ];
    }),
    `<rect x="0" y="${height}" width="${width}" height="${labelBandHeight}" fill="#111827"/>`,
    ...textLines.map((line, index) => `<text x="20" y="${height + 28 + index * 22}" fill="#f8fafc" font-size="16" font-family="Arial, Helvetica, sans-serif">${escapeXml(line)}</text>`),
    '</svg>'
  ].join('');
  fs.writeFileSync(svgPath, svg);
  return {
    source_path: imagePath,
    annotated_path: svgPath,
    width,
    height,
    box_count: safeBoxes.length,
    precise_boxes,
    description: visionSuggestion?.description ?? description,
    suggestion_source: precise_boxes ? 'defect-hints' : visionSuggestion?.source ?? 'fallback-box'
  };
};

const buildAnnotatedScreenshots = ({ runDir, summaryCases = [], artifacts = { screenshots: [] } }) => {
  const hints = readDefectHints(runDir);
  const screenshotHints = new Map((hints.screenshots ?? []).map((item) => [resolveIfRelative(runDir, item.path), item]));
  const caseHints = new Map((hints.cases ?? []).map((item) => [normalizeCaseKey(item), item]));
  const screenshotsByCase = new Map();

  for (const item of summaryCases) {
    const caseKey = normalizeCaseKey(item);
    const attachmentScreenshots = (item.attachments ?? [])
      .filter((attachment) => attachment.path && ((attachment.contentType ?? '').startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(attachment.path)))
      .map((attachment) => resolveIfRelative(runDir, attachment.path))
      .filter(fileExists);
    const fallbackScreenshots = (artifacts.screenshots ?? []).filter((filePath) => filePath.includes(item.title));
    screenshotsByCase.set(caseKey, [...new Set([...attachmentScreenshots, ...fallbackScreenshots])]);
  }

  const annotations = [];
  for (const item of summaryCases.filter((entry) => ['failed', 'timedOut', 'interrupted', 'flaky'].includes(entry.status))) {
    const caseKey = normalizeCaseKey(item);
    const caseHint = caseHints.get(caseKey) ?? caseHints.get(normalizeCaseKey({ title: item.title, project: '' })) ?? null;
    const screenshots = screenshotsByCase.get(caseKey) ?? [];
    for (const screenshotPath of screenshots) {
      const screenshotHint = screenshotHints.get(screenshotPath) ?? null;
      const description = (screenshotHint?.description ?? caseHint?.description ?? `${item.title}${item.error_message ? ` — ${normalizeWhitespace(item.error_message).slice(0, 120)}` : ''}`).trim();
      const boxes = screenshotHint?.boxes ?? caseHint?.boxes ?? [];
      const annotated = createAnnotatedScreenshot({
        imagePath: screenshotPath,
        runDir,
        caseTitle: item.title,
        description,
        boxes,
        precise_boxes: Array.isArray(boxes) && boxes.length > 0
      });
      if (annotated) {
        annotations.push({
          case_title: item.title,
          project: item.project,
          status: item.status,
          ...annotated
        });
      }
    }
  }

  return annotations;
};

const flattenSpecs = (suites = [], parentTitles = []) => {
  const specs = [];
  for (const suite of suites ?? []) {
    const suiteTitles = [...parentTitles, suite.title].filter(Boolean);
    for (const spec of suite.specs ?? []) {
      specs.push({ suiteTitles, spec });
    }
    specs.push(...flattenSpecs(suite.suites ?? [], suiteTitles));
  }
  return specs;
};

const summarizeJsonReport = (report) => {
  const specs = flattenSpecs(report?.suites ?? []);
  const cases = [];

  for (const entry of specs) {
    const suiteTitle = entry.suiteTitles.join(' > ');
    const testGroups = entry.spec.tests ?? [];
    for (const testGroup of testGroups) {
      for (const result of testGroup.results ?? []) {
        cases.push({
          suite: suiteTitle,
          title: entry.spec.title,
          project: testGroup.projectName ?? 'default',
          status: result.status ?? 'unknown',
          duration_ms: result.duration ?? null,
          error_message: result.error?.message ?? null,
          attachments: (result.attachments ?? []).map((attachment) => ({
            name: attachment.name,
            path: attachment.path ?? null,
            contentType: attachment.contentType ?? null
          }))
        });
      }
    }
  }

  const passed = cases.filter((item) => item.status === 'passed').length;
  const failed = cases.filter((item) => item.status === 'failed' || item.status === 'timedOut' || item.status === 'interrupted').length;
  const skipped = cases.filter((item) => item.status === 'skipped').length;
  const flaky = cases.filter((item) => item.status === 'flaky').length;
  const total = cases.length || report?.stats?.expected || 0;

  return {
    total,
    passed,
    failed,
    skipped,
    flaky,
    duration_ms: report?.stats?.duration ?? null,
    cases
  };
};

export const createPlaywrightRecordingPlan = ({ artifactsRoot = 'artifacts/playwright' } = {}) => {
  const recordingsDir = path.join(artifactsRoot, 'videos');
  const tracesDir = path.join(artifactsRoot, 'traces');
  const screenshotsDir = path.join(artifactsRoot, 'screenshots');
  const ffmpegAvailable = hasFfmpeg();

  return {
    implemented: true,
    artifacts_root: artifactsRoot,
    ffmpeg_available: ffmpegAvailable,
    playwright: {
      outputDir: artifactsRoot,
      use: {
        video: 'on',
        trace: 'on',
        screenshot: 'only-on-failure'
      }
    },
    directories: {
      videos: recordingsDir,
      traces: tracesDir,
      screenshots: screenshotsDir
    },
    configSnippet: [
      'import { defineConfig } from "@playwright/test";',
      '',
      'export default defineConfig({',
      `  outputDir: ${JSON.stringify(artifactsRoot)},`,
      '  use: {',
      "    video: 'on',",
      "    trace: 'on',",
      "    screenshot: 'only-on-failure'",
      '  }',
      '});'
    ].join('\n'),
    ffmpeg: ffmpegAvailable
      ? {
          purpose: 'Optional post-processing for Playwright videos after the run',
          examples: [
            `ffmpeg -y -i ${JSON.stringify(path.join(recordingsDir, 'test-video.webm'))} ${JSON.stringify(path.join(recordingsDir, 'test-video.mp4'))}`,
            `ffmpeg -y -pattern_type glob -i ${JSON.stringify(path.join(recordingsDir, '*.webm'))} -c copy ${JSON.stringify(path.join(recordingsDir, 'combined-output.mkv'))}`
          ]
        }
      : {
          purpose: 'ffmpeg not detected; rely on native Playwright video capture until installed',
          examples: []
        }
  };
};

const deriveExecutionProfile = ({ intake = null, requestedWorkers = 1 } = {}) => {
  const risks = intake?.dom?.risks ?? [];
  const interactions = intake?.dom?.interactions ?? [];
  const probeActions = intake?.probe?.safe_action_count ?? 0;
  const needsSerial = [
    ...risks,
    ...interactions
  ].some((item) => /iframe|canvas|hydration|loading|dialog|dropdown|navigation|virtual/i.test(item));

  return {
    mode: needsSerial ? 'serial-risk-aware' : 'standard',
    workers: needsSerial ? 1 : requestedWorkers,
    rationale: needsSerial
      ? 'Live target analysis found UI risks or interactive states that are safer to run serially with strict tracing.'
      : 'No strong live-target execution risks were detected; use the requested Playwright worker setting.',
    selector_strategy: intake?.dom?.selector_strategy ?? 'prefer user-facing locators first',
    proven_interactions: intake?.probe?.interactions ?? [],
    safe_probe_actions: probeActions,
    observed_routes: intake?.probe?.observed_routes ?? []
  };
};

export const createPlaywrightRunPlan = ({
  target,
  artifactsRoot = 'artifacts/playwright',
  baseURL = null,
  reporter = 'json',
  workers = 1,
  intake = null
} = {}) => {
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${sanitizeSegment(path.basename(target || 'playwright-run'))}`;
  const runDir = path.resolve(artifactsRoot, 'runs', runId);
  const recordingPlan = createPlaywrightRecordingPlan({ artifactsRoot: path.join(runDir, 'test-results') });
  const reportPath = path.join(runDir, 'report.json');
  const configPath = path.join(runDir, 'playwright.lucy.config.mjs');
  const intakePath = path.join(runDir, 'qa-intake.json');
  const docsContextPath = path.join(runDir, 'qa-docs-context.json');
  const executionProfile = deriveExecutionProfile({ intake, requestedWorkers: workers });

  return {
    implemented: true,
    target,
    run_id: runId,
    run_dir: runDir,
    report_path: reportPath,
    config_path: configPath,
    intake_path: intakePath,
    docs_context_path: docsContextPath,
    reporter,
    workers: executionProfile.workers,
    base_url: baseURL,
    recording: recordingPlan,
    execution_profile: executionProfile
  };
};

const writePlaywrightConfig = (plan, { intake = null, docsContext = [] } = {}) => {
  fs.mkdirSync(plan.run_dir, { recursive: true });
  if (intake) {
    fs.writeFileSync(plan.intake_path, JSON.stringify(intake, null, 2));
  }
  if (docsContext?.length) {
    fs.writeFileSync(plan.docs_context_path, JSON.stringify(docsContext, null, 2));
  }

  const configContents = [
    'import { defineConfig } from "@playwright/test";',
    '',
    `// Lucy QA execution profile: ${plan.execution_profile.mode}`,
    `// Lucy QA execution rationale: ${plan.execution_profile.rationale}`,
    `// Lucy QA selector strategy: ${plan.execution_profile.selector_strategy}`,
    '',
    'export default defineConfig({',
    `  outputDir: ${JSON.stringify(path.join(plan.run_dir, 'test-results'))},`,
    `  reporter: ${JSON.stringify(plan.reporter)},`,
    `  workers: ${JSON.stringify(plan.workers)},`,
    plan.base_url ? `  use: { baseURL: ${JSON.stringify(plan.base_url)}, video: 'on', trace: 'on', screenshot: 'only-on-failure' }` : "  use: { video: 'on', trace: 'on', screenshot: 'only-on-failure' }",
    '});',
    ''
  ].join('\n');

  fs.writeFileSync(plan.config_path, configContents);
  return plan.config_path;
};

const spawnCommand = ({ command, args, cwd }) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  child.on('error', reject);
  child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
});

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
    ].filter(Boolean), 'No reusable project knowledge detected yet.')
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
      lines.push(`  - Excerpt: ${normalizeWhitespace(doc.results[0].excerpt || 'none')}`);
    } else {
      lines.push('  - Top result: none');
    }
  });
  return lines;
};

export const generateQaRunReport = ({ runDir }) => {
  const resolvedRunDir = path.resolve(runDir);
  const reportPath = path.join(resolvedRunDir, 'report.json');
  const stdoutPath = path.join(resolvedRunDir, 'report.stdout.txt');
  const stderrPath = path.join(resolvedRunDir, 'report.stderr.txt');
  const intakePath = path.join(resolvedRunDir, 'qa-intake.json');
  const docsContextPath = path.join(resolvedRunDir, 'qa-docs-context.json');
  const knowledgePath = path.join(resolvedRunDir, 'qa-knowledge.json');
  const configPath = path.join(resolvedRunDir, 'playwright.lucy.config.mjs');

  if (!fs.existsSync(reportPath)) {
    throw new Error(`Run report not found: ${reportPath}`);
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const summary = summarizeJsonReport(report);
  const intake = fs.existsSync(intakePath) ? JSON.parse(fs.readFileSync(intakePath, 'utf8')) : null;
  const docsContext = fs.existsSync(docsContextPath) ? JSON.parse(fs.readFileSync(docsContextPath, 'utf8')) : [];
  const knowledge = fs.existsSync(knowledgePath) ? JSON.parse(fs.readFileSync(knowledgePath, 'utf8')) : null;
  const resultsRoot = path.join(resolvedRunDir, 'test-results');
  const artifacts = {
    videos: collectFilesRecursive(resultsRoot, ['.webm', '.mp4', '.mov', '.mkv']),
    traces: collectFilesRecursive(resultsRoot, ['.zip']),
    screenshots: collectFilesRecursive(resultsRoot, ['.png', '.jpg', '.jpeg'])
  };
  const annotated_screenshots = buildAnnotatedScreenshots({
    runDir: resolvedRunDir,
    summaryCases: summary.cases,
    artifacts
  });
  const defect_clusters = clusterQaDefects({
    summaryCases: summary.cases,
    annotations: annotated_screenshots,
    knowledge: knowledge?.knowledge ?? knowledge ?? null,
    baseUrl: intake?.target_url ?? intake?.runtime?.target_url ?? null
  });
  const failure_intelligence = analyzeQaFailurePatterns({
    summaryCases: summary.cases,
    annotations: annotated_screenshots,
    knowledge: knowledge?.knowledge ?? knowledge ?? null,
    baseUrl: intake?.target_url ?? intake?.runtime?.target_url ?? null
  });
  const failureSummary = summary.cases
    .filter((item) => item.status !== 'passed' && item.status !== 'skipped')
    .map((item) => `${item.title} [${item.project}] - ${item.status}${item.error_message ? ` - ${item.error_message}` : ''}`);

  return {
    implemented: true,
    run_dir: resolvedRunDir,
    report_path: reportPath,
    config_path: fs.existsSync(configPath) ? configPath : null,
    intake_path: fs.existsSync(intakePath) ? intakePath : null,
    docs_context_path: fs.existsSync(docsContextPath) ? docsContextPath : null,
    knowledge_path: fs.existsSync(knowledgePath) ? knowledgePath : null,
    stdout_path: fs.existsSync(stdoutPath) ? stdoutPath : null,
    stderr_path: fs.existsSync(stderrPath) ? stderrPath : null,
    summary,
    artifacts,
    annotated_screenshots,
    defect_clusters,
    failure_summary: failureSummary,
    failure_intelligence,
    reporter: 'json',
    intake,
    docs_context: docsContext,
    knowledge,
    execution_profile: intake?.execution_profile ?? null,
    report_insights: {
      selector_strategy: intake?.dom?.selector_strategy ?? null,
      known_risks: intake?.dom?.risks ?? [],
      crawl_routes: intake?.crawl?.discovered_routes ?? [],
      proven_interactions: intake?.probe?.interactions ?? [],
      knowledge_project_key: intake?.knowledge?.project_key ?? knowledge?.project_key ?? null,
      recurring_failures: failure_intelligence.recurring_failures,
      likely_flaky_failures: failure_intelligence.likely_flaky,
      likely_regressions: failure_intelligence.likely_regressions,
      linked_defect_candidates: defect_clusters.defect_candidates.filter((item) => item.linked_bug_id),
      annotated_screenshot_count: annotated_screenshots.length,
      defect_candidate_count: defect_clusters.defect_candidates.length
    }
  };
};

export const runPlaywrightSuite = async ({
  target,
  artifactsRoot = 'artifacts/playwright',
  baseURL = null,
  runnerCommand = 'npx',
  runnerArgs = ['playwright', 'test'],
  cwd = process.cwd(),
  workers = 1,
  intake = null,
  docsContext = []
} = {}) => {
  const plan = createPlaywrightRunPlan({ target, artifactsRoot, baseURL, workers, intake });
  writePlaywrightConfig(plan, { intake, docsContext });

  const rawArgs = [
    ...runnerArgs,
    target,
    '--config',
    plan.config_path,
    '--reporter=json'
  ].filter(Boolean);

  // Wrap through RTK to compress Playwright test output (typically 90% token savings)
  const { command: resolvedCommand, args: commandArgs } = buildRtkSpawnArgs(runnerCommand, rawArgs);
  const rtkApplied = isRtkAvailable() && resolvedCommand === 'rtk';

  const execution = await spawnCommand({
    command: resolvedCommand,
    args: commandArgs,
    cwd
  });

  fs.writeFileSync(plan.report_path.replace(/\.json$/, '.stdout.txt'), execution.stdout);
  fs.writeFileSync(plan.report_path.replace(/\.json$/, '.stderr.txt'), execution.stderr);

  const report = safeJsonParse(execution.stdout);
  const summary = report ? summarizeJsonReport(report) : {
    total: 0,
    passed: 0,
    failed: execution.code === 0 ? 0 : 1,
    skipped: 0,
    flaky: 0,
    duration_ms: null,
    cases: []
  };

  if (report) {
    fs.writeFileSync(plan.report_path, JSON.stringify(report, null, 2));
  }

  const reportView = fs.existsSync(plan.report_path)
    ? generateQaRunReport({ runDir: plan.run_dir })
    : {
        implemented: true,
        run_dir: plan.run_dir,
        report_path: null,
        stdout_path: plan.report_path.replace(/\.json$/, '.stdout.txt'),
        stderr_path: plan.report_path.replace(/\.json$/, '.stderr.txt'),
        summary,
        artifacts: {
          videos: [],
          traces: [],
          screenshots: []
        },
        failure_summary: []
      };

  return {
    implemented: true,
    status: execution.code === 0 && summary.failed === 0 ? 'passed' : 'failed',
    target,
    run_id: plan.run_id,
    run_dir: plan.run_dir,
    config_path: plan.config_path,
    report_path: reportView.report_path,
    summary: reportView.summary,
    artifacts: reportView.artifacts,
    annotated_screenshots: reportView.annotated_screenshots ?? [],
    defect_clusters: reportView.defect_clusters ?? { defect_candidates: [], summary: [] },
    failure_intelligence: reportView.failure_intelligence ?? { summary: [] },
    failure_summary: reportView.failure_summary,
    stdout_path: reportView.stdout_path,
    stderr_path: reportView.stderr_path,
    intake_path: plan.intake_path,
    docs_context_path: plan.docs_context_path,
    intake,
    docs_context: docsContext,
    execution_profile: plan.execution_profile,
    command: {
      runner: runnerCommand,
      resolved_runner: resolvedCommand,
      args: commandArgs,
      rtk_applied: rtkApplied,
      cwd
    },
    recording: plan.recording,
    raw: execution
  };
};

export const buildPlaywrightPrompt = (goal, { analysis = null, docsContext = [] } = {}) => {
  const baseline = loadText(QA_BASELINE_PATH);
  const recordingPlan = createPlaywrightRecordingPlan();

  return [
    'You are Lucy QA in /qa playwright mode.',
    'Generate a practical Playwright test starter for the user goal below.',
    'Follow the QA baseline strictly.',
    'Use beginner-friendly wording in comments and notes.',
    'Return the answer in markdown-like plain text with the required headings.',
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
    'Required output sections:',
    '- Test Scope',
    '- Assumptions',
    '- Runnable Playwright Spec',
    '- Suggested Fixtures',
    '- Locator Strategy',
    '- Recording and Evidence Strategy',
    '- Flaky Risk Notes',
    '- Next Steps',
    '',
    'Playwright spec rules:',
    '- Output one runnable JavaScript Playwright example.',
    '- Use import { test, expect } from "@playwright/test".',
    '- Include test.describe and at least one test case.',
    '- Prefer resilient locators such as getByRole, getByLabel, getByPlaceholder, or data-testid before brittle CSS selectors.',
    '- Match the generated Playwright starter to the detected testing mode, stack hints, interactive probe findings, Cloudflare crawl route discovery, and reusable project knowledge whenever possible.',
    '- If the intake detected DOM risks, complex widgets, proven interactive controls, or known project risks, reflect them in locator strategy, waits, and assertions.',
    '- Add short comments where assumptions are important.',
    '- Keep the spec easy to adapt, not overly long.',
    '- If selectors are unknown, use clear placeholder locators and say they must be confirmed.',
    '- Include assertions for the critical expected outcome.',
    '- Explain how to record screen video for every automated test run and for each test case.',
    '- Prefer native Playwright per-test video recording as the default approach.',
    '- Mention ffmpeg only as an optional post-processing step for format conversion, compression, or stitching.',
    '',
    'Recording defaults to recommend:',
    recordingPlan.configSnippet,
    '',
    'Quality requirements:',
    '- Start with the smoke-critical path first.',
    '- Mention positive and negative coverage opportunities if relevant.',
    '- Point out flaky risks such as timing, unstable selectors, test data, captchas, OTP, or environment dependencies.',
    '- Use Context7 documentation hints when they clarify framework-specific patterns.',
    '- Make assumptions explicit instead of inventing hidden details.',
    '- Include evidence expectations such as video, trace, and screenshots.'
  ].join('\n');
};

export const generatePlaywrightSpec = (goal, options = {}) => ({
  goal,
  implemented: true,
  task_type: 'qa',
  prompt: buildPlaywrightPrompt(goal, options),
  recording: createPlaywrightRecordingPlan()
});
