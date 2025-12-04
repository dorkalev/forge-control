import path from 'path';
import { respond } from '../utils/http.js';
import { openUrl, openTerminal } from '../utils/system.js';
import { runCommand } from '../utils/command.js';
import { exists } from '../services/worktree.js';

export async function handleOpen(req, res, query) {
  const target = (query.url || '').toString();
  if (!target) {
    return respond(res, 400, { ok: false, error: 'url required' });
  }

  const r = await openUrl(target);
  return respond(res, 200, { ok: r.code === 0, ...r });
}

export async function handleOpenTerminal(req, res) {
  if (req.method !== 'POST') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', async () => {
    try {
      const { path: directoryPath } = JSON.parse(body);
      if (!directoryPath) {
        return respond(res, 400, { ok: false, error: 'path required' });
      }

      if (!exists(directoryPath)) {
        return respond(res, 400, { ok: false, error: 'directory does not exist' });
      }

      const r = await openTerminal(directoryPath);
      return respond(res, 200, { ok: r.code === 0, ...r });
    } catch (e) {
      return respond(res, 400, { ok: false, error: 'invalid JSON' });
    }
  });
}

export async function handleOpenFinder(req, res) {
  if (req.method !== 'POST') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', async () => {
    try {
      const { path: directoryPath } = JSON.parse(body);
      if (!directoryPath) {
        return respond(res, 400, { ok: false, error: 'path required' });
      }

      if (!exists(directoryPath)) {
        return respond(res, 400, { ok: false, error: 'directory does not exist' });
      }

      const r = await runCommand('open', [directoryPath]);
      return respond(res, 200, { ok: r.code === 0, ...r });
    } catch (e) {
      return respond(res, 500, { ok: false, error: e.message });
    }
  });
}

export async function handleOpenMeld(req, res) {
  if (req.method !== 'POST') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', async () => {
    try {
      const { path: directoryPath } = JSON.parse(body);
      if (!directoryPath) {
        return respond(res, 400, { ok: false, error: 'path required' });
      }

      if (!exists(directoryPath)) {
        return respond(res, 400, { ok: false, error: 'directory does not exist' });
      }

      console.log(`📊 Opening Meld at: ${directoryPath}`);
      const r = await runCommand('meld', [directoryPath]);

      if (r.code === 0) {
        console.log(`✅ Successfully opened Meld`);
        return respond(res, 200, { ok: true, ...r });
      } else {
        console.error(`❌ Failed to open Meld: ${r.stderr}`);
        return respond(res, 500, { ok: false, error: r.stderr || 'Failed to open Meld. Is it installed? Run: brew install meld' });
      }
    } catch (e) {
      return respond(res, 500, { ok: false, error: e.message });
    }
  });
}

/**
 * Check if Meld is installed
 */
export async function checkMeldInstalled() {
  const r = await runCommand('which', ['meld']);
  return r.code === 0;
}

export async function handleOpenIssueFile(req, res) {
  if (req.method !== 'POST') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', async () => {
    try {
      const { worktreePath, issueFile } = JSON.parse(body);
      if (!worktreePath || !issueFile) {
        return respond(res, 400, { ok: false, error: 'worktreePath and issueFile required' });
      }

      const filePath = path.join(worktreePath, issueFile);

      if (!exists(filePath)) {
        return respond(res, 400, { ok: false, error: 'file does not exist' });
      }

      const r = await runCommand('open', [filePath]);
      return respond(res, 200, { ok: r.code === 0, ...r });
    } catch (e) {
      return respond(res, 500, { ok: false, error: e.message });
    }
  });
}

/**
 * Check if tmux is installed
 */
export async function checkTmuxInstalled() {
  const r = await runCommand('which', ['tmux']);
  return r.code === 0;
}

/**
 * Check if Claude Code CLI is installed
 */
export async function checkClaudeInstalled() {
  const r = await runCommand('which', ['claude']);
  return r.code === 0;
}
