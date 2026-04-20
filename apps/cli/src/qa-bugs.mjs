import { generateQaRunReport } from '../../../packages/qa-playwright/src/index.mjs';
import { runQaBugCommand } from './qa-bug.mjs';
import { resolveQaOnboardingDefaults } from './qa-onboarding.mjs';

export const runQaBugsFromRunCommand = async ({ runDir }) => {
  const report = generateQaRunReport({ runDir });
  const onboarding = await resolveQaOnboardingDefaults({ vaultPath: process.env.LUCY_QA_VAULT_PATH ?? null });
  const defectCandidates = report.defect_clusters?.defect_candidates ?? [];

  const bugs = await Promise.all(
    defectCandidates.map(async (candidate) => {
      const cases = candidate.cases ?? [];
      const primaryCase = cases[0] ?? null;
      const finding = candidate.summary || `${candidate.feature_area} ${candidate.symptom_key}`;
      const bug = await runQaBugCommand({
        finding,
        context: {
          run_dir: report.run_dir,
          base_url: report.intake?.target_url ?? report.intake?.runtime?.target_url ?? candidate.route ?? null,
          execution_profile: report.execution_profile,
          selector_strategy: report.report_insights?.selector_strategy,
          known_risks: report.report_insights?.known_risks ?? [],
          crawl_routes: report.report_insights?.crawl_routes ?? [],
          proven_interactions: report.report_insights?.proven_interactions ?? [],
          knowledge_project_key: report.report_insights?.knowledge_project_key ?? null,
          docs_queries: report.docs_context?.map((entry) => entry.query).filter(Boolean) ?? [],
          case_title: primaryCase?.title ?? null,
          case_titles: candidate.related_case_titles ?? cases.map((item) => item.title),
          error_message: primaryCase?.error_message ?? candidate.error_samples?.[0] ?? null,
          defect_signature: candidate.signature,
          defect_disposition: candidate.disposition,
          linked_bug_id: candidate.linked_bug_id,
          tracker_system: candidate.tracker_system ?? onboarding.defaults.issue_tracker ?? null,
          tracker_status: candidate.tracker_status ?? null,
          tracker_url: candidate.tracker_url ?? null,
          qa_test_management: onboarding.defaults.qa_test_management ?? null,
          qa_project: onboarding.defaults.qa_project ?? null,
          issue_project: onboarding.defaults.issue_project ?? null,
          preferred_bug_workflow: onboarding.defaults.preferred_bug_workflow ?? null,
          failure_intelligence: report.failure_intelligence,
          annotated_screenshots: (report.annotated_screenshots ?? []).filter((entry) => (candidate.related_case_titles ?? []).includes(entry.case_title)),
          artifact_paths: [
            ...(report.artifacts.videos ?? []),
            ...(report.artifacts.traces ?? []),
            ...(report.artifacts.screenshots ?? [])
          ].slice(0, 12)
        }
      });
      return {
        defect_signature: candidate.signature,
        disposition: candidate.disposition,
        linked_bug_id: candidate.linked_bug_id ?? null,
        case_titles: candidate.related_case_titles ?? [],
        project: candidate.projects?.join(', ') || primaryCase?.project || 'default',
        status: candidate.statuses?.join(', ') || primaryCase?.status || 'failed',
        report: bug.report,
        title: bug.title,
        context: bug.context
      };
    })
  );

  return {
    implemented: true,
    run_dir: report.run_dir,
    total_failed_cases: report.summary.cases.filter((item) => item.status !== 'passed' && item.status !== 'skipped').length,
    total_defect_candidates: bugs.length,
    execution_profile: report.execution_profile,
    report_insights: report.report_insights,
    defect_clusters: report.defect_clusters,
    bugs
  };
};
