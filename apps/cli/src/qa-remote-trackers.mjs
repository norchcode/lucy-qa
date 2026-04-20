import { Buffer } from 'node:buffer';
import { resolveJiraCredentials } from './qa-integrations.mjs';

const normalizeTrackerSystem = (value = '') => String(value).trim().toLowerCase();

const ensureOk = async (response, context) => {
  if (response.ok) return;
  const text = await response.text().catch(() => '');
  throw new Error(`${context} failed (${response.status} ${response.statusText})${text ? `: ${text.slice(0, 500)}` : ''}`);
};

const getEnv = (...names) => {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  return null;
};

const createJiraIssue = async ({ projectKey, summary, description, issueType = 'Bug', labels = [], vaultPath = null }) => {
  const creds = await resolveJiraCredentials({ vaultPath });
  const baseUrl = creds.base_url ?? getEnv('LUCY_QA_JIRA_BASE_URL', 'JIRA_BASE_URL');
  const email = creds.email ?? getEnv('LUCY_QA_JIRA_EMAIL', 'JIRA_EMAIL');
  const apiToken = creds.api_token ?? getEnv('LUCY_QA_JIRA_API_TOKEN', 'JIRA_API_TOKEN');

  if (!baseUrl || !email || !apiToken) {
    throw new Error('Jira integration requires LUCY_QA_JIRA_BASE_URL/JIRA_BASE_URL, LUCY_QA_JIRA_EMAIL/JIRA_EMAIL, and LUCY_QA_JIRA_API_TOKEN/JIRA_API_TOKEN');
  }
  if (!projectKey) {
    throw new Error('Jira issue creation requires a project key. Save it with qa onboarding --issue-project <KEY> or pass --project <KEY>.');
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/rest/api/2/issue`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      fields: {
        project: { key: projectKey },
        summary,
        description,
        issuetype: { name: issueType },
        ...(labels.length ? { labels } : {})
      }
    })
  });

  await ensureOk(response, 'Jira issue creation');
  const data = await response.json();
  const issueKey = data?.key ?? null;
  return {
    implemented: true,
    tracker_system: 'jira',
    issue_id: issueKey,
    issue_key: issueKey,
    issue_title: summary,
    issue_url: issueKey ? `${baseUrl.replace(/\/$/, '')}/browse/${issueKey}` : null,
    issue_status: 'Open',
    raw: data
  };
};

export const createRemoteTrackerIssue = async ({
  trackerSystem,
  projectKey = null,
  summary,
  description,
  issueType = 'Bug',
  labels = [],
  vaultPath = null
}) => {
  const normalized = normalizeTrackerSystem(trackerSystem);
  if (!normalized) {
    throw new Error('trackerSystem is required for remote issue creation');
  }
  if (!summary) {
    throw new Error('summary is required for remote issue creation');
  }
  if (!description) {
    throw new Error('description is required for remote issue creation');
  }

  if (normalized === 'jira') {
    return createJiraIssue({ projectKey, summary, description, issueType, labels, vaultPath });
  }

  throw new Error(`Unsupported remote issue tracker for now: ${trackerSystem}. Currently implemented: Jira.`);
};
