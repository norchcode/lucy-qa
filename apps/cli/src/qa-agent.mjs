import { runQaPlanCommand } from './qa-plan.mjs';
import { runQaCasesCommand } from './qa-cases.mjs';
import { runQaPlaywrightCommand } from './qa-playwright.mjs';
import { runQaRunCommand } from './qa-run.mjs';
import { runQaReportCommand } from './qa-report.mjs';
import { runQaBugsFromRunCommand } from './qa-bugs.mjs';
import { publishQaRunToTestManagement } from './qa-qase.mjs';
import { runStateShowCommand, runStateSaveLastRun, runStateSaveLastBugs } from './state.mjs';

const normalize = (value = '') => String(value).toLowerCase().replace(/\s+/g, ' ').trim();

const extractFirstUrl = (goal) => {
  const match = String(goal).match(/https?:\/\/\S+/i);
  return match ? match[0].replace(/[),.]+$/, '') : null;
};

const extractLikelyTarget = (goal) => {
  const pathMatch = String(goal).match(/(?:^|\s)((?:tests?|specs?|e2e|playwright|artifacts)\/[\w./-]+|[\w./-]+\.spec\.[cm]?[jt]sx?|[\w./-]+\.[cm]?m?js)(?=\s|$)/i);
  if (pathMatch) {
    return pathMatch[1];
  }
  return null;
};

const needsLatestRun = (state) => !(state?.last_run?.run_dir);

const buildClarification = ({ goal, reason, suggestions = [] }) => ({
  implemented: true,
  kind: 'clarification',
  goal,
  reason,
  suggestions,
  session_update: {
    summary: `Lucy QA agent needs clarification before it can act on: ${goal}.`,
    recentCommands: [`agent ${goal}`],
    openTasks: suggestions,
    unresolved: [reason],
    decisions: []
  }
});

const detectIntent = (goal) => {
  const text = normalize(goal);
  if (!text) return { type: 'clarification', reason: 'No goal was provided.' };

  if (/(review|analy[sz]e|summari[sz]e|report on|inspect).*(latest run|last run)/.test(text)) {
    return { type: 'report-latest-run' };
  }
  if (/(draft|generate|create).*(bugs?|bug reports?).*(latest run|last run)/.test(text)) {
    return { type: 'bugs-latest-run' };
  }
  if (/(publish|sync).*(latest run|last run).*(qase|test management|test-management)/.test(text) || /(publish|sync).*(latest run|last run)/.test(text)) {
    return { type: 'publish-latest-run', system: /qase/.test(text) ? 'qase' : 'auto' };
  }
  if (/(generate|write|create).*(playwright|spec)/.test(text) || /^playwright\b/.test(text)) {
    return { type: 'playwright' };
  }
  if (/(generate|write|create).*(test cases|cases)/.test(text) || /^cases\b/.test(text)) {
    return { type: 'cases' };
  }
  if (/(plan|strategy|test plan)/.test(text)) {
    return { type: 'plan' };
  }
  if (/(run|execute).*(qa|tests?|playwright|spec)/.test(text)) {
    return { type: 'run' };
  }

  return {
    type: 'clarification',
    reason: 'Lucy QA could not confidently map that goal to an autonomous workflow yet.'
  };
};

export const runQaAgentCommand = async ({
  goal,
  providerName = null,
  model = null,
  vaultPath = null,
  artifactsRoot = 'artifacts/playwright'
}) => {
  const state = await runStateShowCommand({ vaultPath });
  const intent = detectIntent(goal);

  if (intent.type === 'clarification') {
    return buildClarification({
      goal,
      reason: intent.reason,
      suggestions: [
        'Try: review latest run',
        'Try: draft bugs from latest run',
        'Try: publish latest run to Qase',
        'Try: create a QA plan for login flow',
        'Try: generate Playwright for checkout smoke',
        'Try: run tests/e2e/login.spec.js against https://example.test'
      ]
    });
  }

  if (intent.type === 'report-latest-run') {
    if (needsLatestRun(state)) {
      return buildClarification({
        goal,
        reason: 'There is no saved latest run in Lucy QA state yet.',
        suggestions: ['Run a QA suite first, or provide an explicit run directory with qa report <run-dir>.']
      });
    }
    const result = await runQaReportCommand({ runDir: state.last_run.run_dir });
    return {
      implemented: true,
      kind: 'report',
      goal,
      intent,
      result,
      session_update: {
        summary: `Lucy QA agent reviewed the latest run at ${result.run_dir}.`,
        recentCommands: [`agent ${goal}`],
        openTasks: result.summary.failed > 0
          ? [`Investigate the ${result.summary.failed} failed case(s) in ${result.run_dir}.`, `Draft or review bugs from run ${result.run_dir}.`]
          : [`Archive or share QA report for ${result.run_dir}.`],
        artifacts: [result.report_path].filter(Boolean),
        decisions: ['Used saved last-run state to resolve “latest run”.']
      }
    };
  }

  if (intent.type === 'bugs-latest-run') {
    if (needsLatestRun(state)) {
      return buildClarification({
        goal,
        reason: 'There is no saved latest run in Lucy QA state yet.',
        suggestions: ['Run a QA suite first, or use qa bugs --from-run <run-dir>.']
      });
    }
    const result = await runQaBugsFromRunCommand({ runDir: state.last_run.run_dir });
    await runStateSaveLastBugs({
      bugs: result.bugs.map((item) => ({ title: item.title, case_title: item.case_title })),
      sourceRunDir: result.run_dir,
      vaultPath
    });
    return {
      implemented: true,
      kind: 'bugs',
      goal,
      intent,
      result,
      session_update: {
        summary: `Lucy QA agent drafted ${result.total_defect_candidates} grouped bug report(s) from the latest run.`,
        recentCommands: [`agent ${goal}`],
        openTasks: result.total_defect_candidates > 0
          ? [`Review and file ${result.total_defect_candidates} drafted bug report(s) from ${result.run_dir}.`]
          : [`No bug drafts were created from ${result.run_dir}; archive the run if complete.`],
        artifacts: [result.run_dir],
        decisions: ['Used saved last-run state to draft bugs from the latest run.']
      }
    };
  }

  if (intent.type === 'publish-latest-run') {
    if (needsLatestRun(state)) {
      return buildClarification({
        goal,
        reason: 'There is no saved latest run in Lucy QA state yet.',
        suggestions: ['Run a QA suite first, or use qa report publish <run-dir> explicitly.']
      });
    }
    const result = await publishQaRunToTestManagement({
      runDir: state.last_run.run_dir,
      system: intent.system ?? 'auto',
      vaultPath
    });
    return {
      implemented: true,
      kind: 'publish',
      goal,
      intent,
      result,
      session_update: {
        summary: `Lucy QA agent published the latest run to ${result.system}.`,
        recentCommands: [`agent ${goal}`],
        openTasks: [],
        artifacts: [result.remote_run?.url].filter(Boolean),
        decisions: ['Used saved last-run state to publish the latest run.']
      }
    };
  }

  if (intent.type === 'plan') {
    const targetUrl = extractFirstUrl(goal);
    const result = await runQaPlanCommand({ goal, targetUrl, providerName, model, taskType: 'qa' });
    return {
      implemented: true,
      kind: 'ask',
      title: 'Lucy QA autonomous plan',
      goal,
      intent,
      result,
      session_update: {
        summary: `Lucy QA agent created a QA plan for: ${goal}.`,
        recentCommands: [`agent ${goal}`],
        openTasks: [`Review the generated QA plan for: ${goal}.`],
        decisions: ['Autonomous intent routing selected the QA planning workflow.']
      }
    };
  }

  if (intent.type === 'cases') {
    const targetUrl = extractFirstUrl(goal);
    const result = await runQaCasesCommand({ goal, targetUrl, providerName, model, taskType: 'qa' });
    return {
      implemented: true,
      kind: 'ask',
      title: 'Lucy QA autonomous test cases',
      goal,
      intent,
      result,
      session_update: {
        summary: `Lucy QA agent generated QA cases for: ${goal}.`,
        recentCommands: [`agent ${goal}`],
        openTasks: [`Review and refine the generated QA cases for: ${goal}.`],
        decisions: ['Autonomous intent routing selected the QA case-generation workflow.']
      }
    };
  }

  if (intent.type === 'playwright') {
    const targetUrl = extractFirstUrl(goal);
    const result = await runQaPlaywrightCommand({ goal, targetUrl, providerName, model, taskType: 'qa' });
    return {
      implemented: true,
      kind: 'ask',
      title: 'Lucy QA autonomous Playwright spec',
      goal,
      intent,
      result,
      session_update: {
        summary: `Lucy QA agent generated a Playwright starter for: ${goal}.`,
        recentCommands: [`agent ${goal}`],
        openTasks: [`Review, save, or adapt the generated Playwright starter for: ${goal}.`],
        decisions: ['Autonomous intent routing selected the Playwright generation workflow.']
      }
    };
  }

  if (intent.type === 'run') {
    const baseURL = extractFirstUrl(goal);
    const target = extractLikelyTarget(goal);
    if (!target) {
      return buildClarification({
        goal,
        reason: 'Lucy QA could not find a Playwright spec or target path to run.',
        suggestions: ['Try: run tests/e2e/login.spec.js against https://example.test']
      });
    }
    const result = await runQaRunCommand({ target, baseURL, artifactsRoot });
    await runStateSaveLastRun({
      runId: result.run_id,
      runDir: result.run_dir,
      status: result.status,
      target: result.target,
      reportPath: result.report_path,
      vaultPath
    });
    return {
      implemented: true,
      kind: 'run',
      goal,
      intent,
      result,
      session_update: {
        summary: `Lucy QA agent ran ${result.target} and finished with status ${result.status}.`,
        recentCommands: [`agent ${goal}`],
        openTasks: result.status === 'failed'
          ? [`Investigate failed QA run ${result.run_id}.`, `Review report at ${result.run_dir}.`, `Draft or review bugs from run ${result.run_id}.`]
          : [`Review or archive QA run ${result.run_id}.`],
        artifacts: [result.run_dir, result.report_path].filter(Boolean),
        decisions: ['Autonomous intent routing selected the QA run workflow.']
      }
    };
  }

  return buildClarification({
    goal,
    reason: 'Lucy QA could not complete that goal autonomously yet.',
    suggestions: ['Try a more specific QA objective.']
  });
};
