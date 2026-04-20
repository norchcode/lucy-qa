import { connectProvider, discoverProviderModels, persistDefaultModel } from '../../packages/harness-adapter/src/index.mjs';

const providerName = process.argv[2] ?? 'openai-codex';
const model = process.argv[3] ?? 'gpt-5.4';

console.log('connect', await connectProvider({ providerName }));
console.log('discover', await discoverProviderModels({ providerName }));
console.log('default', await persistDefaultModel({ providerName, model }));
