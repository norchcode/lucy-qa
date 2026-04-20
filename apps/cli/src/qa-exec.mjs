import { spawn } from 'node:child_process';

export const runQaExecCommand = async ({ command, cwd = process.cwd(), timeoutMs = 120000 }) => {
  if (!command?.trim()) {
    throw new Error('Command is required');
  }

  return await new Promise((resolve, reject) => {
    const child = spawn(command, {
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
