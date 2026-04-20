import { generateQaRunReport } from '../../../packages/qa-playwright/src/index.mjs';
import { resolveQaOnboardingDefaults } from './qa-onboarding.mjs';
import { resolveQaseCredentials } from './qa-integrations.mjs';

const getEnv = (...names) => {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  return null;
};

const ensureOk = async (response, context) => {
  if (response.ok) return;
  const text = await response.text().catch(() => '');
  throw new Error(`${context} failed (${response.status} ${response.statusText})${text ? `: ${text.slice(0, 500)}` : ''}`);
};

const buildRunTitle = ({ report, explicitTitle = null }) => {
  if (explicitTitle) return explicitTitle;
  const basename = report.run_dir.split('/').filter(Boolean).pop() ?? 'playwright-run';
  return `Lucy QA Playwright run - ${basename}`;
};

const buildRunDescription = ({ report }) => {
  const lines = [
    'Lucy QA Playwright run summary',
    '',
    `Run directory: ${report.run_dir}`,
    `Target URL: ${report.intake?.target_url ?? report.intake?.runtime?.target_url ?? 'not set'}`,
    `Execution mode: ${report.execution_profile?.mode ?? 'not set'}`,
    `Passed: ${report.summary.passed}`,
    `Failed: ${report.summary.failed}`,
    `Skipped: ${report.summary.skipped}`,
    `Flaky: ${report.summary.flaky}`,
    `Duration ms: ${report.summary.duration_ms ?? 'unknown'}`,
    ''
  ];

  if (report.failure_summary?.length) {
    lines.push('Failure summary:');
    for (const item of report.failure_summary.slice(0, 20)) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  if (report.defect_clusters?.summary?.length) {
    lines.push('Defect candidates:');
    for (const item of report.defect_clusters.summary.slice(0, 10)) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  if (report.artifacts?.traces?.length || report.artifacts?.videos?.length || report.artifacts?.screenshots?.length) {
    lines.push('Artifacts:');
    for (const item of [
      ...(report.artifacts?.traces ?? []),
      ...(report.artifacts?.videos ?? []),
      ...(report.artifacts?.screenshots ?? [])
    ].slice(0, 20)) {
      lines.push(`- ${item}`);
    }
  }

  return lines.join('\n');
};

const createQaseRun = async ({ projectCode, title, description, vaultPath = null }) => {
  const creds = await resolveQaseCredentials({ vaultPath });
  const apiToken = creds.api_token ?? getEnv('LUCY_QA_QASE_API_TOKEN', 'QASE_API_TOKEN');
  const baseUrl = creds.base_url ?? getEnv('LUCY_QA_QASE_BASE_URL', 'QASE_BASE_URL') ?? 'https://api.qase.io/v1';
  if (!apiToken) {
    throw new Error('Qase integration requires LUCY_QA_QASE_API_TOKEN or QASE_API_TOKEN');
  }
  if (!projectCode) {
    throw new Error('Qase publishing requires a project code. Save it with qa onboarding --qa-project <CODE> or pass --project <CODE>.');
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/run/${encodeURIComponent(projectCode)}`, {
    method: 'POST',
    headers: {
      token: apiToken,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({ title, description })
  });

  await ensureOk(response, 'Qase run creation');
  const data = await response.json();
  const runId = data?.result?.id ?? data?.result?.run_id ?? null;
  return {
    implemented: true,
    system: 'qase',
    project_code: projectCode,
    run_id: runId,
    title,
    url: runId ? `https://app.qase.io/run/${projectCode}/dashboard/${runId}` : null,
    raw: data
  };
};

const completeQaseRun = async ({ projectCode, runId, vaultPath = null }) => {
  if (!runId) return { implemented: true, completed: false };
  const creds = await resolveQaseCredentials({ vaultPath });
  const apiToken = creds.api_token ?? getEnv('LUCY_QA_QASE_API_TOKEN', 'QASE_API_TOKEN');
  const baseUrl = creds.base_url ?? getEnv('LUCY_QA_QASE_BASE_URL', 'QASE_BASE_URL') ?? 'https://api.qase.io/v1';
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/run/${encodeURIComponent(projectCode)}/${encodeURIComponent(String(runId))}/complete`, {
    method: 'POST',
    headers: {
      token: apiToken,
      'content-type': 'application/json',
      accept: 'application/json'
    }
  });
  await ensureOk(response, 'Qase run completion');
  return {
    implemented: true,
    completed: true
  };
};

export const publishQaRunToTestManagement = async ({
  runDir,
  system = 'auto',
  projectCode = null,
  title = null,
  completeRun = false,
  vaultPath = null
}) => {
  const onboarding = await resolveQaOnboardingDefaults({ vaultPath });
  const resolvedSystem = system === 'auto' ? onboarding.defaults.qa_test_management : system;
  const normalized = String(resolvedSystem ?? '').trim().toLowerCase();
  if (normalized !== 'qase') {
    throw new Error(`Unsupported QA/test management system for now: ${resolvedSystem ?? 'not set'}. Currently implemented: Qase.`);
  }

  const report = generateQaRunReport({ runDir });
  const resolvedProjectCode = projectCode ?? onboarding.defaults.qa_project ?? onboarding.defaults.issue_project ?? null;
  const remoteRun = await createQaseRun({
    projectCode: resolvedProjectCode,
    title: buildRunTitle({ report, explicitTitle: title }),
    description: buildRunDescription({ report }),
    vaultPath
  });
  const completion = completeRun ? await completeQaseRun({ projectCode: resolvedProjectCode, runId: remoteRun.run_id, vaultPath }) : { implemented: true, completed: false };

  return {
    implemented: true,
    system: 'qase',
    project_code: resolvedProjectCode,
    run_dir: report.run_dir,
    summary: report.summary,
    remote_run: remoteRun,
    completion
  };
};
