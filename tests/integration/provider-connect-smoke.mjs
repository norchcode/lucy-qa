import { connectProvider, discoverProviderModels, persistDefaultModel } from '../../packages/harness-adapter/src/index.mjs';


const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  if (url.includes('models')) {
    return {
      ok: true,
      json: async () => ({ data: [{ id: 'mock-model-1' }] })
    };
  }
  return originalFetch(url, options);
};

const providerName = process.argv[2] ?? 'minimax';
const model = process.argv[3] ?? 'gpt-5.4';

console.log('connect', await connectProvider({ providerName }));
console.log('discover', await discoverProviderModels({ providerName }));
console.log('default', await persistDefaultModel({ providerName, model }));
