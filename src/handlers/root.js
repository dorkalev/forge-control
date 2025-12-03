import fs from 'fs';
import path from 'path';
import { respond, respondHtml } from '../utils/http.js';
import { runCommand } from '../utils/command.js';
import { exists } from '../services/worktree.js';
import { getOpenPRsToBase } from '../services/github.js';
import { getUserAssignedIssues } from '../services/linear.js';
import { renderRootPage } from '../views/root.js';
import { WORKTREE_REPO_PATH, LOCAL_DEV_URL, LINEAR_API_KEY, LINEAR_USERNAME } from '../config/env.js';
import { getProjectContextSync, listProjects, getActiveProject, getActiveProjectEnv } from '../services/projects.js';
import { checkMeldInstalled, checkTmuxInstalled, checkClaudeInstalled } from './open.js';

export async function handleRoot(req, res) {
  const accept = (req.headers['accept'] || '').toString();
  const wantsHtml = accept.includes('text/html');

  if (!wantsHtml) {
    return respond(res, 200, { ok: true, message: 'Forge API' });
  }

  // Get project context
  const ctx = getProjectContextSync();
  const worktreeRepoPath = ctx?.WORKTREE_REPO_PATH || WORKTREE_REPO_PATH;

  // If no project selected and no env fallback, show project picker
  if (!ctx && !WORKTREE_REPO_PATH) {
    const projects = await listProjects();
    return respondHtml(res, 200, renderProjectPickerPage(projects));
  }

  if (!worktreeRepoPath) {
    const configDir = process.env.FORGE_CONFIG_DIR || process.env.LOCAL_AGENT_CONFIG_DIR || process.cwd();
    const envPath = path.join(configDir, '.env');
    const envExamplePath = path.join(configDir, '.env.example');

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Forge Setup</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg: #080d1a;
      --panel: rgba(255, 255, 255, 0.05);
      --border: rgba(255, 255, 255, 0.1);
      --text: #e2e8f0;
      --muted: #94a3b8;
      --accent: #f97316;
      --accent-2: #22d3ee;
    }
    body {
      font-family: 'Space Grotesk', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background:
        radial-gradient(circle at 20% 20%, rgba(249, 115, 22, 0.14) 0, transparent 28%),
        radial-gradient(circle at 80% 10%, rgba(34, 211, 238, 0.16) 0, transparent 28%),
        linear-gradient(135deg, #0a0f1f 0%, #070b16 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: var(--text);
    }
    .container {
      background: var(--panel);
      border-radius: 16px;
      box-shadow: 0 28px 90px rgba(0,0,0,0.6);
      max-width: 760px;
      width: 100%;
      padding: 40px 42px;
      border: 1px solid var(--border);
      backdrop-filter: blur(14px);
    }
    h1 {
      color: var(--text);
      margin-bottom: 10px;
      font-size: 32px;
      letter-spacing: -0.02em;
    }
    .subtitle {
      color: var(--muted);
      margin-bottom: 30px;
      font-size: 16px;
    }
    .warning {
      background: linear-gradient(135deg, rgba(249, 115, 22, 0.18), rgba(34, 211, 238, 0.12));
      border-left: 4px solid var(--accent);
      padding: 15px;
      margin-bottom: 25px;
      border-radius: 10px;
      color: var(--text);
    }
    .warning strong {
      display: block;
      margin-bottom: 5px;
      color: #ffedd5;
      letter-spacing: 0.01em;
    }
    .section {
      margin-bottom: 30px;
    }
    .section h2 {
      color: var(--text);
      font-size: 20px;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .step {
      background: rgba(255,255,255,0.04);
      padding: 18px 20px;
      border-radius: 12px;
      margin-bottom: 15px;
      border: 1px solid var(--border);
    }
    .step-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, #f97316, #fb923c);
      color: #0b0f1a;
      border-radius: 50%;
      font-weight: bold;
      margin-right: 10px;
      font-size: 14px;
      box-shadow: 0 10px 30px rgba(249, 115, 22, 0.3);
    }
    .code {
      background: #0b1224;
      color: var(--text);
      padding: 12px 15px;
      border-radius: 10px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 13px;
      overflow-x: auto;
      margin: 10px 0;
      position: relative;
      border: 1px solid var(--border);
    }
    .code-label {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
      font-weight: 700;
    }
    .path {
      color: var(--accent-2);
      font-weight: 700;
      word-break: break-all;
    }
    ul {
      margin-left: 20px;
      margin-top: 10px;
      color: var(--muted);
    }
    li {
      margin-bottom: 8px;
      line-height: 1.6;
    }
    .required {
      color: #fbbf24;
      font-weight: 700;
    }
    .help {
      background: rgba(255,255,255,0.04);
      border-left: 4px solid var(--accent-2);
      padding: 15px;
      margin-top: 25px;
      border-radius: 12px;
      font-size: 14px;
      color: var(--muted);
      border: 1px solid var(--border);
    }
    .help strong {
      color: var(--accent-2);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>⚙️ Forge Setup</h1>
    <p class="subtitle">Forge needs a few details before it can spin up your worktrees.</p>

    <div class="warning">
      <strong>Missing Configuration</strong>
      The .env configuration file was not found or WORKTREE_REPO_PATH is not set.
    </div>

    <div class="section">
      <h2><span class="step-number">1</span> Create Configuration File</h2>
      <div class="step">
        <p>Create a <code>.env</code> file in the following location:</p>
        <div class="code-label">Configuration Directory</div>
        <div class="code">${configDir}</div>
        <p style="margin-top: 15px;">You can copy the example file to get started:</p>
        <div class="code">cp "${envExamplePath}" "${envPath}"</div>
      </div>
    </div>

    <div class="section">
      <h2><span class="step-number">2</span> Configure Required Settings</h2>
      <div class="step">
        <p>Edit the <code>.env</code> file and set these <span class="required">required</span> values:</p>
        <div class="code">
# Repository containing your git worktrees
WORKTREE_REPO_PATH=/path/to/your/git/repository

# Optional: Port for the Forge server (default: 4665)
LOCAL_AGENT_PORT=4665
        </div>
        <p style="margin-top: 15px;"><strong>WORKTREE_REPO_PATH</strong> should point to the git repository where you want to manage worktrees.</p>
      </div>
    </div>

    <div class="section">
      <h2><span class="step-number">3</span> Optional Configuration</h2>
      <div class="step">
        <p>Additional settings you can configure:</p>
        <ul>
          <li><strong>LOCAL_REPO_PATH</strong> - Base project path for worktrees</li>
          <li><strong>GITHUB_TOKEN</strong> - For GitHub PR integration</li>
          <li><strong>GITHUB_REPO_OWNER</strong> - Your GitHub username/org</li>
          <li><strong>GITHUB_REPO_NAME</strong> - Your GitHub repository name</li>
          <li><strong>LINEAR_APP</strong> - Linear API key for Linear integration</li>
        </ul>
      </div>
    </div>

    <div class="help">
      <strong>💡 Need Help?</strong><br>
      After creating your .env file, restart Forge to apply the configuration.
      Check the .env.example file for all available configuration options.
    </div>
  </div>
</body>
</html>`;
    return respondHtml(res, 200, html);
  }

  try {
    // Get projects for selector first (needed for Linear filtering)
    const projects = await listProjects();
    const activeProject = await getActiveProject();

    // Load project-specific env vars from .forge file
    const projectEnv = await getActiveProjectEnv();

    // Collect data
    const worktrees = await getWorktrees();
    const existingBranches = new Set(worktrees.map(wt => wt.branch));
    const openPRs = await getOpenPRs(existingBranches, projectEnv, activeProject);
    const linearIssues = await getLinearIssues(existingBranches, activeProject, projectEnv);
    const tmuxSessions = await getTmuxSessions(worktrees);

    // Check tool installations in parallel
    const [meldInstalled, tmuxInstalled, claudeInstalled] = await Promise.all([
      checkMeldInstalled(),
      checkTmuxInstalled(),
      checkClaudeInstalled()
    ]);
    const toolStatus = { meldInstalled, tmuxInstalled, claudeInstalled };

    // Render HTML
    const dashboardUrls = {
      datadog: process.env.DATADOG_DASHBOARD_URL || '',
      sentry: process.env.SENTRY_DASHBOARD_URL || ''
    };
    const html = renderRootPage(worktrees, openPRs, linearIssues, tmuxSessions, LOCAL_DEV_URL, dashboardUrls, projects, activeProject, toolStatus);
    return respondHtml(res, 200, html);
  } catch (err) {
    console.error('Error rendering root page:', err);
    return respondHtml(res, 500, `<h1>Error</h1><p>${err.message}</p>`);
  }
}

async function getWorktrees() {
  // Get worktree repo path from project context or env
  const ctx = getProjectContextSync();
  const worktreeRepoPath = ctx?.WORKTREE_REPO_PATH || WORKTREE_REPO_PATH;

  if (!worktreeRepoPath) {
    return [];
  }

  const list = await runCommand('git', ['worktree', 'list', '--porcelain'], { cwd: worktreeRepoPath });
  const worktrees = [];

  if (list.code === 0) {
    const lines = list.stdout.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('worktree ')) {
        const worktreePath = lines[i].slice('worktree '.length).trim();
        const branchLine = lines.find((line, idx) => idx > i && line.startsWith('branch '));
        const branch = branchLine ? branchLine.replace('branch refs/heads/', '').trim() : 'unknown';

        // Skip main repo worktree
        if (worktreePath === worktreeRepoPath) continue;

        // Skip hidden worktrees
        const hiddenMarker = path.join(worktreePath, '.hidden');
        if (exists(hiddenMarker)) continue;

        // Skip entries that no longer exist on disk
        if (!fs.existsSync(worktreePath)) {
          console.warn(`⚠️  Skipping missing worktree path: ${worktreePath}`);
          continue;
        }

        // Get folder age
        const stats = fs.statSync(worktreePath);
        const createdAt = stats.birthtime || stats.mtime;
        const ageInDays = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

        worktrees.push({
          path: worktreePath,
          branch,
          title: branch,
          description: 'Loading...',
          ageInDays
        });
      }
    }
  }

  return worktrees;
}

async function getOpenPRs(existingBranches, projectEnv = null, activeProject = null) {
  try {
    const baseBranch = process.env.DEFAULT_BASE_BRANCH || 'main';
    const opts = {
      owner: activeProject?.githubOwner || null,
      repo: activeProject?.githubRepo || null,
      token: projectEnv?.GITHUB_TOKEN || null
    };
    const prs = await getOpenPRsToBase(baseBranch, opts);
    return prs
      .filter(pr => !existingBranches.has(pr.head.ref))
      .map(pr => ({
        branch: pr.head.ref,
        title: pr.title,
        url: pr.html_url,
        number: pr.number,
        author: pr.user.login
      }));
  } catch (err) {
    console.log('⚠️ Could not fetch open PRs:', err.message);
    return [];
  }
}

function slugify(text) {
  if (!text || typeof text !== 'string') {
    return 'untitled';
  }
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50) || 'untitled';
}

async function getLinearIssues(existingBranches, activeProject = null, projectEnv = null) {
  // Use project-specific env vars if available, fall back to global
  const apiKey = projectEnv?.LINEAR_APP || LINEAR_API_KEY;
  const username = projectEnv?.LINEAR_USERNAME || LINEAR_USERNAME;

  if (!apiKey || !username) {
    console.log('⚠️ [Linear] Missing LINEAR_APP or LINEAR_USERNAME');
    return [];
  }

  try {
    // Pass the active project's Linear project name for filtering
    const linearProjectName = activeProject?.name || null;
    const issues = await getUserAssignedIssues(username, linearProjectName, apiKey);
    // Filter out issues that already have worktrees
    return issues
      .filter(issue => {
        // Check Linear's branchName first (if Linear set it)
        if (issue.branchName && existingBranches.has(issue.branchName)) {
          return false;
        }

        // Generate parameterized branch name to match what we create
        const titleSlug = slugify(issue.title);
        const parameterizedBranch = `feature/${issue.identifier.toLowerCase()}-${titleSlug}`;

        return !existingBranches.has(parameterizedBranch);
      })
      .map(issue => ({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        state: issue.state?.name || 'Unknown',
        priority: issue.priority,
        branchName: issue.branchName
      }));
  } catch (err) {
    console.log('⚠️ Could not fetch Linear issues:', err.message);
    return [];
  }
}

async function getTmuxSessions(worktrees) {
  const sessions = [];

  let tmuxListResult;
  try {
    tmuxListResult = await runCommand('tmux', ['list-sessions', '-F', '#{session_name}']);
  } catch (err) {
    // tmux not installed or not available, return empty sessions
    return sessions;
  }

  if (tmuxListResult.code === 0 && tmuxListResult.stdout.trim()) {
    const sessionNames = tmuxListResult.stdout.trim().split('\n');
    sessionNames.forEach(name => {
      if (name) {
        const sessionName = name.trim();
        const ticketMatch = sessionName.match(/^([A-Z]+-\d+)/);
        const ticketId = ticketMatch ? ticketMatch[1] : null;

        let title = sessionName;
        let type = '';

        if (ticketId) {
          if (sessionName.endsWith('-claude')) {
            type = 'Claude';
          } else if (sessionName.endsWith('-dev')) {
            type = 'Dev Server';
          }

          const matchingWorktree = worktrees.find(wt => wt.branch.startsWith(ticketId));
          if (matchingWorktree) {
            title = `${ticketId} - ${matchingWorktree.title}`;
            if (type) title += ` (${type})`;
          }
        }

        sessions.push({ name: sessionName, displayTitle: title });
      }
    });
  }

  return sessions;
}

function renderProjectPickerPage(projects) {
  const projectRows = projects.map(p => `
    <div class="project-card ${p.isActive ? 'active' : ''}" onclick="selectProject('${p.name}')">
      <div class="project-icon">📁</div>
      <div class="project-info">
        <div class="project-name">${p.name}</div>
        <div class="project-path">${p.repoPath}</div>
        ${p.githubOwner ? `<div class="project-github">GitHub: ${p.githubOwner}/${p.githubRepo || p.name}</div>` : ''}
      </div>
      ${p.isActive ? '<div class="active-badge">Active</div>' : ''}
    </div>
  `).join('');

  const emptyState = projects.length === 0 ? `
    <div class="empty-state">
      <div class="empty-icon">🔍</div>
      <h3>No projects detected</h3>
      <p>No git repositories were found in ~/src/</p>
      <button onclick="scanProjects()" class="scan-btn">🔄 Scan for Projects</button>
    </div>
  ` : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Forge - Select Project</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
    :root {
      --bg: #080d1a;
      --panel: rgba(255,255,255,0.05);
      --panel-strong: rgba(255,255,255,0.08);
      --border: rgba(255,255,255,0.1);
      --text: #e2e8f0;
      --muted: #94a3b8;
      --accent: #f97316;
      --accent-2: #22d3ee;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Space Grotesk', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background:
        radial-gradient(circle at 20% 20%, rgba(249, 115, 22, 0.14) 0, transparent 28%),
        radial-gradient(circle at 80% 10%, rgba(34, 211, 238, 0.16) 0, transparent 28%),
        linear-gradient(135deg, #0a0f1f 0%, #070b16 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: var(--text);
    }
    .container {
      background: var(--panel);
      border-radius: 16px;
      box-shadow: 0 28px 90px rgba(0,0,0,0.6);
      max-width: 820px;
      width: 100%;
      padding: 40px;
      border: 1px solid var(--border);
      backdrop-filter: blur(12px);
    }
    h1 {
      color: var(--text);
      margin-bottom: 8px;
      font-size: 28px;
      letter-spacing: -0.02em;
    }
    .subtitle {
      color: var(--muted);
      margin-bottom: 30px;
      font-size: 16px;
    }
    .project-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 24px;
    }
    .project-card {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
      border: 1px solid var(--border);
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
      background: var(--panel);
      box-shadow: 0 12px 30px rgba(0,0,0,0.35);
    }
    .project-card:hover {
      border-color: rgba(249, 115, 22, 0.5);
      background: var(--panel-strong);
      transform: translateY(-1px);
    }
    .project-card.active {
      border-color: rgba(34, 211, 238, 0.6);
      background: var(--panel-strong);
    }
    .project-icon {
      font-size: 32px;
    }
    .project-info {
      flex: 1;
    }
    .project-name {
      font-weight: 700;
      font-size: 18px;
      color: var(--text);
      letter-spacing: -0.01em;
    }
    .project-path {
      font-size: 13px;
      color: var(--muted);
      margin-top: 4px;
      font-family: 'Monaco', 'Menlo', monospace;
    }
    .project-github {
      font-size: 12px;
      color: var(--muted);
      margin-top: 4px;
    }
    .active-badge {
      background: var(--accent-2);
      color: #04131f;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      box-shadow: 0 10px 25px rgba(34, 211, 238, 0.35);
    }
    .actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }
    .scan-btn {
      background: var(--panel-strong);
      color: var(--text);
      border: 1px solid var(--border);
      padding: 10px 20px;
      border-radius: 10px;
      font-size: 14px;
      cursor: pointer;
      font-weight: 700;
      letter-spacing: 0.01em;
      transition: all 0.2s;
    }
    .scan-btn:hover {
      border-color: rgba(249, 115, 22, 0.45);
      transform: translateY(-1px);
      box-shadow: 0 10px 28px rgba(0,0,0,0.35);
    }
    .empty-state {
      text-align: center;
      padding: 40px;
      color: var(--muted);
      background: var(--panel-strong);
      border: 1px dashed var(--border);
      border-radius: 12px;
    }
    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    .empty-state h3 {
      margin-bottom: 8px;
      color: var(--text);
    }
    .empty-state .scan-btn {
      margin-top: 20px;
    }
    .loading {
      opacity: 0.5;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div class="container" id="container">
    <h1>📁 Select a Project</h1>
    <p class="subtitle">Choose which project to work with</p>

    <div class="project-list" id="project-list">
      ${projects.length > 0 ? projectRows : emptyState}
    </div>

    <div class="actions">
      <button onclick="scanProjects()" class="scan-btn">🔄 Rescan ~/src</button>
    </div>
  </div>

  <script>
    async function selectProject(name) {
      const container = document.getElementById('container');
      container.classList.add('loading');

      try {
        const res = await fetch('/api/projects/active', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project: name })
        });

        if (res.ok) {
          window.location.reload();
        } else {
          const data = await res.json();
          alert('Failed to select project: ' + data.error);
          container.classList.remove('loading');
        }
      } catch (err) {
        alert('Error: ' + err.message);
        container.classList.remove('loading');
      }
    }

    async function scanProjects() {
      const container = document.getElementById('container');
      container.classList.add('loading');

      try {
        const res = await fetch('/api/projects/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
          window.location.reload();
        } else {
          const data = await res.json();
          alert('Failed to scan: ' + data.error);
          container.classList.remove('loading');
        }
      } catch (err) {
        alert('Error: ' + err.message);
        container.classList.remove('loading');
      }
    }
  </script>
</body>
</html>`;
}
