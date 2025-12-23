import path from 'path';
import { respond } from '../utils/http.js';
import * as tmux from '../services/tmux.js';
import { exists, readIssueDescription } from '../services/worktree.js';

export async function handleOpenClaude(req, res) {
  if (req.method !== 'POST') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', async () => {
    try {
      const { path: directoryPath, branch, title, ticketId, initialPrompt } = JSON.parse(body);
      if (!directoryPath || !branch) {
        return respond(res, 400, { ok: false, error: 'path and branch required' });
      }

      // Check tmux installed
      if (!(await tmux.isTmuxInstalled())) {
        return respond(res, 400, { ok: false, error: 'tmux not installed. Install with: brew install tmux' });
      }

      // Generate initial prompt from issue file if not provided
      let prompt = initialPrompt;
      if (!prompt) {
        console.log(`🔍 [Claude] Looking for issue file in ${directoryPath}`);
        const issueInfo = await readIssueDescription(directoryPath);
        if (issueInfo?.issueFile) {
          prompt = `The current branch ticket is ${issueInfo.issueFile} - read it and make a plan for it.`;
          console.log(`📝 [Claude] Generated prompt: "${prompt}"`);
        } else {
          console.log(`⚠️  [Claude] No issue file found in ${directoryPath}/issues/`);
        }
      }

      // Create or reuse session
      console.log(`🚀 [Claude] Creating/reusing session with prompt: ${prompt ? 'YES' : 'NO'}`);
      const { sessionName, windowTitle } = await tmux.createClaudeSession(branch, directoryPath, title, ticketId, prompt);

      // Open in terminal
      const result = await tmux.openSessionInTerminal(sessionName, windowTitle);

      return respond(res, 200, { ok: result.code === 0, sessionName });
    } catch (e) {
      return respond(res, 500, { ok: false, error: e.message });
    }
  });
}

export async function handleOpenCodex(req, res) {
  if (req.method !== 'POST') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', async () => {
    try {
      const { path: directoryPath, branch, title, ticketId, initialPrompt } = JSON.parse(body);
      if (!directoryPath || !branch) {
        return respond(res, 400, { ok: false, error: 'path and branch required' });
      }

      // Check tmux installed
      if (!(await tmux.isTmuxInstalled())) {
        return respond(res, 400, { ok: false, error: 'tmux not installed. Install with: brew install tmux' });
      }

      // Generate initial prompt from issue file if not provided
      let prompt = initialPrompt;
      if (!prompt) {
        const issueInfo = await readIssueDescription(directoryPath);
        if (issueInfo?.issueFile) {
          prompt = `The current branch ticket is ${issueInfo.issueFile} - read it and make a plan for it.`;
        }
      }

      // Create or reuse session
      const { sessionName, windowTitle } = await tmux.createCodexSession(branch, directoryPath, title, ticketId, prompt);

      // Open in terminal
      const result = await tmux.openSessionInTerminal(sessionName, windowTitle);

      return respond(res, 200, { ok: result.code === 0, sessionName });
    } catch (e) {
      return respond(res, 500, { ok: false, error: e.message });
    }
  });
}

export async function handleAttachTmux(req, res) {
  if (req.method !== 'POST') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', async () => {
    try {
      const { sessionName } = JSON.parse(body);
      if (!sessionName) {
        return respond(res, 400, { ok: false, error: 'sessionName required' });
      }

      // Check if session exists
      if (!(await tmux.sessionExists(sessionName))) {
        return respond(res, 400, { ok: false, error: `Session "${sessionName}" does not exist` });
      }

      console.log(`🖥️  Opening terminal to attach to tmux session: ${sessionName}`);
      const result = await tmux.openSessionInTerminal(sessionName);

      return respond(res, 200, { ok: result.code === 0, sessionName });
    } catch (e) {
      return respond(res, 500, { ok: false, error: e.message });
    }
  });
}

export async function handleKillTmux(req, res) {
  if (req.method !== 'POST') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', async () => {
    try {
      const { sessionName } = JSON.parse(body);
      if (!sessionName) {
        return respond(res, 400, { ok: false, error: 'sessionName required' });
      }

      // Check if session exists
      if (!(await tmux.sessionExists(sessionName))) {
        return respond(res, 400, { ok: false, error: `Session "${sessionName}" does not exist` });
      }

      console.log(`🗑️  Killing tmux session: ${sessionName}`);
      const result = await tmux.killSession(sessionName);

      if (result.code === 0) {
        console.log(`✅ Successfully killed session: ${sessionName}`);
        return respond(res, 200, { ok: true, sessionName });
      } else {
        console.error(`❌ Failed to kill session: ${result.stderr}`);
        return respond(res, 500, { ok: false, error: result.stderr || 'Failed to kill session' });
      }
    } catch (e) {
      return respond(res, 500, { ok: false, error: e.message });
    }
  });
}

export async function handleTileIterm(req, res) {
  if (req.method !== 'POST') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  console.log(`🎯 Tiling iTerm2 windows...`);

  // Get the project root directory (where tile-iterm.sh is located)
  const scriptDir = path.dirname(path.dirname(path.dirname(new URL(import.meta.url).pathname)));
  const result = await tmux.tileItermWindows(scriptDir);

  if (result.code === 0) {
    console.log(`✅ Successfully tiled iTerm2 windows`);
    return respond(res, 200, { ok: true });
  } else {
    console.error(`❌ Failed to tile iTerm2: ${result.stderr}`);
    return respond(res, 500, { ok: false, error: result.stderr || 'Failed to tile iTerm2' });
  }
}

export async function handleTileAllWindows(req, res) {
  if (req.method !== 'POST') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  console.log(`🎯 Tiling all work windows...`);

  // Get the project root directory (where tile-all-windows.sh is located)
  const scriptDir = path.dirname(path.dirname(path.dirname(new URL(import.meta.url).pathname)));
  const result = await tmux.tileAllWindows(scriptDir);

  if (result.code === 0) {
    console.log(`✅ Successfully tiled all windows`);
    return respond(res, 200, { ok: true });
  } else {
    console.error(`❌ Failed to tile all windows: ${result.stderr}`);
    return respond(res, 500, { ok: false, error: result.stderr || 'Failed to tile all windows' });
  }
}
