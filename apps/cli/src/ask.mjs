import { createProviderClient } from '../../../packages/harness-adapter/src/index.mjs';

export const runAskCommand = async ({ prompt, providerName = null, model = null, taskType = null }) => {
  const runtime = createProviderClient({ providerName, model, taskType });
  const response = await runtime.client.chat({
    model: runtime.model_selection.resolved,
    messages: [{ role: 'user', content: prompt }]
  });

  return {
    provider: runtime.name,
    model_selection: runtime.model_selection,
    response
  };
};
