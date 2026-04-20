import {
  saveSessionSnapshot,
  saveOpenTasks,
  saveLastRun,
  loadResumeContext,
  saveLastBugs,
  detectStartupState,
  resumeSession,
  startNewSession,
  appendSessionJournalEntry,
  loadCurrentSessionJournal
} from '../../../packages/memory-obsidian/src/state.mjs';

export const runStateSaveSessionCommand = async ({ summary, currentProject = null, recentCommands = [], vaultPath = null }) => {
  return saveSessionSnapshot({ summary, currentProject, recentCommands, vaultPath: vaultPath ?? undefined });
};

export const runStateOpenTasksCommand = async ({ tasks = [], vaultPath = null }) => {
  return saveOpenTasks({ tasks, vaultPath: vaultPath ?? undefined });
};

export const runStateShowCommand = async ({ vaultPath = null }) => {
  return loadResumeContext({ vaultPath: vaultPath ?? undefined });
};

export const runStateStartupCommand = async ({ vaultPath = null }) => {
  return detectStartupState({ vaultPath: vaultPath ?? undefined });
};

export const runStateResumeCommand = async ({ vaultPath = null }) => {
  return resumeSession({ vaultPath: vaultPath ?? undefined });
};

export const runStateStartNewSessionCommand = async ({ projectName = null, vaultPath = null }) => {
  return startNewSession({ projectName, vaultPath: vaultPath ?? undefined });
};

export const runStateJournalAppendCommand = async ({ eventType = 'manual-note', summary, currentProject = null, commands = [], openTasks = [], decisions = [], unresolved = [], artifacts = [], vaultPath = null }) => {
  return appendSessionJournalEntry({ eventType, summary, currentProject, commands, openTasks, decisions, unresolved, artifacts, vaultPath: vaultPath ?? undefined });
};

export const runStateJournalCommand = async ({ vaultPath = null }) => {
  return loadCurrentSessionJournal({ vaultPath: vaultPath ?? undefined });
};

export const runStateSaveLastRun = async ({ runId, runDir, status, target, reportPath = null, vaultPath = null }) => {
  return saveLastRun({ runId, runDir, status, target, reportPath, vaultPath: vaultPath ?? undefined });
};

export const runStateSaveLastBugs = async ({ bugs = [], sourceRunDir = null, vaultPath = null }) => {
  return saveLastBugs({ bugs, sourceRunDir, vaultPath: vaultPath ?? undefined });
};
