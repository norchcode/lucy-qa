import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';

const resolveVaultPath = (vaultPath = null) => path.resolve(vaultPath ?? process.env.LUCY_QA_VAULT_PATH ?? path.resolve(process.cwd(), 'vault'));
const configDir = (vaultPath = null) => path.join(resolveVaultPath(vaultPath), 'qa-config');
const credentialsPath = (vaultPath = null) => path.join(configDir(vaultPath), 'credentials.json');

const defaultSecrets = () => ({
  jira: {
    base_url: null,
    email: null,
    api_token: null,
    updated_at: null
  },
  qase: {
    base_url: null,
    api_token: null,
    updated_at: null
  }
});

const mask = (value) => {
  if (!value) return 'not set';
  const text = String(value);
  if (text.length <= 8) return '***';
  return `${text.slice(0, 4)}***${text.slice(-3)}`;
};

const ensureOk = async (response, context) => {
  if (response.ok) return;
  const text = await response.text().catch(() => '');
  throw new Error(`${context} failed (${response.status} ${response.statusText})${text ? `: ${text.slice(0, 500)}` : ''}`);
};

export const loadQaIntegrationSecrets = async ({ vaultPath = null } = {}) => {
  const filePath = credentialsPath(vaultPath);
  if (!fs.existsSync(filePath)) {
    return {
      implemented: true,
      path: filePath,
      configured: false,
      secrets: defaultSecrets(),
      masked: {
        jira: { base_url: 'not set', email: 'not set', api_token: 'not set' },
        qase: { base_url: 'not set', api_token: 'not set' }
      }
    };
  }
  const secrets = { ...defaultSecrets(), ...JSON.parse(fs.readFileSync(filePath, 'utf8')) };
  return {
    implemented: true,
    path: filePath,
    configured: Boolean(secrets.jira?.api_token || secrets.qase?.api_token),
    secrets,
    masked: {
      jira: {
        base_url: secrets.jira?.base_url ?? 'not set',
        email: secrets.jira?.email ?? 'not set',
        api_token: mask(secrets.jira?.api_token)
      },
      qase: {
        base_url: secrets.qase?.base_url ?? 'not set',
        api_token: mask(secrets.qase?.api_token)
      }
    }
  };
};

export const saveQaIntegrationSecrets = async ({
  jiraBaseUrl = undefined,
  jiraEmail = undefined,
  jiraApiToken = undefined,
  qaseBaseUrl = undefined,
  qaseApiToken = undefined,
  vaultPath = null
} = {}) => {
  const loaded = await loadQaIntegrationSecrets({ vaultPath });
  const next = {
    jira: {
      ...loaded.secrets.jira,
      ...(jiraBaseUrl !== undefined ? { base_url: jiraBaseUrl } : {}),
      ...(jiraEmail !== undefined ? { email: jiraEmail } : {}),
      ...(jiraApiToken !== undefined ? { api_token: jiraApiToken } : {}),
      updated_at: [jiraBaseUrl, jiraEmail, jiraApiToken].some((item) => item !== undefined) ? new Date().toISOString() : loaded.secrets.jira.updated_at
    },
    qase: {
      ...loaded.secrets.qase,
      ...(qaseBaseUrl !== undefined ? { base_url: qaseBaseUrl } : {}),
      ...(qaseApiToken !== undefined ? { api_token: qaseApiToken } : {}),
      updated_at: [qaseBaseUrl, qaseApiToken].some((item) => item !== undefined) ? new Date().toISOString() : loaded.secrets.qase.updated_at
    }
  };
  fs.mkdirSync(configDir(vaultPath), { recursive: true });
  fs.writeFileSync(loaded.path, JSON.stringify(next, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(loaded.path, 0o600);
  } catch {}
  return loadQaIntegrationSecrets({ vaultPath });
};

export const resolveJiraCredentials = async ({ vaultPath = null } = {}) => {
  const loaded = await loadQaIntegrationSecrets({ vaultPath });
  return {
    base_url: loaded.secrets.jira?.base_url ?? process.env.LUCY_QA_JIRA_BASE_URL ?? process.env.JIRA_BASE_URL ?? null,
    email: loaded.secrets.jira?.email ?? process.env.LUCY_QA_JIRA_EMAIL ?? process.env.JIRA_EMAIL ?? null,
    api_token: loaded.secrets.jira?.api_token ?? process.env.LUCY_QA_JIRA_API_TOKEN ?? process.env.JIRA_API_TOKEN ?? null
  };
};

export const resolveQaseCredentials = async ({ vaultPath = null } = {}) => {
  const loaded = await loadQaIntegrationSecrets({ vaultPath });
  return {
    base_url: loaded.secrets.qase?.base_url ?? process.env.LUCY_QA_QASE_BASE_URL ?? process.env.QASE_BASE_URL ?? 'https://api.qase.io/v1',
    api_token: loaded.secrets.qase?.api_token ?? process.env.LUCY_QA_QASE_API_TOKEN ?? process.env.QASE_API_TOKEN ?? null
  };
};

export const testJiraConnection = async ({ vaultPath = null } = {}) => {
  const creds = await resolveJiraCredentials({ vaultPath });
  if (!creds.base_url || !creds.email || !creds.api_token) {
    return { implemented: true, system: 'jira', ready: false, success: false, reason: 'missing_credentials' };
  }
  const response = await fetch(`${creds.base_url.replace(/\/$/, '')}/rest/api/2/myself`, {
    headers: {
      authorization: `Basic ${Buffer.from(`${creds.email}:${creds.api_token}`).toString('base64')}`,
      accept: 'application/json'
    }
  });
  await ensureOk(response, 'Jira connection test');
  const data = await response.json();
  return {
    implemented: true,
    system: 'jira',
    ready: true,
    success: true,
    account: data?.emailAddress ?? data?.displayName ?? data?.accountId ?? 'connected'
  };
};

export const testQaseConnection = async ({ vaultPath = null } = {}) => {
  const creds = await resolveQaseCredentials({ vaultPath });
  if (!creds.api_token) {
    return { implemented: true, system: 'qase', ready: false, success: false, reason: 'missing_credentials' };
  }
  const response = await fetch(`${creds.base_url.replace(/\/$/, '')}/project?limit=1`, {
    headers: {
      token: creds.api_token,
      accept: 'application/json'
    }
  });
  await ensureOk(response, 'Qase connection test');
  const data = await response.json();
  return {
    implemented: true,
    system: 'qase',
    ready: true,
    success: true,
    projects_seen: Array.isArray(data?.result?.entities) ? data.result.entities.length : null
  };
};

export const buildQaIntegrationReadiness = async ({ onboarding = null, vaultPath = null } = {}) => {
  const secrets = await loadQaIntegrationSecrets({ vaultPath });
  const issueTracker = String(onboarding?.issue_tracker ?? '').trim().toLowerCase();
  const testManagement = String(onboarding?.qa_test_management ?? '').trim().toLowerCase();
  return {
    implemented: true,
    path: secrets.path,
    masked: secrets.masked,
    readiness: {
      jira: {
        selected: issueTracker === 'jira',
        ready: Boolean((secrets.secrets.jira?.base_url ?? process.env.LUCY_QA_JIRA_BASE_URL ?? process.env.JIRA_BASE_URL) && (secrets.secrets.jira?.email ?? process.env.LUCY_QA_JIRA_EMAIL ?? process.env.JIRA_EMAIL) && (secrets.secrets.jira?.api_token ?? process.env.LUCY_QA_JIRA_API_TOKEN ?? process.env.JIRA_API_TOKEN))
      },
      qase: {
        selected: testManagement === 'qase',
        ready: Boolean(secrets.secrets.qase?.api_token ?? process.env.LUCY_QA_QASE_API_TOKEN ?? process.env.QASE_API_TOKEN)
      }
    }
  };
};
