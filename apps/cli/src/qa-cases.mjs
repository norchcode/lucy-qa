import {
  buildQaCasesPrompt
} from '../../../packages/qa-core/src/index.mjs';
import { createProviderClient } from '../../../packages/harness-adapter/src/index.mjs';
import { buildQaClarificationResult, buildQaIntakeContext } from './qa-intake.mjs';

export const runQaCasesCommand = async ({ goal, targetUrl = null, providerName = null, model = null, taskType = 'qa' }) => {
  const { intake, docsContext } = await buildQaIntakeContext(goal, { cwd: process.cwd(), targetUrl });
  if (intake.intent.needs_clarification) {
    return buildQaClarificationResult({ taskType, goal, intake });
  }
  const runtime = createProviderClient({ providerName, model, taskType });
  const prompt = buildQaCasesPrompt(goal, { analysis: intake, docsContext });
  const response = await runtime.client.chat({
    model: runtime.model_selection.resolved,
    messages: [{ role: 'user', content: prompt }]
  });

  return {
    provider: runtime.name,
    model_selection: runtime.model_selection,
    prompt,
    intake,
    docs_context: docsContext,
    response
  };
};
