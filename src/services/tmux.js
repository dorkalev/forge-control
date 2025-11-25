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

export async function createClaudeSession(branch, directoryPath, title = null, ticketId = null) {
  // Extract ticket ID from branch
  const ticketMatch = branch.match(/^([A-Z]+-\d+)/);
  const baseSessionName = ticketMatch ? ticketMatch[1] : branch;
  const sessionName = `${baseSessionName}-claude`;

  // Create window title
  const windowTitle = ticketId && title ? `${ticketId} - ${title}` : baseSessionName;

  // Check if session exists
  if (await sessionExists(sessionName)) {
    console.log(`♻️  Reusing tmux session: ${sessionName}`);
    return { sessionName, windowTitle, created: false };
  }

  // Create new session
  console.log(`📦 Creating tmux session: ${sessionName}`);
  await createSession(sessionName, directoryPath);

  // Configure tmux status bar and window title
  await setSessionOption(sessionName, 'status-left', `[${baseSessionName}] Claude `);
  await setSessionOption(sessionName, 'status-left-length', '40');
  await renameWindow(sessionName, 0, 'claude');
  await setSessionOption(sessionName, 'set-titles', 'on');
  await setSessionOption(sessionName, 'set-titles-string', windowTitle);

  // Start Claude
  await sendKeys(sessionName, ['claude', 'C-m']);

  return { sessionName, windowTitle, created: true };
}

export async function openSessionInTerminal(sessionName, windowTitle = null) {
  // Open iTerm2 or Terminal with tmux attach
  const iTermCheck = await runCommand('osascript', ['-e', 'exists application "iTerm"']);
  const useITerm = iTermCheck.code === 0;

  // For AppleScript, we need to sanitize the title to avoid syntax errors
  // Remove all special characters that could break AppleScript
  const sanitizedTitle = (windowTitle || sessionName)
    .replace(/['"\\]/g, '')  // Remove quotes and backslashes
    .replace(/[^\x20-\x7E]/g, '');  // Remove non-printable chars

  const appleScript = useITerm ? `
    tell application "iTerm"
      create window with default profile
      tell current session of current window
        set name to "${sanitizedTitle}"
        write text "tmux attach -t ${sessionName}"
      end tell
    end tell
  ` : `
    tell application "Terminal"
      do script "tmux attach -t ${sessionName}"
      set custom title of front window to "${sanitizedTitle}"
      activate
    end tell
  `;

  console.log(`🖥️  Opening ${useITerm ? 'iTerm2' : 'Terminal'} with tmux session: ${sessionName}`);
  console.log(`📜 AppleScript to execute:\n${appleScript}`);

  const result = await runCommand('osascript', ['-e', appleScript]);

  if (result.code !== 0) {
    console.error(`❌ AppleScript failed with code ${result.code}`);
    console.error(`   stdout: ${result.stdout}`);
    console.error(`   stderr: ${result.stderr}`);
  } else {
    console.log(`✅ AppleScript executed successfully`);
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
