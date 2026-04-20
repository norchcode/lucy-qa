const toTitle = (finding) => {
  const cleaned = String(finding).trim().replace(/\.+$/, '');
  if (!cleaned) {
    return 'Bug report pending more detail';
  }
  return cleaned[0].toUpperCase() + cleaned.slice(1);
};

const buildEnvironmentLines = (context = {}) => {
  const lines = [];
  if (context.base_url) lines.push(`- Base URL: ${context.base_url}`);
  if (context.run_dir) lines.push(`- Run directory: ${context.run_dir}`);
  if (context.execution_profile?.mode) lines.push(`- Execution profile: ${context.execution_profile.mode}`);
  if (context.execution_profile?.rationale) lines.push(`- Execution rationale: ${context.execution_profile.rationale}`);
  if (context.knowledge_project_key) lines.push(`- Project knowledge key: ${context.knowledge_project_key}`);
  if (context.defect_signature) lines.push(`- Defect signature: ${context.defect_signature}`);
  if (context.defect_disposition) lines.push(`- Defect disposition: ${context.defect_disposition}`);
  if (context.linked_bug_id) lines.push(`- Linked bug ID: ${context.linked_bug_id}`);
  if (context.tracker_system) lines.push(`- Tracker system: ${context.tracker_system}`);
  if (context.tracker_status) lines.push(`- Tracker status: ${context.tracker_status}`);
  if (context.tracker_url) lines.push(`- Tracker URL: ${context.tracker_url}`);
  if (context.qa_test_management) lines.push(`- QA/test management: ${context.qa_test_management}`);
  if (context.qa_project) lines.push(`- QA/test management project/code: ${context.qa_project}`);
  if (context.issue_project) lines.push(`- Issue project/team: ${context.issue_project}`);
  if (context.selector_strategy) lines.push(`- Selector strategy observed during intake: ${context.selector_strategy}`);
  return lines.length
    ? lines
    : [
        '- Assumption: environment not fully specified by the user.',
        '- Suggested default: capture app URL, browser, device, build/version, and test environment name.'
      ];
};

const buildPreconditionLines = (context = {}) => {
  const lines = [];
  if (context.crawl_routes?.length) {
    lines.push(`- Relevant discovered routes: ${context.crawl_routes.slice(0, 5).join(', ')}.`);
  }
  if (context.proven_interactions?.length) {
    lines.push(`- Proven interactions seen during intake: ${context.proven_interactions.join(', ')}.`);
  }
  if (context.case_titles?.length) {
    lines.push(`- Impacted cases grouped under this defect: ${context.case_titles.join(', ')}.`);
  }
  if (context.known_risks?.length) {
    lines.push(`- Known QA risks for this project: ${context.known_risks.join('; ')}.`);
  }
  return lines.length
    ? lines
    : ['- Assumption: user is on the relevant page and has the permissions or test data needed to reproduce the issue.'];
};

const buildEvidenceLines = (context = {}) => {
  const lines = [];
  if (context.artifact_paths?.length) {
    lines.push(`- Relevant artifacts: ${context.artifact_paths.join(', ')}`);
  }
  if (context.annotated_screenshots?.length) {
    lines.push(`- Annotated screenshots: ${context.annotated_screenshots.map((item) => item.annotated_path).join(', ')}`);
    lines.push(`- Annotation sources: ${context.annotated_screenshots.map((item) => item.suggestion_source ?? 'unknown').join(', ')}`);
  }
  if (context.case_title) {
    lines.push(`- Failing case: ${context.case_title}`);
  }
  if (context.error_message) {
    lines.push(`- Failure message: ${context.error_message}`);
  }
  if (context.failure_intelligence?.summary?.length) {
    lines.push(`- Cross-run failure intelligence: ${context.failure_intelligence.summary.join(' ')}`);
  }
  lines.push('- Capture screenshot, screen recording, console/network logs, and any Playwright trace or video if available.');
  return lines;
};

export const runQaBugCommand = async ({ finding, context = null }) => {
  const title = toTitle(finding);
  const ctx = context ?? {};
  const report = [
    'Lucy QA bug report',
    '',
    'Title',
    `- ${title}`,
    '',
    'Environment',
    ...buildEnvironmentLines(ctx),
    '',
    'Precondition',
    ...buildPreconditionLines(ctx),
    '',
    'Exact steps',
    '1. Open the affected workflow or page.',
    `2. Reproduce the observed issue: ${title}.`,
    '3. Capture the exact UI state, request, or error message when the issue appears.',
    '',
    'Expected vs Actual',
    '- Expected: The workflow should complete successfully without the reported failure.',
    `- Actual: ${title}.`,
    '',
    'Failure intelligence',
    ...(ctx.failure_intelligence?.summary?.length
      ? ctx.failure_intelligence.summary.map((line) => `- ${line}`)
      : ['- No cross-run recurrence analysis was available for this bug draft.']),
    ...(ctx.failure_intelligence?.recurring_failures?.length
      ? [`- Seen before: ${ctx.failure_intelligence.recurring_failures.slice(0, 3).map((item) => `${item.title} (count=${item.occurrence_count})`).join('; ')}`]
      : []),
    ...(ctx.failure_intelligence?.likely_flaky?.length
      ? [`- Likely flaky/environment-sensitive signals: ${ctx.failure_intelligence.likely_flaky.slice(0, 3).map((item) => item.title).join('; ')}`]
      : []),
    '',
    'Severity',
    '- Suggested severity: High if this blocks a critical path; otherwise adjust after confirming impact.',
    ...(ctx.known_risks?.length ? [`- Risk context: ${ctx.known_risks.join('; ')}`] : []),
    '',
    'Priority',
    '- Suggested priority: High if this affects release-critical coverage; otherwise adjust by release need.',
    ...(ctx.execution_profile?.mode ? [`- Execution context: ${ctx.execution_profile.mode}`] : []),
    '',
    'Evidence',
    ...buildEvidenceLines(ctx),
    '',
    'Notes',
    '- Replace assumptions with confirmed environment details before filing the final defect.',
    '- Add exact timestamps, account/test data, and artifact paths if available.',
    ...(ctx.preferred_bug_workflow ? [`- Team bug workflow preference: ${ctx.preferred_bug_workflow}`] : []),
    ...(ctx.docs_queries?.length ? [`- Relevant docs queries used during QA planning: ${ctx.docs_queries.join('; ')}`] : [])
  ].join('\n');

  return {
    implemented: true,
    finding,
    report,
    title,
    context: ctx
  };
};
