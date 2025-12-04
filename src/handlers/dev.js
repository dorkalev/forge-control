import { respond } from '../utils/http.js';
import * as tmux from '../services/tmux.js';
import { exists } from '../services/worktree.js';

export async function handleRunDev(req, res) {
  if (req.method !== 'POST') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', async () => {
    try {
      const { path: directoryPath, branch, title, ticketId, isForgeControl } = JSON.parse(body);
      console.log(`🔍 handleRunDev: path=${directoryPath}, isForgeControl=${isForgeControl}`);
      if (!directoryPath || !branch) {
        return respond(res, 400, { ok: false, error: 'path and branch required' });
      }

      if (!exists(directoryPath)) {
        return respond(res, 400, { ok: false, error: 'directory does not exist' });
      }

      // Check tmux installed
      if (!(await tmux.isTmuxInstalled())) {
        return respond(res, 400, { ok: false, error: 'tmux not installed. Install with: brew install tmux' });
      }

      // Extract ticket ID from branch
      const ticketMatch = branch.match(/^([A-Z]+-\d+)/);
      const baseSessionName = ticketMatch ? ticketMatch[1] : branch;
      const sessionName = `${baseSessionName}-dev`;

      // Create window title
      const windowTitle = ticketId && title ? `${ticketId} - ${title} (dev)` : `${baseSessionName} (dev)`;

      // Create or reuse session
      if (!(await tmux.sessionExists(sessionName))) {
        console.log(`📦 Creating tmux session: ${sessionName}`);
        await tmux.createSession(sessionName, directoryPath);

        // Configure tmux status bar and window title
        await tmux.setSessionOption(sessionName, 'status-left', `[${baseSessionName}] Dev Server `);
        await tmux.setSessionOption(sessionName, 'status-left-length', '40');
        await tmux.renameWindow(sessionName, 0, 'dev');
        await tmux.setSessionOption(sessionName, 'set-titles', 'on');
        await tmux.setSessionOption(sessionName, 'set-titles-string', windowTitle);
      } else {
        console.log(`♻️  Reusing tmux session: ${sessionName}`);
      }

      // Run dev command (use restart.sh for forge-control to kill other instances first)
      if (isForgeControl) {
        console.log(`🔄 Running ./restart.sh in ${sessionName} (forge-control)`);
        await tmux.sendKeys(sessionName, ['./restart.sh', 'C-m']);
      } else {
        console.log(`🛑 Running ./stop.sh in ${sessionName}`);
        await tmux.sendKeys(sessionName, ['./stop.sh', 'C-m']);

        // Wait a moment for stop.sh to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log(`🚀 Running ./dev in ${sessionName}`);
        await tmux.sendKeys(sessionName, ['./dev', 'C-m']);
      }

      // Open in terminal
      const result = await tmux.openSessionInTerminal(sessionName, windowTitle);

      return respond(res, 200, { ok: result.code === 0, sessionName });
    } catch (e) {
      return respond(res, 500, { ok: false, error: e.message });
    }
  });
}
