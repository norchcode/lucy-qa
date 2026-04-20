import {
  linkQaDefectSignature,
  listQaDefectSignatures,
  updateQaDefectSignature
} from '../../../packages/qa-knowledge/src/index.mjs';
import { resolveQaOnboardingDefaults } from './qa-onboarding.mjs';
import { runQaBugCommand } from './qa-bug.mjs';
import { createRemoteTrackerIssue } from './qa-remote-trackers.mjs';

export const runQaDefectsListCommand = async ({ cwd = process.cwd(), targetUrl = null, vaultPath = null }) => {
  return listQaDefectSignatures({ cwd, targetUrl, vaultPath: vaultPath ?? undefined });
};

export const runQaDefectsLinkCommand = async ({
  signature,
  bugId,
  trackerSystem = 'generic',
  trackerUrl = null,
  trackerTitle = null,
  trackerStatus = 'open',
  defectStatus = 'open',
  cwd = process.cwd(),
  targetUrl = null,
  vaultPath = null
}) => {
  const onboarding = await resolveQaOnboardingDefaults({ vaultPath });
  return linkQaDefectSignature({
    signature,
    bugId,
    trackerSystem: trackerSystem === 'generic' && onboarding.defaults.issue_tracker ? onboarding.defaults.issue_tracker : trackerSystem,
    trackerUrl,
    trackerTitle: trackerTitle ?? (onboarding.defaults.issue_project ? `${onboarding.defaults.issue_project}: ${bugId}` : null),
    trackerStatus,
    defectStatus,
    cwd,
    targetUrl,
    vaultPath: vaultPath ?? undefined
  });
};

export const runQaDefectsUpdateCommand = async ({
  signature,
  bugId = null,
  trackerSystem = undefined,
  trackerUrl = undefined,
  trackerTitle = undefined,
  trackerStatus = undefined,
  defectStatus = undefined,
  cwd = process.cwd(),
  targetUrl = null,
  vaultPath = null
}) => {
  const onboarding = await resolveQaOnboardingDefaults({ vaultPath });
  return updateQaDefectSignature({
    signature,
    bugId,
    trackerSystem: trackerSystem === undefined ? onboarding.defaults.issue_tracker ?? undefined : trackerSystem,
    trackerUrl,
    trackerTitle,
    trackerStatus,
    defectStatus,
    cwd,
    targetUrl,
    vaultPath: vaultPath ?? undefined
  });
};

export const runQaDefectsFileRemoteCommand = async ({
  signature,
  trackerSystem = null,
  issueProject = null,
  issueType = 'Bug',
  title = null,
  cwd = process.cwd(),
  targetUrl = null,
  vaultPath = null
}) => {
  const onboarding = await resolveQaOnboardingDefaults({ vaultPath });
  const defects = await listQaDefectSignatures({ cwd, targetUrl, vaultPath: vaultPath ?? undefined });
  const defect = defects.defect_signatures.find((item) => item.signature === signature);
  if (!defect) {
    throw new Error(`Defect signature not found: ${signature}`);
  }

  const resolvedTrackerSystem = trackerSystem ?? onboarding.defaults.issue_tracker;
  if (!resolvedTrackerSystem) {
    throw new Error('No remote issue tracker configured. Save one with qa onboarding --issue-tracker <name> or pass --tracker <name>.');
  }
  const resolvedIssueProject = issueProject ?? onboarding.defaults.issue_project ?? null;
  const bugDraft = await runQaBugCommand({
    finding: title ?? defect.summary,
    context: {
      defect_signature: defect.signature,
      defect_disposition: defect.linked_bug_id ? 'append-to-existing-bug' : 'new-bug-needed',
      linked_bug_id: defect.linked_bug_id,
      tracker_system: resolvedTrackerSystem,
      tracker_status: defect.tracker_status,
      tracker_url: defect.tracker_url,
      qa_test_management: onboarding.defaults.qa_test_management ?? null,
      qa_project: onboarding.defaults.qa_project ?? null,
      issue_project: resolvedIssueProject,
      preferred_bug_workflow: onboarding.defaults.preferred_bug_workflow ?? null,
      known_risks: [],
      case_titles: defect.related_cases ?? []
    }
  });

  const remote = await createRemoteTrackerIssue({
    trackerSystem: resolvedTrackerSystem,
    projectKey: resolvedIssueProject,
    summary: title ?? bugDraft.title,
    description: bugDraft.report,
    issueType,
    labels: ['lucy-qa', 'defect-signature'],
    vaultPath
  });

  const linkage = await runQaDefectsLinkCommand({
    signature,
    bugId: remote.issue_id,
    trackerSystem: remote.tracker_system,
    trackerUrl: remote.issue_url,
    trackerTitle: remote.issue_title,
    trackerStatus: remote.issue_status,
    defectStatus: 'open',
    cwd,
    targetUrl,
    vaultPath
  });

  return {
    implemented: true,
    action: 'file-remote',
    tracker_system: remote.tracker_system,
    issue_project: resolvedIssueProject,
    remote_issue: remote,
    linkage: linkage.defect_signature,
    bug_report: bugDraft.report,
    project_key: defects.project_key
  };
};
