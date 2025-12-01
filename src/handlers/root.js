import fs from 'fs';
import path from 'path';
import { respond, respondHtml } from '../utils/http.js';
import { runCommand } from '../utils/command.js';
import { exists } from '../services/worktree.js';
import { getOpenPRsToBase } from '../services/github.js';
import { getUserAssignedIssues } from '../services/linear.js';
import { renderRootPage } from '../views/root.js';
import { WORKTREE_REPO_PATH, LOCAL_DEV_URL, LINEAR_API_KEY, LINEAR_USERNAME } from '../config/env.js';
import { getProjectContextSync, listProjects, getActiveProject } from '../services/projects.js';

export async function handleRoot(req, res) {
  const accept = (req.headers['accept'] || '').toString();
  const wantsHtml = accept.includes('text/html');

  if (!wantsHtml) {
    return respond(res, 200, { ok: true, message: 'Local Agent API' });
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
    const configDir = process.env.LOCAL_AGENT_CONFIG_DIR || process.cwd();
    const envPath = path.join(configDir, '.env');
    const envExamplePath = path.join(configDir, '.env.example');

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Local Agent - Setup Required</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      color: #333;
    }
    .container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 700px;
      width: 100%;
      padding: 40px;
    }
    h1 {
      color: #667eea;
      margin-bottom: 10px;
      font-size: 32px;
    }
    .subtitle {
      color: #666;
      margin-bottom: 30px;
      font-size: 16px;
    }
    .warning {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin-bottom: 25px;
      border-radius: 4px;
    }
    .warning strong {
      display: block;
      margin-bottom: 5px;
      color: #856404;
    }
    .section {
      margin-bottom: 30px;
    }
    .section h2 {
      color: #333;
      font-size: 20px;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .step {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 15px;
    }
    .step-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: #667eea;
      color: white;
      border-radius: 50%;
      font-weight: bold;
      margin-right: 10px;
      font-size: 14px;
    }
    .code {
      background: #2d2d2d;
      color: #f8f8f2;
      padding: 12px 15px;
      border-radius: 6px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 13px;
      overflow-x: auto;
      margin: 10px 0;
      position: relative;
    }
    .code-label {
      color: #888;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
      font-weight: 600;
    }
    .path {
      color: #667eea;
      font-weight: 600;
      word-break: break-all;
    }
    ul {
      margin-left: 20px;
      margin-top: 10px;
    }
    li {
      margin-bottom: 8px;
      line-height: 1.6;
    }
    .required {
      color: #dc3545;
      font-weight: 600;
    }
    .help {
      background: #e7f3ff;
      border-left: 4px solid #0066cc;
      padding: 15px;
      margin-top: 25px;
      border-radius: 4px;
      font-size: 14px;
    }
    .help strong {
      color: #0066cc;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>⚙️ Local Agent Setup</h1>
    <p class="subtitle">Configuration required to start using Local Agent</p>

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

# Optional: Port for the local agent (default: 4665)
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
      After creating your .env file, restart the Local Agent app to apply the configuration.
      Check the .env.example file for all available configuration options.
    </div>
  </div>
</body>
</html>`;
    return respondHtml(res, 200, html);
  }

  try {
    // Collect data
    const worktrees = await getWorktrees();
    const existingBranches = new Set(worktrees.map(wt => wt.branch));
    const openPRs = await getOpenPRs(existingBranches);
    const linearIssues = await getLinearIssues(existingBranches);
    const tmuxSessions = await getTmuxSessions(worktrees);

    // Render HTML
    const dashboardUrls = {
      datadog: process.env.DATADOG_DASHBOARD_URL || '',
      sentry: process.env.SENTRY_DASHBOARD_URL || ''
    };
    const html = renderRootPage(worktrees, openPRs, linearIssues, tmuxSessions, LOCAL_DEV_URL, dashboardUrls);
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

async function getOpenPRs(existingBranches) {
  try {
    const baseBranch = process.env.DEFAULT_BASE_BRANCH || 'main';
    const prs = await getOpenPRsToBase(baseBranch);
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

async function getLinearIssues(existingBranches) {
  if (!LINEAR_API_KEY || !LINEAR_USERNAME) {
    return [];
  }

  try {
    const issues = await getUserAssignedIssues(LINEAR_USERNAME);
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
  <title>SDLC - Select Project</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      color: #333;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 800px;
      width: 100%;
      padding: 40px;
    }
    h1 {
      color: #667eea;
      margin-bottom: 8px;
      font-size: 28px;
    }
    .subtitle {
      color: #666;
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
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .project-card:hover {
      border-color: #667eea;
      background: #f8f9ff;
    }
    .project-card.active {
      border-color: #667eea;
      background: #f0f4ff;
    }
    .project-icon {
      font-size: 32px;
    }
    .project-info {
      flex: 1;
    }
    .project-name {
      font-weight: 600;
      font-size: 18px;
      color: #1f2937;
    }
    .project-path {
      font-size: 13px;
      color: #6b7280;
      margin-top: 4px;
      font-family: 'Monaco', 'Menlo', monospace;
    }
    .project-github {
      font-size: 12px;
      color: #9ca3af;
      margin-top: 4px;
    }
    .active-badge {
      background: #667eea;
      color: white;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
    .actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }
    .scan-btn {
      background: #f3f4f6;
      color: #374151;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      font-weight: 500;
    }
    .scan-btn:hover {
      background: #e5e7eb;
    }
    .empty-state {
      text-align: center;
      padding: 40px;
      color: #6b7280;
    }
    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    .empty-state h3 {
      margin-bottom: 8px;
      color: #374151;
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
