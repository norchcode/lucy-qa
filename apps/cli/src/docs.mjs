import { fetchContext7Docs } from '../../../packages/context7-client/src/index.mjs';

export const runDocsCommand = async ({ query, limit = 5 }) => {
  return fetchContext7Docs(query, { limit });
};
