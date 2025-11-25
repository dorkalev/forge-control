import { spawn, execFileSync } from 'child_process';
import { existsSync } from 'fs';

// Resolve full path to a command by checking common locations
function resolveCommandPath(cmd) {
  // Common locations to check
  const searchPaths = [
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/opt/homebrew/bin',
    '/opt/local/bin',
    '/Applications/Xcode.app/Contents/Developer/usr/bin'
  ];

  // Check if cmd is already an absolute path
  if (cmd.startsWith('/') && existsSync(cmd)) {
    return cmd;
  }

  // Search in common paths
  for (const dir of searchPaths) {
    const fullPath = `${dir}/${cmd}`;
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  // Fallback: try using 'which' command
  try {
    const result = execFileSync('/usr/bin/which', [cmd], { encoding: 'utf8' });
    const resolved = result.trim();
    if (resolved && existsSync(resolved)) {
      return resolved;
    }
  } catch (e) {
    // which command failed, continue
  }

  // Return original command as fallback
  return cmd;
}

export function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    // Resolve the full path to the command
    const resolvedCmd = resolveCommandPath(cmd);

    // Ensure PATH includes common locations for git and other tools
    const additionalPaths = [
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/opt/homebrew/bin',
      '/opt/local/bin',
      '/Applications/Xcode.app/Contents/Developer/usr/bin'
    ];
    const existingPath = process.env.PATH || '';
    const fullPath = [...new Set([...existingPath.split(':'), ...additionalPaths])].join(':');

    const spawnOpts = {
      shell: false,  // Back to false since we're using resolved paths
      ...opts,
      env: {
        ...process.env,
        ...(opts.env || {}),
        PATH: fullPath
      }
    };

    // Debug: log the first time git is run
    if (cmd === 'git' && !global.__git_path_logged) {
      console.log('🔧 [Command] Running git command:', resolvedCmd);
      console.log('🔧 [Command] Resolved from:', cmd);
      global.__git_path_logged = true;
    }

    const child = spawn(resolvedCmd, args, spawnOpts);
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
