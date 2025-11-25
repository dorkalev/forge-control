import { handleCheckout } from '../handlers/checkout.js';
import { handleOpen, handleOpenTerminal, handleOpenFinder, handleOpenGitKraken } from '../handlers/open.js';
import { handleOpenClaude, handleAttachTmux, handleKillTmux, handleTileIterm, handleTileAllWindows } from '../handlers/tmux.js';
import { handleCleanupBranch, handleHideWorktree } from '../handlers/cleanup.js';
import { handleRunDev } from '../handlers/dev.js';
import { handleWorktree } from '../handlers/worktree.js';
import { handleFolderStatus } from '../handlers/status.js';
import { handleRoot } from '../handlers/root.js';
import { handleReleaseNotify } from '../handlers/releases.js';
import { handleGetUnassignedIssues, handleAssignIssue, handleGetUsers } from '../handlers/linear.js';
import { handleAutopilotStart, handleAutopilotStop, handleAutopilotStatus, handleAutopilotSetMax } from '../handlers/autopilot.js';
import { handleRenderStatus } from '../handlers/render.js';
import { handleIssuesDiff, handleGenerateChangelog } from '../handlers/issues-diff.js';
import { handleCreateBranch, handleBranchExists, handleCreatePROnly } from '../handlers/branch.js';
import { respond } from '../utils/http.js';
import { PORT, REPO_PATH, WORKTREE_REPO_PATH } from '../config/env.js';

export async function routeRequest(req, res, pathname, query) {
  // Handle GET routes
  if (req.method === 'GET') {
    if (pathname === '/') {
      return await handleRoot(req, res);
    }

    if (pathname === '/health') {
      return respond(res, 200, {
        ok: true,
        port: PORT,
        repoPath: REPO_PATH,
        worktreeRepoPath: WORKTREE_REPO_PATH
      });
    }

    if (pathname === '/checkout') {
      return await handleCheckout(req, res, query);
    }

    if (pathname === '/open') {
      return await handleOpen(req, res, query);
    }

    if (pathname === '/worktree') {
      return await handleWorktree(req, res, query);
    }

    if (pathname === '/api/folder-status') {
      return await handleFolderStatus(req, res, query);
    }

    if (pathname === '/api/linear/unassigned-issues') {
      return await handleGetUnassignedIssues(req, res);
    }

    if (pathname === '/api/linear/users') {
      return await handleGetUsers(req, res);
    }

    if (pathname === '/api/autopilot/status') {
      return await handleAutopilotStatus(req, res);
    }

    if (pathname === '/api/render/status') {
      return await handleRenderStatus(req, res);
    }

    if (pathname === '/api/issues-diff') {
      return await handleIssuesDiff(req, res);
    }

    if (pathname === '/api/issues-diff/generate-changelog') {
      return await handleGenerateChangelog(req, res, query);
    }

    if (pathname === '/api/branch-exists') {
      return await handleBranchExists(req, res);
    }
  }

  // Handle POST routes
  if (req.method === 'POST') {
    if (pathname === '/open-terminal') {
      return await handleOpenTerminal(req, res);
    }

    if (pathname === '/open-claude') {
      return await handleOpenClaude(req, res);
    }

    if (pathname === '/open-finder') {
      return await handleOpenFinder(req, res);
    }

    if (pathname === '/open-gitkraken') {
      return await handleOpenGitKraken(req, res);
    }

    if (pathname === '/hide-worktree') {
      return await handleHideWorktree(req, res);
    }

    if (pathname === '/cleanup-branch') {
      return await handleCleanupBranch(req, res);
    }

    if (pathname === '/run-dev') {
      return await handleRunDev(req, res);
    }

    if (pathname === '/attach-tmux') {
      return await handleAttachTmux(req, res);
    }

    if (pathname === '/kill-tmux') {
      return await handleKillTmux(req, res);
    }

    if (pathname === '/tile-iterm') {
      return await handleTileIterm(req, res);
    }

    if (pathname === '/tile-all-windows') {
      return await handleTileAllWindows(req, res);
    }

    if (pathname === '/api/releases/notify') {
      return await handleReleaseNotify(req, res);
    }

    if (pathname === '/api/linear/assign-issue') {
      return await handleAssignIssue(req, res);
    }

    if (pathname === '/api/autopilot/start') {
      return await handleAutopilotStart(req, res);
    }

    if (pathname === '/api/autopilot/stop') {
      return await handleAutopilotStop(req, res);
    }

    if (pathname === '/api/autopilot/set-max') {
      return await handleAutopilotSetMax(req, res);
    }

    if (pathname === '/api/create-branch') {
      return await handleCreateBranch(req, res);
    }

    if (pathname === '/api/create-pr-only') {
      return await handleCreatePROnly(req, res);
    }
  }

  return respond(res, 404, { ok: false, error: 'Not found' });
}
