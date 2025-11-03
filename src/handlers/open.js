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

export async function handleOpenGitKraken(req, res) {
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

      console.log(`🦑 Opening GitKraken at: ${directoryPath}`);
      // Use open command to launch GitKraken with the repository path
      // Pass the path as an argument using --args
      const r = await runCommand('open', ['-a', 'GitKraken', '--args', '-p', directoryPath]);

      if (r.code === 0) {
        console.log(`✅ Successfully opened GitKraken`);
        return respond(res, 200, { ok: true, ...r });
      } else {
        console.error(`❌ Failed to open GitKraken: ${r.stderr}`);
        return respond(res, 500, { ok: false, error: r.stderr || 'Failed to open GitKraken' });
      }
    } catch (e) {
      return respond(res, 500, { ok: false, error: e.message });
    }
  });
}
