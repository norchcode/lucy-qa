import fs from 'node:fs';
import path from 'node:path';
import { buildQaIntegrationReadiness, saveQaIntegrationSecrets, testJiraConnection, testQaseConnection } from './qa-integrations.mjs';

const resolveVaultPath = (vaultPath = null) => path.resolve(vaultPath ?? process.env.LUCY_QA_VAULT_PATH ?? path.resolve(process.cwd(), 'vault'));
const configDir = (vaultPath = null) => path.join(resolveVaultPath(vaultPath), 'qa-config');
const onboardingPath = (vaultPath = null) => path.join(configDir(vaultPath), 'onboarding.json');

const defaultProfile = () => ({
  qa_test_management: null,
  qa_project: null,
  issue_tracker: null,
  issue_project: null,
  preferred_bug_workflow: null,
  updated_at: null
});

const buildMissingQuestions = (profile = defaultProfile()) => {
  const questions = [];
  if (!profile.qa_test_management) {
    questions.push('Which QA/test management system do you use? Example: Qase, TestRail, Xray, Zephyr, or none.');
  }
  if (profile.qa_test_management && profile.qa_test_management !== 'none' && !profile.qa_project) {
    questions.push('If relevant, what QA/test management project/code should Lucy QA use there?');
  }
  if (!profile.issue_tracker) {
    questions.push('Which task management / issue tracker do you use? Example: Jira, Linear, GitHub Issues, GitLab Issues, Azure DevOps, YouTrack, or none.');
  }
  if (profile.issue_tracker && profile.issue_tracker !== 'none' && !profile.issue_project) {
    questions.push('If relevant, what project/team/key should Lucy QA use there?');
  }
  return questions;
};

const isOnboardingConfigured = (profile = defaultProfile()) => buildMissingQuestions(profile).length === 0;

const normalizeText = (value = '') => String(value).trim();
const normalizeLower = (value = '') => normalizeText(value).toLowerCase();

const extractProjectAfter = (text, keyword) => {
  const pattern = new RegExp(`\\b${keyword}\\b[^.\\n]*?\\bproject\\s+([A-Za-z0-9_-]+)`, 'i');
  return text.match(pattern)?.[1] ?? null;
};

export const inferQaOnboardingFromConversation = (inputText = '') => {
  const raw = normalizeText(inputText);
  const text = normalizeLower(inputText);
  if (!raw) {
    return null;
  }

  const qaTestManagement = /\bqase\b/.test(text)
    ? 'qase'
    : /\btestrail\b/.test(text)
      ? 'testrail'
      : /\bxray\b/.test(text)
        ? 'xray'
        : /\bzephyr\b/.test(text)
          ? 'zephyr'
          : /\bno(ne)?\b/.test(text) && /\bqa|test management\b/.test(text)
            ? 'none'
            : undefined;

  const issueTracker = /\bjira\b/.test(text)
    ? 'jira'
    : /\blinear\b/.test(text)
      ? 'linear'
      : /\bgithub issues\b/.test(text)
        ? 'github issues'
        : /\bgitlab issues\b/.test(text)
          ? 'gitlab issues'
          : /\bazure devops\b/.test(text)
            ? 'azure devops'
            : /\byoutrack\b/.test(text)
              ? 'youtrack'
              : /\bno(ne)?\b/.test(text) && /\bissue tracker|task management\b/.test(text)
                ? 'none'
                : undefined;

  const qaProject = qaTestManagement && qaTestManagement !== 'none'
    ? extractProjectAfter(raw, qaTestManagement) ?? undefined
    : undefined;
  const issueProject = issueTracker && issueTracker !== 'none'
    ? extractProjectAfter(raw, issueTracker.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')) ?? undefined
    : undefined;

  const preferredBugWorkflowMatch = raw.match(/(append evidence[^.\n]*bugs?[^.\n]*|append evidence[^.\n]*new ones[^.\n]*)/i);
  const preferredBugWorkflow = preferredBugWorkflowMatch?.[1] ? preferredBugWorkflowMatch[1].trim().replace(/[.]$/, '') : undefined;

  if ([qaTestManagement, qaProject, issueTracker, issueProject, preferredBugWorkflow].every((item) => item === undefined)) {
    return null;
  }

  return {
    qaTestManagement,
    qaProject,
    issueTracker,
    issueProject,
    preferredBugWorkflow
  };
};

export const loadQaOnboardingProfile = async ({ vaultPath = null } = {}) => {
  const filePath = onboardingPath(vaultPath);
  if (!fs.existsSync(filePath)) {
    const profile = defaultProfile();
    return {
      implemented: true,
      configured: isOnboardingConfigured(profile),
      path: filePath,
      profile,
      questions: buildMissingQuestions(profile)
    };
  }

  const profile = {
    ...defaultProfile(),
    ...JSON.parse(fs.readFileSync(filePath, 'utf8'))
  };
  return {
    implemented: true,
    configured: isOnboardingConfigured(profile),
    path: filePath,
    profile,
    questions: buildMissingQuestions(profile)
  };
};

export const saveQaOnboardingProfile = async ({
  qaTestManagement = undefined,
  qaProject = undefined,
  issueTracker = undefined,
  issueProject = undefined,
  preferredBugWorkflow = undefined,
  vaultPath = null
} = {}) => {
  const loaded = await loadQaOnboardingProfile({ vaultPath });
  const next = {
    ...loaded.profile,
    ...(qaTestManagement !== undefined ? { qa_test_management: qaTestManagement } : {}),
    ...(qaProject !== undefined ? { qa_project: qaProject } : {}),
    ...(issueTracker !== undefined ? { issue_tracker: issueTracker } : {}),
    ...(issueProject !== undefined ? { issue_project: issueProject } : {}),
    ...(preferredBugWorkflow !== undefined ? { preferred_bug_workflow: preferredBugWorkflow } : {}),
    updated_at: new Date().toISOString()
  };
  fs.mkdirSync(configDir(vaultPath), { recursive: true });
  fs.writeFileSync(loaded.path, JSON.stringify(next, null, 2));
  return {
    implemented: true,
    configured: isOnboardingConfigured(next),
    path: loaded.path,
    profile: next,
    questions: buildMissingQuestions(next)
  };
};

export const runQaOnboardingCommand = async ({
  qaTestManagement = undefined,
  qaProject = undefined,
  issueTracker = undefined,
  issueProject = undefined,
  preferredBugWorkflow = undefined,
  jiraBaseUrl = undefined,
  jiraEmail = undefined,
  jiraApiToken = undefined,
  qaseBaseUrl = undefined,
  qaseApiToken = undefined,
  testConnections = false,
  vaultPath = null
} = {}) => {
  const hasProfileUpdate = [qaTestManagement, qaProject, issueTracker, issueProject, preferredBugWorkflow].some((item) => item !== undefined);
  const hasSecretsUpdate = [jiraBaseUrl, jiraEmail, jiraApiToken, qaseBaseUrl, qaseApiToken].some((item) => item !== undefined);
  let result;
  if (!hasProfileUpdate && !hasSecretsUpdate) {
    result = await loadQaOnboardingProfile({ vaultPath });
  } else {
    result = hasProfileUpdate
      ? await saveQaOnboardingProfile({ qaTestManagement, qaProject, issueTracker, issueProject, preferredBugWorkflow, vaultPath })
      : await loadQaOnboardingProfile({ vaultPath });
    if (hasSecretsUpdate) {
      await saveQaIntegrationSecrets({ jiraBaseUrl, jiraEmail, jiraApiToken, qaseBaseUrl, qaseApiToken, vaultPath });
    }
  }
  const integrations = await buildQaIntegrationReadiness({ onboarding: result.profile, vaultPath });
  const connection_tests = [];
  if (testConnections) {
    if (String(result.profile.issue_tracker ?? '').trim().toLowerCase() === 'jira') {
      connection_tests.push(await testJiraConnection({ vaultPath }));
    }
    if (String(result.profile.qa_test_management ?? '').trim().toLowerCase() === 'qase') {
      connection_tests.push(await testQaseConnection({ vaultPath }));
    }
  }
  return {
    ...result,
    integrations,
    connection_tests
  };
};

export const resolveQaOnboardingDefaults = async ({ vaultPath = null } = {}) => {
  const loaded = await loadQaOnboardingProfile({ vaultPath });
  return {
    implemented: true,
    configured: loaded.configured,
    path: loaded.path,
    defaults: {
      qa_test_management: loaded.profile.qa_test_management,
      qa_project: loaded.profile.qa_project,
      issue_tracker: loaded.profile.issue_tracker,
      issue_project: loaded.profile.issue_project,
      preferred_bug_workflow: loaded.profile.preferred_bug_workflow
    }
  };
};
