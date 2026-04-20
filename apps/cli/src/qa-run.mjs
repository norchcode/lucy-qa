import fs from 'node:fs';
import path from 'node:path';
import { runPlaywrightSuite } from '../../../packages/qa-playwright/src/index.mjs';
import { saveQaKnowledgeFromRun } from '../../../packages/qa-knowledge/src/index.mjs';
import { buildQaIntakeContext } from './qa-intake.mjs';

const buildQaRunGoal = ({ target, baseURL }) => {
  const targetText = target ? `existing Playwright target ${target}` : 'existing Playwright target';
  return baseURL
    ? `Run E2E Playwright coverage for ${targetText} against ${baseURL}.`
    : `Run E2E Playwright coverage for ${targetText}.`;
};

export const runQaRunCommand = async ({
  target,
  baseURL = null,
  artifactsRoot = 'artifacts/playwright'
}) => {
  const runnerCommand = process.env.LUCY_QA_RUNNER_COMMAND || 'npx';
  const runnerArgs = process.env.LUCY_QA_RUNNER_ARGS_JSON
    ? JSON.parse(process.env.LUCY_QA_RUNNER_ARGS_JSON)
    : ['playwright', 'test'];
  const goal = buildQaRunGoal({ target, baseURL });
  const cwd = process.cwd();
  const vaultPath = process.env.LUCY_QA_VAULT_PATH ?? undefined;
  const { intake, docsContext } = await buildQaIntakeContext(goal, {
    cwd,
    targetUrl: baseURL,
    vaultPath
  });

  const result = await runPlaywrightSuite({
    target,
    baseURL,
    artifactsRoot,
    runnerCommand,
    runnerArgs,
    cwd,
    intake,
    docsContext
  });
  const enrichedIntake = {
    ...intake,
    execution_profile: result.execution_profile
  };
  if (result.intake_path) {
    fs.writeFileSync(result.intake_path, JSON.stringify(enrichedIntake, null, 2));
  }

  const knowledge = await saveQaKnowledgeFromRun({
    result,
    intake: enrichedIntake,
    docsContext,
    cwd,
    targetUrl: baseURL,
    vaultPath
  });
  const runKnowledgePath = path.join(result.run_dir, 'qa-knowledge.json');
  fs.writeFileSync(runKnowledgePath, JSON.stringify({
    project_key: knowledge.project_key,
    path: knowledge.path,
    markdown_path: knowledge.markdown_path,
    knowledge: knowledge.knowledge
  }, null, 2));

  return {
    ...result,
    knowledge_path: knowledge.path,
    knowledge_markdown_path: knowledge.markdown_path,
    run_knowledge_path: runKnowledgePath,
    knowledge_summary: {
      project_key: knowledge.project_key,
      stats: knowledge.knowledge.stats,
      preferred_selector_strategies: knowledge.knowledge.preferred_selector_strategies,
      known_risks: knowledge.knowledge.known_risks
    }
  };
};
