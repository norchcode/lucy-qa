/**
 * RTK (Rust Token Killer) integration for Lucy QA.
 *
 * RTK is a CLI proxy that filters command output before it reaches LLM context,
 * reducing token usage by 60-90% on common commands like git, ls, npm test, etc.
 *
 * https://github.com/rtk-ai/rtk
 *
 * This module handles:
 * - RTK binary detection (with caching)
 * - Command rewriting (e.g. "git status" → "rtk git status")
 * - Graceful fallback when RTK is not installed
 * - Per-command opt-out via LUCY_QA_RTK_ENABLED=false
 */

import { execFileSync } from 'node:child_process';

// Commands RTK knows how to filter. Source: https://github.com/rtk-ai/rtk
// Covers all major git, fs, test runner, and search tool categories.
const RTK_SUPPORTED_COMMANDS = new Set([
  // Version control
  'git',
  // Filesystem
  'ls', 'la', 'll', 'cat', 'head', 'tail', 'find', 'tree', 'du', 'wc',
  // Search
  'grep', 'rg', 'ag', 'ack',
  // Node / JS package managers + test runners
  'npm', 'npx', 'pnpm', 'yarn', 'bun',
  'node', 'jest', 'vitest', 'mocha',
  // Rust
  'cargo',
  // Python
  'python', 'python3', 'pytest', 'uv', 'pip', 'pip3',
  // Go
  'go',
  // General build/test
  'make', 'cmake', 'ninja',
  // Docker / containers
  'docker', 'docker-compose', 'kubectl',
  // Shell utilities
  'env', 'printenv', 'echo',
]);

// Cached RTK availability check — avoid repeated subprocess calls.
let _rtkAvailable = null;

/**
 * Check if the `rtk` binary is available in PATH.
 * Result is cached after the first call.
 */
export const isRtkAvailable = () => {
  if (_rtkAvailable !== null) return _rtkAvailable;

  // Explicit opt-out via env var
  if (process.env.LUCY_QA_RTK_ENABLED === 'false') {
    _rtkAvailable = false;
    return false;
  }

  try {
    execFileSync('rtk', ['--version'], { stdio: 'ignore', timeout: 3000 });
    _rtkAvailable = true;
  } catch {
    _rtkAvailable = false;
  }
  return _rtkAvailable;
};

/**
 * Force-reset the cached RTK availability check.
 * Useful in tests that install/uninstall RTK between runs.
 */
export const resetRtkCache = () => {
  _rtkAvailable = null;
};

/**
 * Get the RTK version string, or null if not available.
 */
export const getRtkVersion = () => {
  try {
    const output = execFileSync('rtk', ['--version'], { encoding: 'utf8', timeout: 3000 });
    return output.trim();
  } catch {
    return null;
  }
};

/**
 * Parse the base command name from a shell command string.
 * e.g. "git status --short" → "git"
 *      "npx playwright test foo.spec.js" → "npx"
 *      "SOME_VAR=1 npm test" → "npm"   (skips leading env assignments)
 *
 * Returns null if the string is empty or unparseable.
 */
export const parseBaseCommand = (commandString = '') => {
  const trimmed = commandString.trim();
  if (!trimmed) return null;
  const tokens = trimmed.split(/\s+/);
  for (const token of tokens) {
    if (!token) continue;
    // Skip shell variable assignments (VAR=value)
    if (/^[A-Z_][A-Z0-9_]*=/.test(token)) continue;
    // Skip shell operators
    if (['&&', '||', ';', '|', '>', '>>', '<'].includes(token)) continue;
    return token;
  }
  return null;
};

/**
 * Determine whether RTK should filter this command string.
 * Returns true if:
 * - RTK is available in PATH
 * - The base command is in RTK's supported set
 * - The command doesn't already start with "rtk"
 */
export const shouldWrapWithRtk = (commandString = '') => {
  if (!isRtkAvailable()) return false;
  const base = parseBaseCommand(commandString);
  if (!base) return false;
  if (base === 'rtk') return false; // already wrapped
  return RTK_SUPPORTED_COMMANDS.has(base);
};

/**
 * Rewrite a command string to use RTK filtering.
 *
 * The rewrite strategy:
 * - Commands without leading env vars: prepend "rtk "
 *   "git status" → "rtk git status"
 * - Commands with leading env vars: inject "rtk" after the last env var
 *   "NODE_ENV=test npm test" → "NODE_ENV=test rtk npm test"
 *
 * If RTK is not available or command is not supported, returns the original.
 */
export const wrapCommandWithRtk = (commandString = '') => {
  if (!shouldWrapWithRtk(commandString)) return commandString;

  const tokens = commandString.trim().split(/\s+/);
  const envVars = [];
  let firstCmdIdx = 0;

  for (let i = 0; i < tokens.length; i++) {
    if (/^[A-Z_][A-Z0-9_]*=/.test(tokens[i])) {
      envVars.push(tokens[i]);
      firstCmdIdx = i + 1;
    } else {
      break;
    }
  }

  const rest = tokens.slice(firstCmdIdx).join(' ');
  if (envVars.length > 0) {
    return `${envVars.join(' ')} rtk ${rest}`;
  }
  return `rtk ${rest}`;
};

/**
 * Build exec arguments for spawning RTK directly (no shell).
 *
 * Usage:
 *   const { command, args } = buildRtkSpawnArgs('npx', ['playwright', 'test', 'foo.spec.js']);
 *   spawn(command, args, { ... });
 *
 * If RTK is not available or the base command is not supported, returns
 * the original command/args unchanged.
 */
export const buildRtkSpawnArgs = (command, args = []) => {
  if (!isRtkAvailable() || !RTK_SUPPORTED_COMMANDS.has(command)) {
    return { command, args };
  }
  return {
    command: 'rtk',
    args: [command, ...args]
  };
};

/**
 * Summary object describing RTK status for reporting / doctor output.
 */
export const getRtkStatus = () => {
  const available = isRtkAvailable();
  const version = available ? getRtkVersion() : null;
  return {
    available,
    version,
    enabled: process.env.LUCY_QA_RTK_ENABLED !== 'false',
    install_hint: available ? null : [
      'Install RTK to reduce LLM token usage by 60-90% on shell commands.',
      'Quick install (Linux/macOS):',
      '  curl -fsSL https://install.rtk-ai.app | sh',
      'Or download from: https://github.com/rtk-ai/rtk/releases',
      'Then add ~/.local/bin to your PATH.',
      'Disable RTK for Lucy QA: export LUCY_QA_RTK_ENABLED=false'
    ]
  };
};
