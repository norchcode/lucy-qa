import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_VAULT_PATH = process.env.LUCY_QA_VAULT_PATH
  ? path.resolve(process.env.LUCY_QA_VAULT_PATH)
  : path.resolve(process.cwd(), 'vault');

const stateDir = (vaultPath = DEFAULT_VAULT_PATH) => path.join(path.resolve(vaultPath), 'state');
const sessionsDir = (vaultPath = DEFAULT_VAULT_PATH) => path.join(path.resolve(vaultPath), 'sessions');
const journalsDir = (vaultPath = DEFAULT_VAULT_PATH) => path.join(path.resolve(vaultPath), 'journals');
const journalsArchiveDir = (vaultPath = DEFAULT_VAULT_PATH) => path.join(journalsDir(vaultPath), 'archive');

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
};

const ensureStateDir = (vaultPath) => ensureDir(stateDir(vaultPath));
const ensureSessionsDir = (vaultPath) => ensureDir(sessionsDir(vaultPath));
const ensureJournalsDir = (vaultPath) => ensureDir(journalsDir(vaultPath));
const ensureJournalsArchiveDir = (vaultPath) => ensureDir(journalsArchiveDir(vaultPath));

const writeJson = (filePath, payload) => fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
const readJson = (filePath, fallback) => fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback;
const slugify = (value = '') => String(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'session';

const emptySession = ({ currentProject = null, summary = null } = {}) => ({
  summary,
  current_project: currentProject,
  recent_commands: [],
  updated_at: null,
  resumed_at: null
});

const emptyOpenTasks = () => ({ tasks: [], updated_at: null });
const emptyLastRun = () => ({
  run_id: null,
  run_dir: null,
  status: null,
  target: null,
  report_path: null,
  updated_at: null
});
const emptyLastBugs = () => ({ source_run_dir: null, bugs: [], updated_at: null });
const emptyJournal = ({ currentProject = null } = {}) => ({
  current_project: currentProject,
  entry_count: 0,
  updated_at: null,
  entries: []
});

const journalPaths = (vaultPath) => {
  const dir = ensureJournalsDir(vaultPath);
  return {
    dir,
    json: path.join(dir, 'current-session.json'),
    markdown: path.join(dir, 'current-session.md')
  };
};

const buildCurrentSessionMarkdown = ({ summary, current_project, recent_commands, updated_at, resumed_at = null }) => [
  '# Current Session',
  '',
  `- updated_at: ${updated_at ?? 'not set'}`,
  `- resumed_at: ${resumed_at ?? 'not set'}`,
  '',
  '## Summary',
  summary ?? 'No summary recorded.',
  '',
  '## Current Project',
  current_project ?? 'not set',
  '',
  '## Recent Commands',
  recent_commands.length ? recent_commands.map((item) => `- ${item}`).join('\n') : '- none'
].join('\n');

const renderJournalMarkdown = (journal) => {
  const sections = [
    '# Session Journal',
    '',
    `- current_project: ${journal.current_project ?? 'not set'}`,
    `- entry_count: ${journal.entry_count}`,
    `- updated_at: ${journal.updated_at ?? 'not set'}`,
    ''
  ];

  if (!journal.entries.length) {
    sections.push('No journal entries recorded yet.');
    return sections.join('\n');
  }

  for (const [index, entry] of journal.entries.entries()) {
    sections.push(`## Entry ${index + 1}`);
    sections.push(`- timestamp: ${entry.timestamp}`);
    sections.push(`- event_type: ${entry.event_type}`);
    sections.push(`- project: ${entry.current_project ?? journal.current_project ?? 'not set'}`);
    sections.push('');
    sections.push('### Summary');
    sections.push(entry.summary || 'No summary recorded.');
    sections.push('');
    sections.push('### Commands');
    sections.push(entry.commands.length ? entry.commands.map((item) => `- ${item}`).join('\n') : '- none');
    sections.push('');
    sections.push('### Open Tasks');
    sections.push(entry.open_tasks.length ? entry.open_tasks.map((item) => `- ${item}`).join('\n') : '- none');
    sections.push('');
    sections.push('### Decisions');
    sections.push(entry.decisions.length ? entry.decisions.map((item) => `- ${item}`).join('\n') : '- none');
    sections.push('');
    sections.push('### Unresolved');
    sections.push(entry.unresolved.length ? entry.unresolved.map((item) => `- ${item}`).join('\n') : '- none');
    sections.push('');
    sections.push('### Artifacts');
    sections.push(entry.artifacts.length ? entry.artifacts.map((item) => `- ${item}`).join('\n') : '- none');
    sections.push('');
  }

  return sections.join('\n').trimEnd();
};

const writeJournal = ({ vaultPath, journal }) => {
  const paths = journalPaths(vaultPath);
  writeJson(paths.json, journal);
  fs.writeFileSync(paths.markdown, renderJournalMarkdown(journal));
  return paths;
};

const archiveJournalSnapshot = ({ vaultPath, journal }) => {
  if (!journal.entries.length) {
    return null;
  }
  const dir = ensureJournalsArchiveDir(vaultPath);
  const timestamp = journal.updated_at ?? new Date().toISOString();
  const baseName = `${timestamp.replace(/[:.]/g, '-')}-${slugify(journal.current_project ?? 'journal')}`;
  const markdownPath = path.join(dir, `${baseName}.md`);
  const jsonPath = path.join(dir, `${baseName}.json`);
  fs.writeFileSync(markdownPath, renderJournalMarkdown(journal));
  writeJson(jsonPath, journal);
  return { markdown_path: markdownPath, json_path: jsonPath };
};

const loadRawJournal = (vaultPath = DEFAULT_VAULT_PATH) => {
  const paths = journalPaths(vaultPath);
  return {
    journal: readJson(paths.json, emptyJournal()),
    paths
  };
};

const deriveNextSteps = ({ openTasks, lastRun, lastBugs }) => {
  if (openTasks.tasks.length) {
    return openTasks.tasks;
  }

  const nextSteps = [];
  if (lastRun.run_id && lastRun.status === 'failed') {
    nextSteps.push(`Investigate failed QA run ${lastRun.run_id}.`);
    nextSteps.push(`Review report at ${lastRun.run_dir}.`);
  } else if (lastRun.run_id) {
    nextSteps.push(`Review or archive the latest QA run ${lastRun.run_id}.`);
  }
  if (lastBugs.bugs.length) {
    nextSteps.push(`Review and file ${lastBugs.bugs.length} drafted bug report(s).`);
  }
  return nextSteps;
};

const archiveSessionSnapshot = ({ vaultPath, payload, openTasks = [], lastRun = null, lastBugs = [] }) => {
  const dir = ensureSessionsDir(vaultPath);
  const timestamp = payload.updated_at ?? new Date().toISOString();
  const baseName = `${timestamp.replace(/[:.]/g, '-')}-${slugify(payload.current_project ?? payload.summary ?? 'session')}`;
  const markdownPath = path.join(dir, `${baseName}.md`);
  const jsonPath = path.join(dir, `${baseName}.json`);
  const markdown = [
    '# Session Summary',
    '',
    `- updated_at: ${timestamp}`,
    `- current_project: ${payload.current_project ?? 'not set'}`,
    '',
    '## Summary',
    payload.summary ?? 'No summary recorded.',
    '',
    '## Recent Commands',
    payload.recent_commands.length ? payload.recent_commands.map((item) => `- ${item}`).join('\n') : '- none',
    '',
    '## Open Tasks',
    openTasks.length ? openTasks.map((item) => `- ${item}`).join('\n') : '- none',
    '',
    '## Last Run',
    lastRun?.run_id ? `- ${lastRun.run_id} (${lastRun.status}) on ${lastRun.target}` : '- none',
    '',
    '## Recent Bug Drafts',
    lastBugs.length ? lastBugs.map((item) => `- ${item.title ?? item.case_title ?? 'untitled bug draft'}`).join('\n') : '- none'
  ].join('\n');

  fs.writeFileSync(markdownPath, markdown);
  writeJson(jsonPath, {
    session: payload,
    open_tasks: openTasks,
    last_run: lastRun,
    last_bugs: lastBugs
  });

  return { markdown_path: markdownPath, json_path: jsonPath };
};

export const appendSessionJournalEntry = async ({
  eventType = 'session-update',
  summary,
  currentProject = null,
  commands = [],
  openTasks = [],
  decisions = [],
  unresolved = [],
  artifacts = [],
  vaultPath = DEFAULT_VAULT_PATH
} = {}) => {
  if (!summary?.trim()) {
    throw new Error('summary is required');
  }

  const { journal } = loadRawJournal(vaultPath);
  const entry = {
    timestamp: new Date().toISOString(),
    event_type: eventType,
    summary: summary.trim(),
    current_project: currentProject,
    commands: commands.map((item) => String(item).trim()).filter(Boolean),
    open_tasks: openTasks.map((item) => String(item).trim()).filter(Boolean),
    decisions: decisions.map((item) => String(item).trim()).filter(Boolean),
    unresolved: unresolved.map((item) => String(item).trim()).filter(Boolean),
    artifacts: artifacts.map((item) => String(item).trim()).filter(Boolean)
  };

  const nextJournal = {
    current_project: currentProject ?? journal.current_project ?? null,
    entry_count: journal.entry_count + 1,
    updated_at: entry.timestamp,
    entries: [...journal.entries, entry].slice(-50)
  };
  nextJournal.entry_count = nextJournal.entries.length;

  const paths = writeJournal({ vaultPath, journal: nextJournal });
  return {
    implemented: true,
    path: paths.json,
    markdown_path: paths.markdown,
    vault_path: path.resolve(vaultPath),
    ...nextJournal,
    latest_entry: entry
  };
};

export const loadCurrentSessionJournal = async ({ vaultPath = DEFAULT_VAULT_PATH } = {}) => {
  const { journal, paths } = loadRawJournal(vaultPath);
  const decisions = [...new Set(journal.entries.flatMap((entry) => entry.decisions ?? []))];
  const unresolved = [...new Set(journal.entries.flatMap((entry) => entry.unresolved ?? []))];
  const artifacts = [...new Set(journal.entries.flatMap((entry) => entry.artifacts ?? []))];
  const markdown = fs.existsSync(paths.markdown) ? fs.readFileSync(paths.markdown, 'utf8') : renderJournalMarkdown(journal);

  return {
    implemented: true,
    vault_path: path.resolve(vaultPath),
    path: paths.json,
    markdown_path: paths.markdown,
    markdown,
    current_project: journal.current_project,
    entry_count: journal.entry_count,
    updated_at: journal.updated_at,
    decisions,
    unresolved,
    artifacts,
    entries: journal.entries
  };
};

export const saveSessionSnapshot = async ({
  summary,
  currentProject = null,
  recentCommands = [],
  vaultPath = DEFAULT_VAULT_PATH
} = {}) => {
  if (!summary?.trim()) {
    throw new Error('summary is required');
  }

  const dir = ensureStateDir(vaultPath);
  const existingOpenTasks = readJson(path.join(dir, 'open-tasks.json'), emptyOpenTasks());
  const existingLastRun = readJson(path.join(dir, 'last-run.json'), emptyLastRun());
  const existingLastBugs = readJson(path.join(dir, 'last-bugs.json'), emptyLastBugs());
  const payload = {
    summary: summary.trim(),
    current_project: currentProject,
    recent_commands: recentCommands,
    updated_at: new Date().toISOString(),
    resumed_at: null
  };

  writeJson(path.join(dir, 'session.json'), payload);
  fs.writeFileSync(path.join(dir, 'current-session.md'), buildCurrentSessionMarkdown(payload));
  const history = archiveSessionSnapshot({
    vaultPath,
    payload,
    openTasks: existingOpenTasks.tasks,
    lastRun: existingLastRun,
    lastBugs: existingLastBugs.bugs
  });
  const journal = await appendSessionJournalEntry({
    eventType: 'session-summary',
    summary: payload.summary,
    currentProject,
    commands: recentCommands,
    openTasks: existingOpenTasks.tasks,
    decisions: [],
    unresolved: existingOpenTasks.tasks,
    artifacts: [history.markdown_path].filter(Boolean),
    vaultPath
  });

  return {
    implemented: true,
    path: path.join(dir, 'session.json'),
    history_path: history.markdown_path,
    journal_path: journal.markdown_path,
    vault_path: path.resolve(vaultPath),
    ...payload
  };
};

export const saveOpenTasks = async ({ tasks = [], vaultPath = DEFAULT_VAULT_PATH } = {}) => {
  const dir = ensureStateDir(vaultPath);
  const normalizedTasks = tasks.map((item) => String(item).trim()).filter(Boolean);
  const payload = {
    tasks: [...new Set(normalizedTasks)],
    updated_at: new Date().toISOString()
  };
  writeJson(path.join(dir, 'open-tasks.json'), payload);
  return { implemented: true, path: path.join(dir, 'open-tasks.json'), ...payload };
};

export const saveLastRun = async ({
  runId,
  runDir,
  status,
  target,
  reportPath = null,
  vaultPath = DEFAULT_VAULT_PATH
} = {}) => {
  const dir = ensureStateDir(vaultPath);
  const payload = {
    run_id: runId,
    run_dir: runDir,
    status,
    target,
    report_path: reportPath,
    updated_at: new Date().toISOString()
  };
  writeJson(path.join(dir, 'last-run.json'), payload);
  return { implemented: true, path: path.join(dir, 'last-run.json'), ...payload };
};

export const saveLastBugs = async ({ bugs = [], sourceRunDir = null, vaultPath = DEFAULT_VAULT_PATH } = {}) => {
  const dir = ensureStateDir(vaultPath);
  const payload = {
    source_run_dir: sourceRunDir,
    bugs,
    updated_at: new Date().toISOString()
  };
  writeJson(path.join(dir, 'last-bugs.json'), payload);
  return { implemented: true, path: path.join(dir, 'last-bugs.json'), ...payload };
};

export const loadResumeContext = async ({ vaultPath = DEFAULT_VAULT_PATH } = {}) => {
  const dir = ensureStateDir(vaultPath);
  const session = readJson(path.join(dir, 'session.json'), emptySession());
  const openTasks = readJson(path.join(dir, 'open-tasks.json'), emptyOpenTasks());
  const lastRun = readJson(path.join(dir, 'last-run.json'), emptyLastRun());
  const lastBugs = readJson(path.join(dir, 'last-bugs.json'), emptyLastBugs());
  const journal = await loadCurrentSessionJournal({ vaultPath });
  const nextSteps = deriveNextSteps({ openTasks, lastRun, lastBugs });
  const hasResumableState = Boolean(
    session.summary
    || session.current_project
    || openTasks.tasks.length
    || lastRun.run_id
    || lastBugs.bugs.length
    || journal.entry_count
  );

  const resumeText = [
    session.summary ? `Session summary: ${session.summary}` : null,
    session.current_project ? `Current project: ${session.current_project}` : null,
    openTasks.tasks.length ? `Open tasks: ${openTasks.tasks.join('; ')}` : null,
    lastRun.run_id ? `Last run: ${lastRun.run_id} (${lastRun.status}) on ${lastRun.target}` : null,
    lastBugs.bugs.length ? `Recent bug drafts: ${lastBugs.bugs.length}` : null,
    journal.entry_count ? `Journal entries: ${journal.entry_count}` : null,
    nextSteps.length ? `Suggested next steps: ${nextSteps.join(' | ')}` : null
  ].filter(Boolean).join('\n');

  return {
    implemented: true,
    vault_path: path.resolve(vaultPath),
    state_dir: dir,
    session,
    open_tasks: openTasks,
    last_run: lastRun,
    last_bugs: lastBugs,
    journal,
    next_steps: nextSteps,
    has_resumable_state: hasResumableState,
    resume_text: resumeText
  };
};

export const detectStartupState = async ({ vaultPath = DEFAULT_VAULT_PATH } = {}) => {
  const context = await loadResumeContext({ vaultPath });
  return {
    ...context,
    startup_mode: context.has_resumable_state ? 'resume-offer' : 'fresh-start'
  };
};

export const resumeSession = async ({ vaultPath = DEFAULT_VAULT_PATH } = {}) => {
  const context = await loadResumeContext({ vaultPath });
  if (!context.has_resumable_state) {
    return {
      ...context,
      resumed: false,
      message: 'No resumable Lucy QA session was found.'
    };
  }

  const resumedSession = {
    ...context.session,
    resumed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  writeJson(path.join(context.state_dir, 'session.json'), resumedSession);
  fs.writeFileSync(path.join(context.state_dir, 'current-session.md'), buildCurrentSessionMarkdown(resumedSession));
  await appendSessionJournalEntry({
    eventType: 'resume',
    summary: 'Resumed the previous Lucy QA session context.',
    currentProject: resumedSession.current_project,
    commands: ['state resume'],
    openTasks: context.open_tasks.tasks,
    decisions: [],
    unresolved: context.next_steps,
    artifacts: [],
    vaultPath
  });

  return {
    ...(await loadResumeContext({ vaultPath })),
    session: resumedSession,
    resumed: true,
    message: 'Lucy QA resumed the previous session context.'
  };
};

export const startNewSession = async ({ projectName = null, vaultPath = DEFAULT_VAULT_PATH } = {}) => {
  const previous = await loadResumeContext({ vaultPath });
  const archivedPreviousSession = previous.has_resumableState || previous.has_resumable_state;
  const archivedJournal = archiveJournalSnapshot({ vaultPath, journal: previous.journal ?? emptyJournal() });

  const dir = ensureStateDir(vaultPath);
  writeJson(path.join(dir, 'open-tasks.json'), { tasks: [], updated_at: new Date().toISOString() });
  writeJson(path.join(dir, 'last-run.json'), emptyLastRun());
  writeJson(path.join(dir, 'last-bugs.json'), emptyLastBugs());
  writeJournal({ vaultPath, journal: emptyJournal({ currentProject: projectName }) });

  const session = await saveSessionSnapshot({
    summary: 'Started a new Lucy QA session.',
    currentProject: projectName,
    recentCommands: ['state new-session'],
    vaultPath
  });

  const context = await loadResumeContext({ vaultPath });
  return {
    ...context,
    started_new_session: true,
    archived_previous_session: archivedPreviousSession,
    path: session.path,
    history_path: session.history_path,
    archived_journal_path: archivedJournal?.markdown_path ?? null,
    message: archivedPreviousSession
      ? 'Started a new Lucy QA session and archived the previous resumable context.'
      : 'Started a new Lucy QA session.'
  };
};
