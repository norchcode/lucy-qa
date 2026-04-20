import { spawn } from 'node:child_process';
import { wrapCommandWithRtk, isRtkAvailable } from '../../../packages/rtk-filter/src/index.mjs';

export const runQaExecCommand = async ({ command, cwd = process.cwd(), timeoutMs = 120000 }) => {
  if (!command?.trim()) {
    throw new Error('Command is required');
  }

  const rtkAvailable = isRtkAvailable();
  const resolvedCommand = rtkAvailable ? wrapCommandWithRtk(command) : command;
  const rtkApplied = rtkAvailable && resolvedCommand !== command;

  return await new Promise((resolve, reject) => {
    const child = spawn(resolvedCommand, {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        implemented: true,
        command,
        resolved_command: resolvedCommand,
        rtk_applied: rtkApplied,
        cwd,
        timeout_ms: timeoutMs,
        exit_code: code ?? (timedOut ? 124 : 1),
        signal: signal ?? null,
        timed_out: timedOut,
        status: timedOut ? 'timed_out' : (code === 0 ? 'passed' : 'failed'),
        stdout,
        stderr
      });
    });
  });
};
