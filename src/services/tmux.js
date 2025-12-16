import path from 'path';
import { runCommand } from '../utils/command.js';

export async function isTmuxInstalled() {
  try {
    const result = await runCommand('which', ['tmux']);
    return result.code === 0;
  } catch (err) {
    return false;
  }
}

export async function sessionExists(sessionName) {
  const result = await runCommand('tmux', ['has-session', '-t', sessionName]);
  return result.code === 0;
}

export async function createSession(sessionName, directoryPath) {
  return runCommand('tmux', ['new-session', '-d', '-s', sessionName, '-c', directoryPath]);
}

export async function setSessionOption(sessionName, option, value) {
  return runCommand('tmux', ['set-option', '-t', sessionName, option, value]);
}

export async function renameWindow(sessionName, windowIndex, newName) {
  return runCommand('tmux', ['rename-window', '-t', `${sessionName}:${windowIndex}`, newName]);
}

export async function sendKeys(sessionName, keys) {
  return runCommand('tmux', ['send-keys', '-t', sessionName, ...keys]);
}

export async function killSession(sessionName) {
  return runCommand('tmux', ['kill-session', '-t', sessionName]);
}

async function upgradeClaudeCode() {
  console.log('🔄 Checking for claude-code updates...');
  const result = await runCommand('brew', ['upgrade', 'claude-code', '--quiet']);
  if (result.code === 0 && result.stdout?.trim()) {
    console.log('✅ claude-code upgraded');
  }
}

export async function createClaudeSession(branch, directoryPath, title = null, ticketId = null, initialPrompt = null) {
  // Use the folder name from the directory path as session base (unique per worktree)
  const folderName = path.basename(directoryPath);
  // Sanitize for tmux session name (replace invalid chars with -)
  const sanitizedFolderName = folderName.replace(/[^a-zA-Z0-9_-]/g, '-');
  const sessionName = `${sanitizedFolderName}-claude`;

  // Extract ticket ID from branch for display purposes
  const ticketMatch = branch.match(/^([A-Z]+-\d+)/i);
  const baseSessionName = ticketMatch ? ticketMatch[1].toUpperCase() : branch;

  // Create window title
  const windowTitle = ticketId && title ? `${ticketId} - ${title}` : baseSessionName;

  // Check if session exists
  if (await sessionExists(sessionName)) {
    console.log(`♻️  Reusing tmux session: ${sessionName}`);
    // Still send the prompt if provided (for existing sessions)
    if (initialPrompt) {
      const result = await runCommand('tmux', ['send-keys', '-t', sessionName, '-l', initialPrompt]);
      if (result.code === 0) {
        console.log(`📝 Pre-filled prompt: "${initialPrompt.substring(0, 50)}..."`);
      }
    }
    return { sessionName, windowTitle, created: false };
  }

  // Upgrade claude-code before creating new session
  await upgradeClaudeCode();

  // Create new session
  console.log(`📦 Creating tmux session: ${sessionName}`);
  await createSession(sessionName, directoryPath);

  // Configure tmux status bar and window title
  await setSessionOption(sessionName, 'status-left', `[${baseSessionName}] Claude `);
  await setSessionOption(sessionName, 'status-left-length', '40');
  await renameWindow(sessionName, 0, 'claude');
  await setSessionOption(sessionName, 'set-titles', 'on');
  await setSessionOption(sessionName, 'set-titles-string', windowTitle);

  // Start Claude with maximum permissions (skip permission prompts)
  await sendKeys(sessionName, ['claude --dangerously-skip-permissions', 'C-m']);

  // If initial prompt provided, wait for Claude to start then type it (without pressing Enter)
  if (initialPrompt) {
    // Wait longer for Claude to fully initialize (it takes a few seconds to load)
    console.log(`⏳ Waiting for Claude to initialize before sending prompt...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    // Use send-keys with -l flag for literal text (handles special characters)
    const result = await runCommand('tmux', ['send-keys', '-t', sessionName, '-l', initialPrompt]);
    if (result.code === 0) {
      console.log(`📝 Pre-filled prompt: "${initialPrompt.substring(0, 50)}..."`);
    } else {
      console.error(`❌ Failed to send prompt: ${result.stderr}`);
    }
  }

  return { sessionName, windowTitle, created: true };
}

export async function createCodexSession(branch, directoryPath, title = null, ticketId = null, initialPrompt = null) {
  // Use the folder name from the directory path as session base (unique per worktree)
  const folderName = path.basename(directoryPath);
  // Sanitize for tmux session name (replace invalid chars with -)
  const sanitizedFolderName = folderName.replace(/[^a-zA-Z0-9_-]/g, '-');
  const sessionName = `${sanitizedFolderName}-codex`;

  // Extract ticket ID from branch for display purposes
  const ticketMatch = branch.match(/^([A-Z]+-\d+)/i);
  const baseSessionName = ticketMatch ? ticketMatch[1].toUpperCase() : branch;

  // Create window title
  const windowTitle = ticketId && title ? `${ticketId} - ${title}` : baseSessionName;

  // Check if session exists
  if (await sessionExists(sessionName)) {
    console.log(`♻️  Reusing tmux session: ${sessionName}`);
    // Still send the prompt if provided (for existing sessions)
    if (initialPrompt) {
      const result = await runCommand('tmux', ['send-keys', '-t', sessionName, '-l', initialPrompt]);
      if (result.code === 0) {
        console.log(`📝 Pre-filled prompt: "${initialPrompt.substring(0, 50)}..."`);
      }
    }
    return { sessionName, windowTitle, created: false };
  }

  // Create new session
  console.log(`📦 Creating tmux session: ${sessionName}`);
  await createSession(sessionName, directoryPath);

  // Configure tmux status bar and window title
  await setSessionOption(sessionName, 'status-left', `[${baseSessionName}] Codex `);
  await setSessionOption(sessionName, 'status-left-length', '40');
  await renameWindow(sessionName, 0, 'codex');
  await setSessionOption(sessionName, 'set-titles', 'on');
  await setSessionOption(sessionName, 'set-titles-string', windowTitle);

  // Start Codex with full auto mode
  await sendKeys(sessionName, ['codex --full-auto', 'C-m']);

  // If initial prompt provided, wait for Codex to start then type it (without pressing Enter)
  if (initialPrompt) {
    // Wait longer for Codex to fully initialize (it takes a few seconds to load)
    console.log(`⏳ Waiting for Codex to initialize before sending prompt...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    // Use send-keys with -l flag for literal text (handles special characters)
    const result = await runCommand('tmux', ['send-keys', '-t', sessionName, '-l', initialPrompt]);
    if (result.code === 0) {
      console.log(`📝 Pre-filled prompt: "${initialPrompt.substring(0, 50)}..."`);
    } else {
      console.error(`❌ Failed to send prompt: ${result.stderr}`);
    }
  }

  return { sessionName, windowTitle, created: true };
}

export async function openSessionInTerminal(sessionName, windowTitle = null) {
  // Check if iTerm2 is available
  const iTermCheck = await runCommand('osascript', ['-e', 'exists application "iTerm"']);
  const useITerm = iTermCheck.code === 0;

  console.log(`🖥️  Opening ${useITerm ? 'iTerm2' : 'Terminal'} with tmux session: ${sessionName}`);

  if (useITerm) {
    // Create a .command script that iTerm will execute in a new window
    const scriptContent = `#!/bin/bash
exec tmux attach -t ${sessionName} 2>/dev/null || exec tmux new -s ${sessionName}
`;
    const scriptPath = `/tmp/forge-iterm-${Date.now()}.command`;

    const writeResult = await runCommand('bash', ['-c', `cat > ${scriptPath} << 'FORGE_EOF'\n${scriptContent}FORGE_EOF\nchmod +x ${scriptPath}`]);

    if (writeResult.code === 0) {
      const result = await runCommand('open', ['-a', 'iTerm', scriptPath]);

      if (result.code === 0) {
        console.log(`✅ Opened iTerm with tmux session: ${sessionName}`);
        setTimeout(() => runCommand('rm', ['-f', scriptPath]), 5000);
        return { code: 0, sessionName };
      }
    }
  }

  // Fallback for Terminal or if iTerm method failed
  const result = await runCommand('open', ['-a', useITerm ? 'iTerm' : 'Terminal']);
  if (result.code === 0) {
    console.log(`✅ Opened ${useITerm ? 'iTerm' : 'Terminal'} - run: tmux attach -t ${sessionName}`);
    return { ...result, fallback: true, sessionName };
  }

  return result;
}

export async function tileItermWindows(scriptDir) {
  const scriptPath = path.join(scriptDir, 'tile-iterm.sh');
  return runCommand('bash', [scriptPath]);
}

export async function tileAllWindows(scriptDir) {
  const scriptPath = path.join(scriptDir, 'tile-all-windows.sh');
  return runCommand('bash', [scriptPath]);
}

/**
 * List all tmux sessions
 */
export async function listAllSessions() {
  try {
    const result = await runCommand('tmux', ['list-sessions', '-F', '#{session_name}']);

    if (result.code !== 0) {
      return []; // No sessions or tmux not running
    }

    return result.stdout
      .split('\n')
      .filter(line => line.trim())
      .map(name => ({ name: name.trim() }));
  } catch (err) {
    // tmux not installed or not available
    return [];
  }
}
