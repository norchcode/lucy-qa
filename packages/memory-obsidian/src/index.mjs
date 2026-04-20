import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_VAULT_PATH = path.resolve(process.cwd(), 'vault');

const slugify = (value = '') => String(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'note';

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
};

const getCategoryDir = (vaultPath, category = 'general') => ensureDir(path.join(vaultPath, category));

const extractFrontmatter = (content) => {
  const match = String(content).match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { metadata: {}, body: String(content).trim() };
  }

  const metadata = {};
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':');
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    metadata[key] = value;
  }
  return { metadata, body: String(content).slice(match[0].length).trim() };
};

const buildFrontmatter = (metadata) => {
  const lines = Object.entries(metadata)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}: ${String(value)}`);

  return lines.length ? `---\n${lines.join('\n')}\n---\n\n` : '';
};

export const saveMemoryNote = async ({
  title,
  content,
  category = 'general',
  vaultPath = DEFAULT_VAULT_PATH,
  metadata = {}
} = {}) => {
  if (!title?.trim()) {
    throw new Error('title is required');
  }
  if (!content?.trim()) {
    throw new Error('content is required');
  }

  const timestamp = new Date().toISOString();
  const categoryDir = getCategoryDir(vaultPath, category);
  const fileName = `${timestamp.slice(0, 10)}-${slugify(title)}.md`;
  const notePath = path.join(categoryDir, fileName);
  const noteContent = `${buildFrontmatter({ title, category, created_at: timestamp, ...metadata })}# ${title}\n\n${content.trim()}\n`;

  fs.writeFileSync(notePath, noteContent);

  return {
    implemented: true,
    backend: 'obsidian-vault',
    path: notePath,
    title,
    category,
    vault_path: path.resolve(vaultPath)
  };
};

export const searchMemoryNotes = async ({
  query,
  vaultPath = DEFAULT_VAULT_PATH,
  limit = 10
} = {}) => {
  if (!query?.trim()) {
    throw new Error('query is required');
  }

  if (!fs.existsSync(vaultPath)) {
    return {
      implemented: true,
      backend: 'obsidian-vault',
      query,
      results: []
    };
  }

  const loweredQueryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = [];

  const walk = (dirPath) => {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.name.endsWith('.md')) {
        continue;
      }
      const raw = fs.readFileSync(fullPath, 'utf8');
      const { metadata, body } = extractFrontmatter(raw);
      const haystack = `${entry.name}\n${raw}`.toLowerCase();
      const score = loweredQueryTerms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      if (!score) {
        continue;
      }
      results.push({
        path: fullPath,
        title: metadata.title ?? body.split('\n')[0].replace(/^#\s*/, '').trim() ?? entry.name,
        category: metadata.category ?? path.relative(vaultPath, fullPath).split(path.sep)[0],
        score,
        content: body
      });
    }
  };

  walk(vaultPath);
  results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  return {
    implemented: true,
    backend: 'obsidian-vault',
    query,
    results: results.slice(0, limit)
  };
};
