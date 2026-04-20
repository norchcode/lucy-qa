import fs from 'node:fs';
import path from 'node:path';

const resolveVaultPath = (vaultPath = null) => path.resolve(vaultPath ?? process.env.LUCY_QA_VAULT_PATH ?? path.resolve(process.cwd(), 'vault'));
const learningDir = (vaultPath = null) => path.join(resolveVaultPath(vaultPath), 'qa-learning');
const learningPath = (vaultPath = null) => path.join(learningDir(vaultPath), 'self-improvement.json');
const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
};
const slugify = (value = '') => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';

const emptyLearningState = () => ({
  event_count: 0,
  evaluation_interval: 5,
  evaluations_count: 0,
  last_evaluation_at: null,
  nudges_issued: 0,
  memory_notes: [],
  skills: [],
  recent_evaluations: []
});

export const loadQaLearningState = async ({ vaultPath = null } = {}) => {
  const filePath = learningPath(vaultPath);
  if (!fs.existsSync(filePath)) {
    return {
      implemented: true,
      path: filePath,
      state: emptyLearningState()
    };
  }
  return {
    implemented: true,
    path: filePath,
    state: {
      ...emptyLearningState(),
      ...JSON.parse(fs.readFileSync(filePath, 'utf8'))
    }
  };
};

const saveQaLearningState = ({ state, vaultPath = null }) => {
  const filePath = learningPath(vaultPath);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
  return filePath;
};

const upsertMemoryNote = (memoryNotes = [], { title, content, sourceCommand = null } = {}) => {
  const key = slugify(title || content);
  const now = new Date().toISOString();
  const existing = memoryNotes.find((item) => item.key === key);
  if (existing) {
    existing.occurrence_count += 1;
    existing.last_seen_at = now;
    existing.content = content ?? existing.content;
    existing.source_command = sourceCommand ?? existing.source_command;
    return { memoryNotes, added: false, key };
  }
  return {
    memoryNotes: [...memoryNotes, {
      key,
      title: title ?? content,
      content,
      source_command: sourceCommand,
      occurrence_count: 1,
      created_at: now,
      last_seen_at: now
    }],
    added: true,
    key
  };
};

const upsertSkill = (skills = [], { name, workflow, trigger, sourceCommand = null } = {}) => {
  const key = slugify(name || workflow);
  const now = new Date().toISOString();
  const existing = skills.find((item) => item.key === key);
  if (existing) {
    existing.occurrence_count += 1;
    existing.last_used_at = now;
    existing.workflow = workflow ?? existing.workflow;
    existing.trigger = trigger ?? existing.trigger;
    existing.source_command = sourceCommand ?? existing.source_command;
    return { skills, refined: true, key };
  }
  return {
    skills: [...skills, {
      key,
      name,
      workflow,
      trigger,
      source_command: sourceCommand,
      occurrence_count: 1,
      created_at: now,
      last_used_at: now
    }],
    refined: false,
    key
  };
};

const deriveSkillSignals = ({ recentCommands = [] } = {}) => {
  const joined = recentCommands.join(' | ');
  const items = [];
  if (/qa report publish|agent publish latest run/i.test(joined)) {
    items.push({ name: 'publish-run-to-test-management', workflow: 'Publish the latest QA run to configured test management.', trigger: 'When a run is ready to sync outward.' });
  }
  if (/qa defects file-remote/i.test(joined)) {
    items.push({ name: 'file-remote-defect', workflow: 'Create a remote tracker issue from a grouped defect signature and link it back into Lucy QA knowledge.', trigger: 'When a grouped defect needs a real tracker issue.' });
  }
  if (/qa bugs --from-run|agent draft bugs from latest run/i.test(joined)) {
    items.push({ name: 'group-run-failures-into-bugs', workflow: 'Cluster failed cases from a run and draft grouped bug reports.', trigger: 'When a run has failures and bug drafts are needed.' });
  }
  if (/qa agent review latest run|agent review latest run/i.test(joined)) {
    items.push({ name: 'review-latest-run', workflow: 'Use saved state to review the latest QA run without manually passing a run directory.', trigger: 'When the user asks to review or summarize the latest run.' });
  }
  if (/provider setup/i.test(joined)) {
    items.push({ name: 'configure-openai-compatible-provider', workflow: 'Configure a provider preset or custom OpenAI-compatible backend through Lucy QA.', trigger: 'When adding a new provider or gateway.' });
  }
  return items;
};

const deriveMemorySignals = ({ summary = '', decisions = [], recentCommands = [] } = {}) => {
  const items = [];
  for (const decision of decisions ?? []) {
    items.push({ title: `decision-${slugify(decision).slice(0, 40)}`, content: decision, sourceCommand: recentCommands[0] ?? null });
  }
  const joined = recentCommands.join(' | ');
  if (/provider setup/i.test(joined)) {
    items.push({ title: 'provider-setup-workflow', content: summary, sourceCommand: recentCommands[0] ?? null });
  }
  if (/qa onboarding/i.test(joined)) {
    items.push({ title: 'integration-onboarding-context', content: summary, sourceCommand: recentCommands[0] ?? null });
  }
  if (/qa agent/i.test(joined) || /^agent /i.test(joined)) {
    items.push({ title: 'agent-routing-behavior', content: summary, sourceCommand: recentCommands[0] ?? null });
  }
  return items;
};

export const runQaSelfImprovementPass = async ({
  summary,
  recentCommands = [],
  decisions = [],
  vaultPath = null
} = {}) => {
  const loaded = await loadQaLearningState({ vaultPath });
  const state = { ...loaded.state, event_count: loaded.state.event_count + 1 };
  const addedMemory = [];
  const refinedSkills = [];

  for (const memory of deriveMemorySignals({ summary, decisions, recentCommands })) {
    const result = upsertMemoryNote(state.memory_notes, memory);
    state.memory_notes = result.memoryNotes;
    if (result.added) addedMemory.push(result.key);
  }

  for (const skill of deriveSkillSignals({ recentCommands })) {
    const result = upsertSkill(state.skills, { ...skill, sourceCommand: recentCommands[0] ?? null });
    state.skills = result.skills;
    refinedSkills.push(result.key);
  }

  const nudgeReady = state.event_count % state.evaluation_interval === 0;
  if (nudgeReady) {
    state.evaluations_count += 1;
    state.last_evaluation_at = new Date().toISOString();
    state.nudges_issued += 1;
    state.recent_evaluations = [
      ...state.recent_evaluations,
      {
        timestamp: state.last_evaluation_at,
        event_count: state.event_count,
        added_memory: addedMemory,
        refined_skills: refinedSkills,
        nudge: 'Review learned memory notes and reusable workflows; keep only high-signal items.'
      }
    ].slice(-20);
  }

  const filePath = saveQaLearningState({ state, vaultPath });
  return {
    implemented: true,
    path: filePath,
    state,
    nudge_ready: nudgeReady,
    added_memory: addedMemory,
    refined_skills: refinedSkills
  };
};
