import { spawn } from 'child_process';

export function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { shell: false, ...opts });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (d) => (stdout += d.toString()));
    child.stderr?.on('data', (d) => (stderr += d.toString()));

    child.on('error', (err) => {
      // Handle spawn errors (e.g., command not found)
      reject(err);
    });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}
