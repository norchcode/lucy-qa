import { saveMemoryNote, searchMemoryNotes } from '../../../packages/memory-obsidian/src/index.mjs';

export const runMemorySaveCommand = async ({ title, content, category = 'general', vaultPath = null }) => {
  return saveMemoryNote({ title, content, category, vaultPath: vaultPath ?? undefined });
};

export const runMemorySearchCommand = async ({ query, vaultPath = null, limit = 10 }) => {
  return searchMemoryNotes({ query, vaultPath: vaultPath ?? undefined, limit });
};
