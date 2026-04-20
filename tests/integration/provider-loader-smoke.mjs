import { listProviders, resolveProvider } from '../../packages/harness-adapter/src/index.mjs';

const providers = listProviders();
console.log('providers', providers);
console.log('default', resolveProvider().name);
