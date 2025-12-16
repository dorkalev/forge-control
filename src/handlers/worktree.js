import { respond, respondHtml } from '../utils/http.js';
import { createWorktree } from '../services/worktree.js';
import { REPO_PATH, WORKTREE_REPO_PATH } from '../config/env.js';
import { getProjectContextSync } from '../services/projects.js';
import { getIssueByBranchName, moveIssueToInProgress } from '../services/linear.js';

export async function handleWorktree(req, res, query) {
  const accept = (req.headers['accept'] || '').toString();
  const wantsHtml = accept.includes('text/html');

  const render = (status, payload) => {
    if (!wantsHtml) return respond(res, status, payload);

    const { ok, branch, worktreePath, error, existed } = payload || {};
    const title = ok ? (existed ? 'Worktree Ready' : 'Worktree Created') : 'Worktree Error';
    const emoji = ok ? '✅' : '❌';
    const details = ok
      ? `${existed ? 'Already existed' : 'Successfully created'} for <code>${branch || ''}</code>`
      : (error ? `<pre style="white-space:pre-wrap">${String(error)}</pre>` : 'Unknown error');
    const pathLine = worktreePath ? `<div class="path">Path: <code>${worktreePath}</code></div>` : '';

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${emoji} ${title}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin: 40px; color: #222; }
      .card { max-width: 720px; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px 28px; box-shadow: 0 4px 14px rgba(0,0,0,0.06); }
      h1 { margin: 0 0 8px; font-size: 22px; }
      .status { font-size: 18px; margin-bottom: 10px; color: ${ok ? '#0a7d2a' : '#b91c1c'}; }
      .path code { background: #f3f4f6; padding: 2px 6px; border-radius: 6px; }
      .meta { margin-top: 18px; color: #555; font-size: 14px; }
      .actions { margin-top: 18px; }
      .btn { display: inline-block; background: #111827; color: white; padding: 8px 12px; border-radius: 8px; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${emoji} ${title}</h1>
      <div class="status">${details}</div>
      ${pathLine}
      <div class="meta">Endpoint: <code>/worktree?branch=${branch || ''}</code></div>
      <div class="actions">
        <a class="btn" href="/health">View Health</a>
      </div>
    </div>
  </body>
</html>`;
    return respondHtml(res, status, html);
  };

  // Get project context or fall back to env vars
  const ctx = getProjectContextSync();
  const repoPath = ctx?.REPO_PATH || REPO_PATH;
  const worktreeRepoPath = ctx?.WORKTREE_REPO_PATH || WORKTREE_REPO_PATH;

  if (!ctx && !REPO_PATH) {
    return render(400, { ok: false, error: 'No project selected and LOCAL_REPO_PATH not set', requiresProjectSelection: true });
  }
  if (!repoPath) {
    return render(400, { ok: false, error: 'No project selected', requiresProjectSelection: true });
  }
  if (!worktreeRepoPath) {
    return render(400, { ok: false, error: 'WORKTREE_REPO_PATH not set (path to the Git repo to create worktrees from)' });
  }

  const branch = (query.branch || '').toString();
  if (!branch) {
    return render(400, { ok: false, error: 'branch required' });
  }

  try {
    const result = await createWorktree(branch);

    // Move ticket to In Progress if worktree was created successfully
    if (result.ok && !result.existed) {
      try {
        const issue = await getIssueByBranchName(branch);
        if (issue?.id) {
          await moveIssueToInProgress(issue.id);
          console.log(`📋 Moved ${issue.identifier} to In Progress`);
        }
      } catch (linearErr) {
        console.log(`⚠️ Could not move ticket to In Progress: ${linearErr.message}`);
      }
    }

    const status = result.ok ? 200 : 500;
    return render(status, result);
  } catch (err) {
    return render(500, { ok: false, error: err.message });
  }
}
