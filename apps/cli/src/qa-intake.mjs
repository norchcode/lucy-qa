import { fetchContext7Docs } from '../../../packages/context7-client/src/index.mjs';
import {
  analyzeBrowserTarget,
  analyzeCloudflareCrawlTarget,
  analyzeInteractiveBrowserTarget,
  analyzeRuntimeTarget,
  buildQaIntake,
  buildQaTypeClarificationMessage,
  enrichQaIntakeWithBrowser,
  enrichQaIntakeWithCrawl,
  enrichQaIntakeWithKnowledge,
  enrichQaIntakeWithProbe,
  enrichQaIntakeWithRuntime
} from '../../../packages/qa-core/src/index.mjs';
import { loadQaKnowledge } from '../../../packages/qa-knowledge/src/index.mjs';

export const fetchDocsHints = async (queries = [], { maxQueries = 2, limit = 3 } = {}) => {
  const docs = [];

  for (const query of queries.slice(0, maxQueries)) {
    try {
      const result = await fetchContext7Docs(query, { limit });
      docs.push(result);
    } catch (error) {
      docs.push({
        query,
        engine: 'context7-error',
        results: [],
        error: error.message
      });
    }
  }

  return docs;
};

export const buildQaClarificationResult = ({ taskType = 'qa', goal, intake }) => ({
  provider: 'lucy-qa',
  model_selection: {
    resolved: 'clarification-required',
    requested: null,
    task_type: taskType,
    alias_used: null
  },
  prompt: null,
  intake,
  docs_context: [],
  response: {
    implemented: true,
    transport: 'local-clarification',
    status: 'clarification-required',
    text: `${buildQaTypeClarificationMessage()}\n\nOriginal request:\n${goal}`
  }
});

export const buildQaIntakeContext = async (goal, { cwd = process.cwd(), targetUrl = null, maxQueries = 2, limit = 3, fetchImpl, vaultPath = null } = {}) => {
  let intake = buildQaIntake(goal, { cwd, targetUrl });
  if (intake.intent.needs_clarification) {
    return {
      intake,
      docsContext: []
    };
  }

  try {
    const loadedKnowledge = await loadQaKnowledge({ cwd, targetUrl: intake.target_url, vaultPath: vaultPath ?? undefined });
    intake = enrichQaIntakeWithKnowledge(intake, {
      project_key: loadedKnowledge.project_key,
      ...loadedKnowledge.knowledge
    });
  } catch (error) {
    intake = {
      ...intake,
      knowledge: {
        ...intake.knowledge,
        status: 'unknown',
        summary: `Reusable QA knowledge load failed: ${error.message}`
      }
    };
  }

  if (intake.target_url) {
    try {
      const runtime = await analyzeRuntimeTarget(intake.target_url, { fetchImpl });
      intake = enrichQaIntakeWithRuntime(intake, runtime);
    } catch (error) {
      intake = {
        ...intake,
        runtime: {
          ...intake.runtime,
          status: 'unknown',
          error: error.message,
          evidence: [...(intake.runtime.evidence ?? []), `Runtime inspection failed: ${error.message}`]
        }
      };
    }

    try {
      const crawl = await analyzeCloudflareCrawlTarget(intake.target_url, { fetchImpl });
      intake = enrichQaIntakeWithCrawl(intake, crawl);
    } catch (error) {
      intake = {
        ...intake,
        crawl: {
          ...intake.crawl,
          status: 'unknown',
          error: error.message,
          evidence: [...(intake.crawl.evidence ?? []), `Cloudflare crawl inspection failed: ${error.message}`]
        }
      };
    }

    try {
      const browser = await analyzeBrowserTarget(intake.target_url);
      intake = enrichQaIntakeWithBrowser(intake, browser);
    } catch (error) {
      intake = {
        ...intake,
        browser: {
          ...intake.browser,
          status: 'unknown',
          error: error.message,
          evidence: [...(intake.browser.evidence ?? []), `Browser inspection failed: ${error.message}`]
        }
      };
    }

    try {
      const probe = await analyzeInteractiveBrowserTarget(intake.target_url);
      intake = enrichQaIntakeWithProbe(intake, probe);
    } catch (error) {
      intake = {
        ...intake,
        probe: {
          ...intake.probe,
          status: 'unknown',
          error: error.message,
          evidence: [...(intake.probe.evidence ?? []), `Interactive probe failed: ${error.message}`]
        }
      };
    }
  }

  const docsContext = await fetchDocsHints(intake.docs_queries, { maxQueries, limit });

  return {
    intake,
    docsContext
  };
};
