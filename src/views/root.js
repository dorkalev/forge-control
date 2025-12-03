import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Root page view with complete original UI design

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadRocketIconDataUrl() {
  const candidates = [];
  if (process.env.FORGE_ICON_PATH) candidates.push(process.env.FORGE_ICON_PATH);
  candidates.push(path.resolve(process.cwd(), 'electron', 'icon.png'));
  candidates.push(path.resolve(__dirname, '..', '..', 'electron', 'icon.png'));

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const base64 = fs.readFileSync(candidate).toString('base64');
        return `data:image/png;base64,${base64}`;
      }
    } catch (err) {
      console.warn(`⚠️ Could not load rocket icon from ${candidate}: ${err.message}`);
    }
  }

  return '';
}

const rocketIconDataUrl = loadRocketIconDataUrl();

export function renderRootPage(worktrees, openPRs, linearIssues, tmuxSessions, localDevUrl = 'http://localhost:8001', dashboardUrls = {}, projects = [], activeProject = null, toolStatus = {}) {
  const { meldInstalled = true, tmuxInstalled = true, claudeInstalled = true } = toolStatus;

  // Generate project selector options
  const projectOptions = projects.map(p => `
    <div class="project-option ${p.isActive ? 'active' : ''}" onclick="switchProject('${p.key}')">
      <span class="check">${p.isActive ? '✓' : ''}</span>
      <div class="info">
        <div class="name">${p.name}</div>
        <div class="path">${p.folderName}</div>
      </div>
    </div>
  `).join('');

  const activeProjectName = activeProject?.name || activeProject?.key || 'No Project';

  const worktreeRows = worktrees.map(wt => {
    const ageClass = wt.ageInDays > 21 ? 'age-old' : wt.ageInDays > 14 ? 'age-warning' : 'age-fresh';
    const ageText = wt.ageInDays === 0 ? 'Today' : wt.ageInDays === 1 ? '1 day' : `${wt.ageInDays} days`;
    const ticketMatch = wt.branch.match(/^([A-Z]+-\d+)/);
    const ticketId = ticketMatch ? ticketMatch[1] : '';
    const branchId = wt.branch.replace(/[^a-zA-Z0-9]/g, '-');
    const folderName = wt.path.split('/').pop();
    
    return `
    <tr data-branch="${branchId}" data-folder="${folderName}" data-path="${wt.path}">
      <td class="info-cell">
        <div class="info-header">
          <span class="title">${wt.title}</span>
          <a href="#" class="ticket-btn" id="ticket-btn-${branchId}">${ticketId}</a>
        </div>
        <div class="description">${wt.description}</div>
        <div class="branch-path">${wt.path}</div>
      </td>
      <td class="status-cell" id="status-${branchId}">
        <span class="status-badge status-loading">Loading...</span>
      </td>
      <td class="age-cell"><span class="age-badge ${ageClass}">${ageText}</span></td>
      <td class="actions-cell">
        <button onclick="runDev('${wt.path}', '${wt.branch}', '${wt.title.replace(/'/g, "\\'")}', '${ticketId}')" class="action-btn btn-run" title="Run ./stop.sh && ./dev">▶ Run</button>
        <button onclick="openTerminal('${wt.path}')" class="action-btn btn-warp" title="Open in Warp">⌘ Warp</button>
        <button onclick="openClaude('${wt.path}', '${wt.branch}', '${wt.title.replace(/'/g, "\\'")}', '${ticketId}')" class="action-btn btn-claude" title="Open Claude">🤖 Claude</button>
        <button onclick="openInFinder('${wt.path}')" class="action-btn btn-finder" title="Open in Finder">📁 Finder</button>
        <button onclick="openMeld('${wt.path}')" class="action-btn btn-meld" title="Open in Meld">📊 Meld</button>
        <button onclick="cleanupBranch('${wt.path}', '${wt.branch}', '${ticketId}')" class="action-btn btn-cleanup" style="display: none;" title="Delete branch and worktree">🗑 Cleanup!</button>
        <button onclick="hideWorktree('${wt.path}', '${wt.branch}')" class="action-btn btn-hide" title="Hide worktree">👁 Hide</button>
      </td>
    </tr>`;
  }).join('');

  const prRows = openPRs.map(pr => {
    const prId = pr.branch.replace(/[^a-zA-Z0-9]/g, '-');
    return `
    <tr>
      <td colspan="3" style="padding: 12px; color: var(--text);">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="flex: 1;">
            <a href="${pr.url}" target="_blank" style="color: var(--accent-2); text-decoration: none; font-weight: 700;">
              ${pr.title}
            </a>
            <div style="font-size: 12px; color: var(--muted); margin-top: 4px;">
              <strong>${pr.branch}</strong> (#${pr.number} by ${pr.author})
            </div>
          </div>
        </div>
      </td>
      <td class="actions-cell">
        <button onclick="createWorktree('${pr.branch}')" class="action-btn btn-run" id="create-${prId}">✨ Worktree</button>
      </td>
    </tr>`;
  }).join('');

  const linearIssueRows = linearIssues.map(issue => {
    const issueId = issue.identifier.replace(/[^a-zA-Z0-9]/g, '-');
    const branch = issue.branchName || issue.identifier.toLowerCase().replace(/-/g, '_');
    const priorityEmoji = issue.priority === 1 ? '🔥' : issue.priority === 2 ? '⚠️' : issue.priority === 3 ? '📌' : '🔵';

    // Generate parameterized branch name: feature/{identifier}-{slugified-title}
    const titleSlug = issue.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 50);
    const parameterizedBranch = 'feature/' + issue.identifier.toLowerCase() + '-' + titleSlug;

    return `
    <tr data-issue-id="${issueId}">
      <td colspan="3" style="padding: 12px; color: var(--text);">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span>${priorityEmoji}</span>
          <div style="flex: 1;">
            <a href="${issue.url}" target="_blank" style="color: var(--accent-2); text-decoration: none; font-weight: 700;">
              ${issue.identifier}: ${issue.title}
            </a>
            <div style="font-size: 12px; color: var(--muted); margin-top: 4px;">
              <strong id="branch-name-${issueId}">Checking...</strong> · ${issue.state}
            </div>
          </div>
        </div>
      </td>
      <td class="actions-cell">
        <button
          id="btn-linear-${issueId}"
          data-issue-id="${issue.id || issue.identifier}"
          data-issue-identifier="${issue.identifier}"
          data-branch="${parameterizedBranch}"
          data-title="${issue.title.replace(/"/g, '&quot;')}"
          class="action-btn btn-run"
          style="display: none;">
          Loading...
        </button>
      </td>
    </tr>`;
  }).join('');

  const sessionRows = tmuxSessions.map(s => `
    <tr>
      <td style="padding: 12px; color: var(--text);">${s.displayTitle}</td>
      <td class="actions-cell">
        <button onclick="attachTmux('${s.name}')" class="action-btn btn-attach">📎 Attach</button>
        <button onclick="killTmux('${s.name}')" class="action-btn btn-danger">❌ Kill</button>
      </td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Forge Control Deck</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
    :root {
      --bg: #080d1a;
      --panel: rgba(255, 255, 255, 0.04);
      --panel-strong: rgba(255, 255, 255, 0.07);
      --border: rgba(255, 255, 255, 0.1);
      --text: #e2e8f0;
      --muted: #94a3b8;
      --muted-strong: #cbd5e1;
      --accent: #f97316;
      --accent-2: #22d3ee;
      --success: #22c55e;
      --warning: #f59e0b;
      --danger: #f43f5e;
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Space Grotesk', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      margin: 0; padding: 0;
      background:
        radial-gradient(circle at 20% 20%, rgba(249, 115, 22, 0.18) 0, transparent 30%),
        radial-gradient(circle at 80% 10%, rgba(34, 211, 238, 0.18) 0, transparent 28%),
        linear-gradient(135deg, #0a0f1f 0%, #070b16 100%);
      color: var(--text);
      min-height: 100vh;
    }
    .titlebar {
      -webkit-app-region: drag;
      user-select: none;
      height: 40px;
      background: linear-gradient(90deg, rgba(249, 115, 22, 0.14), rgba(34, 211, 238, 0.12));
      backdrop-filter: blur(10px);
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 1000;
      border-bottom: 1px solid var(--border);
    }
    .logo-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .logo-img {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      box-shadow: none;
      border: none;
      margin-top: 2px;
      object-fit: cover;
    }
    .logo-fallback {
      font-size: 32px;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 24px;
      padding-top: 72px;
    }
    .app-drag-region {
      -webkit-app-region: drag;
      user-select: none;
    }
    .button, .input, button, input, a {
      -webkit-app-region: no-drag;
    }
    .header {
      background: linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03));
      padding: 24px 28px;
      border-radius: 16px;
      box-shadow: 0 16px 60px rgba(0, 0, 0, 0.45);
      border: 1px solid var(--border);
      backdrop-filter: blur(10px);
      margin-bottom: 26px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: relative;
      z-index: 100;
    }
    h1 { margin: 0; color: var(--text); font-size: 26px; letter-spacing: -0.02em; line-height: 1.1; }
    .subtitle { color: var(--muted); margin-top: 4px; font-size: 13px; }
    .project-selector {
      position: relative;
      display: inline-block;
    }
    .project-selector-btn {
      background: var(--panel-strong);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 8px 14px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
    }
    .project-selector-btn:hover {
      border-color: rgba(249, 115, 22, 0.6);
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
    }
    .project-selector-btn .project-name {
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .project-dropdown {
      display: none;
      position: absolute;
      top: 100%;
      left: 0;
      margin-top: 6px;
      background: #0b1121;
      border: 1px solid var(--border);
      border-radius: 12px;
      min-width: 280px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      z-index: 9999;
      overflow: hidden;
    }
    .project-dropdown.open {
      display: block;
    }
    .project-option {
      padding: 12px 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: background 0.15s;
      border-bottom: 1px solid var(--border);
    }
    .project-option:last-child {
      border-bottom: none;
    }
    .project-option:hover {
      background: var(--panel-strong);
    }
    .project-option.active {
      background: rgba(34, 211, 238, 0.12);
    }
    .project-option .check {
      width: 20px;
      color: var(--accent-2);
      font-weight: bold;
    }
    .project-option .info {
      flex: 1;
    }
    .project-option .name {
      font-weight: 600;
      color: var(--text);
      font-size: 14px;
    }
    .project-option .path {
      font-size: 11px;
      color: var(--muted);
      font-family: 'Monaco', 'Menlo', monospace;
      margin-top: 2px;
    }
    .header-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .header-btn {
      background: var(--panel);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 10px 16px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      letter-spacing: 0.01em;
    }
    .header-btn:hover {
      border-color: rgba(249, 115, 22, 0.6);
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      transform: translateY(-1px);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--panel);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 14px 50px rgba(0,0,0,0.35);
      border: 1px solid var(--border);
    }
    th, td {
      padding: 14px;
      text-align: left;
      border-bottom: 1px solid var(--border);
      color: var(--text);
    }
    th {
      background: var(--panel-strong);
      font-weight: 700;
      font-size: 12px;
      color: var(--muted-strong);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .info-cell {
      width: 48%;
    }
    .info-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 6px;
    }
    .title {
      font-weight: 700;
      font-size: 15px;
      color: var(--text);
    }
    .ticket-btn {
      background: var(--accent);
      color: #0b0f1a;
      padding: 4px 10px;
      border-radius: 8px;
      font-size: 12px;
      text-decoration: none;
      font-weight: 700;
      letter-spacing: 0.02em;
      border: 1px solid rgba(0,0,0,0.12);
      box-shadow: 0 10px 30px rgba(249, 115, 22, 0.25);
    }
    .ticket-btn:hover {
      background: #fb923c;
    }
    .description {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.5;
    }
    .branch-path {
      font-size: 11px;
      color: var(--muted-strong);
      margin-top: 4px;
      font-family: 'Monaco', 'Menlo', monospace;
      letter-spacing: 0.03em;
    }
    .copy-btn {
      background: transparent;
      border: 1px solid var(--border);
      cursor: pointer;
      font-size: 14px;
      padding: 4px 6px;
      border-radius: 6px;
      color: var(--muted);
      margin-left: 8px;
      transition: all 0.2s;
    }
    .copy-btn:hover {
      color: var(--text);
      border-color: rgba(249, 115, 22, 0.7);
    }
    .status-cell {
      width: 20%;
      font-size: 12px;
    }
    .status-badge {
      display: inline-block;
      padding: 5px 11px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 700;
      margin: 2px 4px 2px 0;
      border: 1px solid var(--border);
      letter-spacing: 0.02em;
    }
    .status-loading { background: rgba(255,255,255,0.06); color: var(--muted); }
    .status-linear-done { background: rgba(34,197,94,0.18); color: #bbf7d0; border-color: rgba(34,197,94,0.35); }
    .status-linear-progress { background: rgba(56,189,248,0.18); color: #bae6fd; border-color: rgba(56,189,248,0.4); }
    .status-linear-backlog { background: rgba(255,255,255,0.06); color: var(--muted-strong); }
    .status-linear-default { background: rgba(249,115,22,0.18); color: #ffd7b3; border-color: rgba(249,115,22,0.35); }
    .status-github-open { background: rgba(34,197,94,0.18); color: #bbf7d0; border-color: rgba(34,197,94,0.35); }
    .status-github-merged { background: rgba(34,211,238,0.18); color: #cffafe; border-color: rgba(34,211,238,0.35); }
    .status-github-draft { background: rgba(148,163,184,0.18); color: #e2e8f0; border-color: rgba(148,163,184,0.35); }
    .status-wip { background: rgba(249,115,22,0.2); color: #fed7aa; font-weight: 800; border-color: rgba(249,115,22,0.5); }
    .status-sync { background: rgba(34,211,238,0.2); color: #cffafe; border-color: rgba(34,211,238,0.5); cursor: pointer; }
    .status-sync:hover { background: rgba(34,211,238,0.35); }
    .status-conflict { background: rgba(244,63,94,0.2); color: #fecdd3; border-color: rgba(244,63,94,0.5); }
    .status-render-building { background: rgba(245,158,11,0.15); color: #fde68a; }
    .status-render-failed { background: rgba(244,63,94,0.2); color: #fecdd3; border-color: rgba(244,63,94,0.4); }
    .status-render-suspended { background: rgba(148,163,184,0.18); color: #e2e8f0; }
    .render-service { padding: 8px 12px; border-bottom: 1px solid var(--border); }
    .render-service:last-child { border-bottom: none; }
    .render-service-name { font-weight: 600; color: var(--text); font-size: 14px; }
    .render-service-name a:hover { text-decoration: underline; color: var(--accent-2); }
    .render-service-meta { font-size: 12px; color: var(--muted); margin-top: 4px; }
    .age-cell {
      width: 10%;
    }
    .age-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 600;
      border: 1px solid var(--border);
    }
    .age-fresh { background: rgba(34,197,94,0.16); color: #bbf7d0; border-color: rgba(34,197,94,0.3); }
    .age-warning { background: rgba(245,158,11,0.16); color: #fde68a; border-color: rgba(245,158,11,0.3); }
    .age-old { background: rgba(244,63,94,0.16); color: #fecdd3; border-color: rgba(244,63,94,0.3); }
    .actions-cell {
      white-space: normal;
      width: 237px;
      max-width: 237px;
    }
    .action-btn {
      background: var(--panel-strong);
      border: 1px solid var(--border);
      padding: 9px 8px;
      border-radius: 8px;
      font-size: 11px;
      cursor: pointer;
      margin: 3px;
      color: var(--text);
      font-weight: 600;
      transition: all 0.2s;
      display: inline-block;
      width: 108px;
      text-align: center;
      letter-spacing: 0.02em;
    }
    .action-btn:hover {
      border-color: rgba(249,115,22,0.5);
      transform: translateY(-1px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
    }
    .btn-run {
      background: linear-gradient(135deg, #f97316, #fb923c);
      color: #0b0f1a;
      border: 1px solid #ffedd5;
    }
    .btn-run:hover {
      border-color: #fecdd3;
    }
    .btn-claude {
      background: linear-gradient(135deg, #22d3ee, #38bdf8);
      color: #04131f;
      border: 1px solid rgba(56,189,248,0.35);
    }
    .btn-warp {
      background: linear-gradient(135deg, #22c55e, #16a34a);
      color: #04120c;
      border: 1px solid rgba(34,197,94,0.4);
    }
    .btn-finder {
      background: linear-gradient(135deg, #f59e0b, #fbbf24);
      color: #0f0a02;
      border: 1px solid rgba(245,158,11,0.4);
    }
    .btn-meld {
      background: linear-gradient(135deg, #8b5cf6, #a78bfa);
      color: #0f0a1f;
      border: 1px solid rgba(139,92,246,0.4);
    }
    .btn-hide {
      background: linear-gradient(135deg, #475569, #334155);
      color: #e2e8f0;
      border: 1px solid rgba(148,163,184,0.4);
    }
    .btn-cleanup {
      background: linear-gradient(135deg, #f43f5e, #fb7185);
      color: #0f0610;
      border: 1px solid rgba(244,63,94,0.45);
    }
    .btn-danger {
      background: linear-gradient(135deg, #f43f5e, #fb7185);
      color: #0f0610;
      border: 1px solid rgba(244,63,94,0.45);
    }
    .btn-attach {
      background: linear-gradient(135deg, #22d3ee, #38bdf8);
      color: #04131f;
      border: 1px solid rgba(34,211,238,0.45);
    }
    .section {
      margin-bottom: 26px;
    }
    .section-header {
      background: linear-gradient(90deg, rgba(249,115,22,0.12), rgba(34,211,238,0.12));
      padding: 16px 24px;
      border-radius: 12px 12px 0 0;
      font-size: 17px;
      font-weight: 700;
      color: var(--text);
      backdrop-filter: blur(10px);
      border: 1px solid var(--border);
      border-bottom: none;
      letter-spacing: 0.01em;
    }
    .section table {
      border-radius: 0 0 12px 12px;
    }
    .modal {
      display: none;
      position: fixed;
      z-index: 2000;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0,0,0,0.6);
      backdrop-filter: blur(8px);
    }
    .modal-content {
      background: #0b1121;
      margin: 5% auto;
      padding: 0;
      border-radius: 14px;
      width: 80%;
      max-width: 900px;
      max-height: 80vh;
      overflow: hidden;
      box-shadow: 0 30px 80px rgba(0,0,0,0.5);
      border: 1px solid var(--border);
    }
    .modal-header {
      background: linear-gradient(135deg, #f97316, #22d3ee);
      color: #0b0f1a;
      padding: 20px 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-header h2 {
      margin: 0;
      font-size: 22px;
      letter-spacing: -0.01em;
    }
    .modal-close {
      color: #0b0f1a;
      font-size: 28px;
      font-weight: bold;
      cursor: pointer;
      background: rgba(255,255,255,0.4);
      border: none;
      padding: 4px;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: background 0.2s;
    }
    .modal-close:hover {
      background: rgba(255,255,255,0.65);
    }
    .modal-body {
      padding: 28px;
      max-height: calc(80vh - 80px);
      overflow-y: auto;
      color: var(--text);
    }
    .issue-card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 12px;
      transition: all 0.2s;
      box-shadow: 0 12px 30px rgba(0,0,0,0.35);
    }
    .issue-card:hover {
      border-color: rgba(249,115,22,0.5);
      transform: translateY(-1px);
    }
    .issue-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
      gap: 12px;
    }
    .issue-title {
      font-weight: 700;
      font-size: 15px;
      color: var(--text);
      flex: 1;
    }
    .issue-id {
      background: var(--accent-2);
      color: #04131f;
      padding: 4px 10px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      box-shadow: 0 10px 25px rgba(34, 211, 238, 0.35);
    }
    .issue-description {
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 12px;
      line-height: 1.5;
    }
    .issue-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .issue-meta {
      display: flex;
      gap: 8px;
      font-size: 12px;
    }
    .issue-cycle {
      background: rgba(249,115,22,0.14);
      color: #ffedd5;
      padding: 4px 8px;
      border-radius: 6px;
    }
    .issue-state {
      background: rgba(34,211,238,0.14);
      color: #cffafe;
      padding: 4px 8px;
      border-radius: 6px;
    }
    .assign-btn {
      background: linear-gradient(135deg, #f97316, #fb923c);
      color: #0b0f1a;
      border: 1px solid rgba(249,115,22,0.45);
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      letter-spacing: 0.02em;
    }
    .assign-btn:hover {
      box-shadow: 0 10px 30px rgba(249,115,22,0.35);
      transform: translateY(-1px);
    }
    .assign-btn:disabled {
      background: rgba(148,163,184,0.3);
      border-color: rgba(148,163,184,0.4);
      color: #cbd5e1;
      cursor: not-allowed;
    }
    .warning-banner {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(249, 115, 22, 0.15));
      border: 1px solid rgba(245, 158, 11, 0.4);
      border-radius: 12px;
      padding: 14px 20px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .warning-banner-content {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      color: #fde68a;
      font-size: 14px;
    }
    .warning-banner-content .warning-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .warning-banner-content code {
      background: rgba(0,0,0,0.3);
      padding: 4px 10px;
      border-radius: 6px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 13px;
      color: #fef3c7;
    }
    .warning-banner-close {
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      color: #fde68a;
      font-size: 18px;
      cursor: pointer;
      padding: 4px 10px;
      border-radius: 6px;
      transition: all 0.2s;
    }
    .warning-banner-close:hover {
      background: rgba(255,255,255,0.2);
    }
  </style>
</head>
<body>
  <div class="titlebar"></div>
  <div class="container">
    <div class="header">
      <div class="logo-row">
        ${rocketIconDataUrl ? `<img src="${rocketIconDataUrl}" alt="Forge logo" class="logo-img" />` : `<span class="logo-fallback">🚀</span>`}
        <div>
          <h1>Forge Control Deck</h1>
          <div class="subtitle">Branch faster, launch environments, and keep delivery humming.</div>
        </div>
        ${projects.length > 0 ? `
        <div class="project-selector" style="margin-left: 20px;">
          <button class="project-selector-btn" onclick="toggleProjectDropdown(event)">
            <span>📁</span>
            <span class="project-name">${activeProjectName}</span>
            <span>▼</span>
          </button>
          <div class="project-dropdown" id="projectDropdown">
            ${projectOptions}
          </div>
        </div>
        ` : ''}
      </div>
      <div class="header-actions">
        <button onclick="openInspector()" class="header-btn">🔍 Inspector</button>
        <button onclick="openLocalhost()" class="header-btn">🌐 Localhost</button>
        <button onclick="openLinearProject()" class="header-btn">📋 Linear</button>
        ${dashboardUrls.datadog ? `<button onclick="window.open('${dashboardUrls.datadog}', '_blank')" class="header-btn">📊 DataDog</button>` : ''}
        ${dashboardUrls.sentry ? `<button onclick="window.open('${dashboardUrls.sentry}', '_blank')" class="header-btn">🐛 Sentry</button>` : ''}
        <button onclick="showUnassignedIssues()" class="header-btn">📌 Unassigned</button>
        <button onclick="showIssuesDiff()" class="header-btn">📝 Release Notes</button>
        <button onclick="openAutopilotSettings()" id="autopilot-btn" class="header-btn">🤖 Autopilot: OFF</button>
        <button onclick="tileWindows()" class="header-btn">🎯 Tile iTerm</button>
        <button onclick="tileAllWindows()" class="header-btn">🪟 Tile All</button>
        <button onclick="location.reload()" class="header-btn">🔄 Refresh</button>
      </div>
    </div>

    ${(!meldInstalled || !tmuxInstalled || !claudeInstalled) ? `
    <div class="warning-banner" id="toolWarnings">
      <div class="warning-banner-content">
        <span>⚠️</span>
        <div class="warning-list">
          ${!claudeInstalled ? '<div>Claude Code CLI not found. Install from: <a href="https://claude.ai/download" target="_blank" style="color: #fef3c7;">claude.ai/download</a></div>' : ''}
          ${!tmuxInstalled ? '<div>tmux not found. <code>brew install tmux</code></div>' : ''}
          ${!meldInstalled ? '<div>Meld not found. <code>brew install meld</code></div>' : ''}
        </div>
      </div>
      <button class="warning-banner-close" onclick="dismissToolWarnings()">×</button>
    </div>
    ` : ''}

    <div class="section">
      <div class="section-header">📁 Active Worktrees (${worktrees.length})</div>
      <table>
        <thead><tr>
          <th>Ticket</th>
          <th>Status</th>
          <th>Age</th>
          <th>Actions</th>
        </tr></thead>
        <tbody>${worktreeRows || '<tr><td colspan="4" style="text-align: center; padding: 40px; color: var(--muted);">No worktrees found</td></tr>'}</tbody>
      </table>
    </div>

    ${openPRs.length > 0 ? `
    <div class="section">
      <div class="section-header">📋 Available PRs (No Worktree Yet) (${openPRs.length})</div>
      <table>
        <thead><tr>
          <th colspan="3">Pull Request</th>
          <th>Actions</th>
        </tr></thead>
        <tbody>${prRows}</tbody>
      </table>
    </div>` : ''}

    ${linearIssues.length > 0 ? `
    <div class="section">
      <div class="section-header">🎯 My Linear Issues (${linearIssues.length})</div>
      <table>
        <thead><tr>
          <th colspan="3">Issue</th>
          <th>Actions</th>
        </tr></thead>
        <tbody>${linearIssueRows}</tbody>
      </table>
    </div>` : ''}

    ${tmuxSessions.length > 0 ? `
    <div class="section">
      <div class="section-header">💻 Tmux Sessions (${tmuxSessions.length})</div>
      <table>
        <thead><tr><th>Session</th><th>Actions</th></tr></thead>
        <tbody>${sessionRows}</tbody>
      </table>
    </div>` : ''}

    <!-- Render Status Section (populated via JavaScript) -->
    <div id="render-section" class="section" style="display: none;">
      <div class="section-header">⚠️ Render Alerts <span id="render-count"></span></div>
      <table id="render-table">
        <tbody id="render-body"></tbody>
      </table>
    </div>
  </div>

  <!-- Unassigned Issues Modal -->
  <div id="unassignedModal" class="modal">
    <div class="modal-content">
      <div class="modal-header">
        <h2>📋 Unassigned Issues in Current Cycle</h2>
        <button class="modal-close" onclick="closeUnassignedModal()">&times;</button>
      </div>
      <div class="modal-body" id="modalBody">
        <p style="text-align: center; color: var(--muted);">Loading...</p>
      </div>
    </div>
  </div>

  <!-- Autopilot Settings Modal -->
  <div id="autopilotModal" class="modal">
    <div class="modal-content">
      <div class="modal-header">
        <h2>🤖 Autopilot Settings</h2>
        <button class="modal-close" onclick="closeAutopilotModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom: 20px;">
          <label style="display: block; font-weight: 700; margin-bottom: 8px; color: var(--text);">
            Max Parallel Agents
          </label>
          <input
            type="number"
            id="maxParallelInput"
            min="1"
            max="10"
            value="3"
            style="padding: 10px; border: 1px solid var(--border); background: var(--panel); color: var(--text); border-radius: 10px; width: 120px; font-size: 16px;"
          />
        </div>

        <div style="margin-bottom: 20px;">
          <div style="font-size: 14px; color: var(--muted);">
            <strong>Status:</strong> <span id="autopilotStatusText">Loading...</span>
          </div>
          <div style="font-size: 14px; color: var(--muted); margin-top: 4px;">
            <strong>Running Agents:</strong> <span id="runningAgentsText">0</span>
          </div>
        </div>

        <div style="display: flex; gap: 12px;">
          <button onclick="toggleAutopilot()" id="toggleBtn" class="assign-btn">
            Start Autopilot
          </button>
          <button onclick="saveMaxParallel()" class="assign-btn" style="background: linear-gradient(135deg, #22d3ee, #38bdf8); border-color: rgba(34,211,238,0.45);">
            Save Settings
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Issues Diff Modal -->
  <div id="issuesDiffModal" class="modal">
    <div class="modal-content">
      <div class="modal-header">
        <h2>📝 Release Notes Preview</h2>
        <button class="modal-close" onclick="closeIssuesDiffModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div id="issuesDiffInfo" style="font-size: 14px; color: var(--muted);"></div>
            <button onclick="copyIssuesDiff(event)" class="assign-btn" style="background: linear-gradient(135deg, #22c55e, #16a34a); border-color: rgba(34,197,94,0.4);">
              📋 Copy to Clipboard
            </button>
          </div>
          <div style="display: flex; gap: 8px;">
            <button onclick="generateChangelog('condensed')" class="assign-btn" style="background: linear-gradient(135deg, #f97316, #fb923c); border-color: rgba(249,115,22,0.45); flex: 1;">
              ⚡ Generate Condensed Changelog
            </button>
            <button onclick="generateChangelog('detailed')" class="assign-btn" style="background: linear-gradient(135deg, #22d3ee, #38bdf8); border-color: rgba(34,211,238,0.45); flex: 1;">
              📄 Generate Detailed Changelog
            </button>
          </div>
        </div>
        <div id="issuesDiffContent" style="
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 20px;
          max-height: 500px;
          overflow-y: auto;
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 13px;
          line-height: 1.6;
          white-space: pre-wrap;
          color: var(--text);
        ">
          Loading...
        </div>
      </div>
    </div>
  </div>

  <script>
    // Dismiss tool warnings banner
    function dismissToolWarnings() {
      const banner = document.getElementById('toolWarnings');
      if (banner) {
        banner.style.display = 'none';
        localStorage.setItem('toolWarningsDismissed', 'true');
      }
    }

    // Check if warning was previously dismissed
    if (localStorage.getItem('toolWarningsDismissed') === 'true') {
      const banner = document.getElementById('toolWarnings');
      if (banner) banner.style.display = 'none';
    }

    // Project selector functions
    function toggleProjectDropdown(event) {
      event.stopPropagation();
      const dropdown = document.getElementById('projectDropdown');
      dropdown.classList.toggle('open');
    }

    async function switchProject(projectName) {
      const dropdown = document.getElementById('projectDropdown');
      dropdown.classList.remove('open');

      try {
        const res = await fetch('/api/projects/active', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project: projectName })
        });

        if (res.ok) {
          window.location.reload();
        } else {
          const data = await res.json();
          alert('Failed to switch project: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Error switching project: ' + err.message);
      }
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', function(event) {
      const dropdown = document.getElementById('projectDropdown');
      const selector = event.target.closest('.project-selector');
      if (!selector && dropdown) {
        dropdown.classList.remove('open');
      }
    });

    async function fetchStatus() {
      const rows = document.querySelectorAll('[data-branch]');
      for (const row of rows) {
        const branchId = row.getAttribute('data-branch');
        const folder = row.getAttribute('data-folder');
        const worktreePath = row.getAttribute('data-path');
        const statusCell = document.getElementById(\`status-\${branchId}\`);
        const ticketBtn = document.getElementById(\`ticket-btn-\${branchId}\`);

        if (!statusCell || !folder) continue;

        try {
          const res = await fetch(\`/api/folder-status?folder=\${encodeURIComponent(folder)}&path=\${encodeURIComponent(worktreePath || '')}\`);
          const data = await res.json();
          
          let html = '';

          // Add WIP badge if there are uncommitted or unpushed changes
          if (data.git && data.git.hasChanges) {
            html += '<span class="status-badge status-wip">WIP</span>';
          }

          // Add issue sync badge if Linear has updates
          if (data.issueSync) {
            if (data.issueSync.hasConflict) {
              html += '<span class="status-badge status-conflict" title="Local issue file has uncommitted changes but Linear has updates">⚠️ Issue Conflict</span>';
            } else if (data.issueSync.hasUpdate) {
              const linearId = (folder.match(/([A-Za-z]+-\\d+)/i)?.[0] || '').toUpperCase();
              html += \`<span class="status-badge status-sync" onclick="updateIssueFromLinear('\${worktreePath}', '\${linearId}')" title="Linear description has changed - click to update local file">🔄 Update from Linear</span>\`;
            }
          }

          if (data.linear && !data.linear.error) {
            const stateType = data.linear.state?.type || '';
            let linearClass = 'status-linear-default';
            if (stateType === 'completed') linearClass = 'status-linear-done';
            else if (stateType === 'started') linearClass = 'status-linear-progress';
            else if (stateType === 'backlog') linearClass = 'status-linear-backlog';

            html += \`<span class="status-badge \${linearClass}">\${data.linear.state?.name || 'Unknown'}</span>\`;

            if (data.linear.url && ticketBtn) {
              ticketBtn.href = data.linear.url;
              ticketBtn.target = '_blank';
              ticketBtn.textContent = data.linear.identifier || '';
            }

            // Update title and description
            const titleEl = row.querySelector('.title');
            const descEl = row.querySelector('.description');
            if (titleEl && data.linear.title) {
              titleEl.textContent = data.linear.title;
            }
            if (descEl) {
              const copyBtn = descEl.querySelector('.copy-btn');
              const description = data.linear.description || 'No description available';
              descEl.textContent = description;
              if (copyBtn) descEl.appendChild(copyBtn);
            }
          }
          
          if (data.github && Array.isArray(data.github)) {
            html += '<br>';
            data.github.forEach(pr => {
              const state = pr.merged_at ? 'merged' : pr.draft ? 'draft' : pr.state;
              const badgeClass = pr.merged_at ? 'status-github-merged' : pr.draft ? 'status-github-draft' : 'status-github-open';
              html += \`<a href="\${pr.url}" target="_blank"><span class="status-badge \${badgeClass}">PR #\${pr.number}</span></a>\`;
              
              if (pr.suggestCleanup) {
                const cleanupBtn = row.querySelector('.btn-cleanup');
                if (cleanupBtn) cleanupBtn.style.display = 'inline-block';
              }
            });
          }
          
          statusCell.innerHTML = html || '<span class="status-badge">No Status</span>';
        } catch (err) {
          statusCell.innerHTML = '<span class="status-badge">Error</span>';
        }
      }
    }

    async function runDev(path, branch, title, ticketId) {
      await fetch('/run-dev', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({path, branch, title, ticketId})
      });
    }

    async function openTerminal(path) {
      await fetch('/open-terminal', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({path})
      });
    }

    async function openClaude(path, branch, title, ticketId) {
      const res = await fetch('/open-claude', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({path, branch, title, ticketId})
      });
      const data = await res.json();
      if (!data.ok) {
        const error = data.error || 'Unknown error';
        if (error.includes('tmux not installed')) {
          alert('To use Claude button, install tmux:\\n\\nbrew install tmux');
        } else if (error.includes('claude') || error.includes('Claude')) {
          alert('To use Claude button, install Claude Code CLI:\\n\\nhttps://claude.ai/download');
        } else {
          alert('Failed to open Claude: ' + error);
        }
      }
    }

    async function openInFinder(path) {
      await fetch('/open-finder', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({path})
      });
    }

    async function openMeld(path) {
      const res = await fetch('/open-meld', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({path})
      });
      const data = await res.json();
      if (!data.ok) {
        alert('To use Meld diff tool, install it:\\n\\nbrew install meld');
      }
    }

    async function updateIssueFromLinear(worktreePath, issueId) {
      if (!confirm(\`Update local issue file from Linear?\\n\\nThis will overwrite the local issues/\${issueId}.md file with the latest description from Linear.\`)) {
        return;
      }

      try {
        const res = await fetch('/api/update-issue-from-linear', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ worktreePath, issueId })
        });

        const data = await res.json();

        if (data.ok) {
          alert(\`✅ Updated \${data.issueFile}\\n\\nTitle: \${data.title}\`);
          location.reload();
        } else {
          throw new Error(data.error || 'Failed to update issue');
        }
      } catch (err) {
        alert('Error updating issue: ' + err.message);
      }
    }

    async function cleanupBranch(path, branch, ticketId) {
      if (!confirm(\`Delete branch \${branch} and worktree?\`)) return;

      try {
        const res = await fetch('/cleanup-branch', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({path, branch, ticketId})
        });

        const data = await res.json();

        if (data.ok) {
          if (data.warnings && data.warnings.length > 0) {
            alert('Cleanup successful with warnings:\\n\\n' + data.warnings.join('\\n'));
          }
          location.reload();
        } else {
          let errorMsg = 'Cleanup failed:\\n\\n' + (data.error || 'Unknown error');
          if (data.errors && data.errors.length > 0) {
            errorMsg += '\\n\\nErrors:\\n' + data.errors.join('\\n');
          }
          if (data.warnings && data.warnings.length > 0) {
            errorMsg += '\\n\\nWarnings:\\n' + data.warnings.join('\\n');
          }
          alert(errorMsg);
        }
      } catch (err) {
        alert('Error during cleanup: ' + err.message);
      }
    }

    async function hideWorktree(path, branch) {
      if (!confirm(\`Hide worktree for \${branch}?\`)) return;

      try {
        const res = await fetch('/hide-worktree', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({path})
        });

        const data = await res.json();

        if (data.ok) {
          location.reload();
        } else {
          alert('Failed to hide worktree: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Error hiding worktree: ' + err.message);
      }
    }

    async function attachTmux(sessionName) {
      await fetch('/attach-tmux', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({sessionName})
      });
    }

    async function killTmux(sessionName) {
      if (!confirm(\`Kill tmux session \${sessionName}?\`)) return;

      try {
        const res = await fetch('/kill-tmux', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({sessionName})
        });

        const data = await res.json();

        if (data.ok) {
          location.reload();
        } else {
          alert('Failed to kill tmux session: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Error killing tmux session: ' + err.message);
      }
    }

    async function tileWindows() {
      await fetch('/tile-iterm', {method: 'POST'});
    }

    async function tileAllWindows() {
      await fetch('/tile-all-windows', {method: 'POST'});
    }

    function openInspector() {
      if (window.appWindow && window.appWindow.openDevTools) {
        window.appWindow.openDevTools();
      } else {
        console.log('Inspector not available');
      }
    }

    function openLocalhost() {
      window.open('${localDevUrl}', '_blank');
    }

    // Linear project URL (fetched dynamically)
    let linearProjectUrl = 'https://linear.app';
    const activeProjectName = '${activeProject?.linearProject || ''}';

    async function fetchLinearProjectUrl() {
      if (!activeProjectName) return;
      try {
        const res = await fetch(\`/api/linear/project-url?name=\${encodeURIComponent(activeProjectName)}\`);
        const data = await res.json();
        if (data.ok && data.url) {
          linearProjectUrl = data.url;
        }
      } catch (err) {
        console.error('Failed to fetch Linear project URL:', err);
      }
    }

    function openLinearProject() {
      window.open(linearProjectUrl, '_blank');
    }

    function copyToClipboard(text, btn) {
      navigator.clipboard.writeText(text);
      btn.textContent = '✅';
      setTimeout(() => btn.textContent = '📋', 1000);
    }

    async function createWorktree(branch, btnElement = null) {
      let btn = btnElement;

      if (!btn) {
        const prId = branch.replace(/[^a-zA-Z0-9]/g, '-');
        btn = document.getElementById(\`create-\${prId}\`);

        // If not found, try Linear issue button ID format
        if (!btn) {
          btn = document.getElementById(\`create-linear-\${prId}\`);
        }
      }

      const originalText = btn ? btn.textContent : '';

      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Creating...';
      }

      try {
        const res = await fetch(\`/worktree?branch=\${encodeURIComponent(branch)}\`);
        const data = await res.json();

        if (data.ok) {
          if (btn) btn.textContent = '✅ Created!';
          setTimeout(() => location.reload(), 1000);
        } else {
          if (btn) {
            btn.textContent = '❌ Failed';
            btn.disabled = false;
            setTimeout(() => btn.textContent = originalText || '✨ Worktree', 2000);
          }
          alert('Failed to create worktree: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        if (btn) {
          btn.textContent = '❌ Error';
          btn.disabled = false;
          setTimeout(() => btn.textContent = originalText || '✨ Worktree', 2000);
        }
        alert('Error creating worktree: ' + err.message);
      }
    }

    let dorUserId = null;
    let forgeBotId = null;

    async function showUnassignedIssues() {
      const modal = document.getElementById('unassignedModal');
      const modalBody = document.getElementById('modalBody');

      modal.style.display = 'block';
      modalBody.innerHTML = '<p style="text-align: center; color: var(--muted);">Loading...</p>';

      try {
        // Fetch users and issues in parallel
        const [usersRes, issuesRes] = await Promise.all([
          fetch('/api/linear/users'),
          fetch('/api/linear/unassigned-issues')
        ]);

        const usersData = await usersRes.json();
        const issuesData = await issuesRes.json();

        if (!usersData.ok || !issuesData.ok) {
          throw new Error(usersData.error || issuesData.error || 'Failed to load data');
        }

        // Find Dor Kalev and Forge agent
        const users = usersData.users;
        const dorUser = users.find(u => u.name.includes('Dor Kalev') || u.email.includes('dor'));
        const forgeBot = users.find(u => u.name.toLowerCase().includes('forge') || u.name.toLowerCase().includes('agent'));

        dorUserId = dorUser?.id;
        forgeBotId = forgeBot?.id;

        const issues = issuesData.issues;

        if (issues.length === 0) {
          modalBody.innerHTML = '<p style="text-align: center; color: var(--muted);">No unassigned issues found in current cycle.</p>';
          return;
        }

        // Render issues
        const issuesHtml = issues.map(issue => {
          const desc = issue.description ? issue.description.substring(0, 150) + (issue.description.length > 150 ? '...' : '') : 'No description';
          return \`
            <div class="issue-card">
              <div class="issue-header">
                <div class="issue-title">\${issue.title}</div>
                <div class="issue-id">\${issue.identifier}</div>
              </div>
              <div class="issue-description">\${desc}</div>
              <div class="issue-footer">
                <div class="issue-meta">
                  <span class="issue-cycle">\${issue.cycleName}</span>
                  <span class="issue-state">\${issue.state?.name || 'Unknown'}</span>
                </div>
                <button
                  onclick="assignIssue('\${issue.id}', '\${issue.identifier}')"
                  class="assign-btn"
                  id="assign-\${issue.id}"
                  \${!dorUserId ? 'disabled' : ''}
                >
                  ✅ Assign to Dor
                </button>
              </div>
            </div>
          \`;
        }).join('');

        modalBody.innerHTML = issuesHtml;
      } catch (err) {
        modalBody.innerHTML = \`<p style="text-align: center; color: #f43f5e;">Error: \${err.message}</p>\`;
      }
    }

    function closeUnassignedModal() {
      document.getElementById('unassignedModal').style.display = 'none';
    }

    async function assignIssue(issueId, identifier) {
      if (!dorUserId) {
        alert('Could not find Dor Kalev user in Linear');
        return;
      }

      const btn = document.getElementById(\`assign-\${issueId}\`);
      btn.disabled = true;
      btn.textContent = '⏳ Assigning...';

      try {
        // Build array of assignee IDs - Forge first (primary assignee), then Dor (subscriber)
        const assigneeIds = [];
        if (forgeBotId) {
          assigneeIds.push(forgeBotId);
        }
        assigneeIds.push(dorUserId);

        const res = await fetch('/api/linear/assign-issue', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            issueId,
            assigneeIds
          })
        });

        const data = await res.json();

        if (data.ok) {
          btn.textContent = '✅ Assigned!';
          btn.style.background = 'linear-gradient(135deg, #475569, #334155)';
          btn.style.borderColor = 'rgba(148,163,184,0.5)';

          // Remove the card after a delay
          setTimeout(() => {
            btn.closest('.issue-card').style.opacity = '0';
            setTimeout(() => {
              btn.closest('.issue-card').remove();

              // Check if there are any issues left
              const remainingIssues = document.querySelectorAll('.issue-card');
              if (remainingIssues.length === 0) {
                document.getElementById('modalBody').innerHTML = '<p style="text-align: center; color: var(--muted);">All issues assigned!</p>';
              }
            }, 300);
          }, 500);
        } else {
          throw new Error(data.error || 'Failed to assign issue');
        }
      } catch (err) {
        alert('Error assigning issue: ' + err.message);
        btn.disabled = false;
        btn.textContent = '✅ Assign to Dor';
      }
    }

    // Autopilot functions
    let autopilotStatusInterval = null;

    async function openAutopilotSettings() {
      const modal = document.getElementById('autopilotModal');
      modal.style.display = 'block';

      await updateAutopilotStatus();

      // Poll status while modal open
      if (!autopilotStatusInterval) {
        autopilotStatusInterval = setInterval(updateAutopilotStatus, 3000);
      }
    }

    function closeAutopilotModal() {
      document.getElementById('autopilotModal').style.display = 'none';
      if (autopilotStatusInterval) {
        clearInterval(autopilotStatusInterval);
        autopilotStatusInterval = null;
      }
    }

    async function updateAutopilotStatus() {
      try {
        const res = await fetch('/api/autopilot/status');
        const data = await res.json();

        const btn = document.getElementById('autopilot-btn');
        const toggleBtn = document.getElementById('toggleBtn');
        const statusText = document.getElementById('autopilotStatusText');
        const runningText = document.getElementById('runningAgentsText');
        const maxInput = document.getElementById('maxParallelInput');

        if (data.enabled) {
          btn.textContent = \`🤖 Autopilot: ON (\${data.runningAgentsCount}/\${data.maxParallelAgents})\`;
          toggleBtn.textContent = 'Stop Autopilot';
          toggleBtn.style.background = 'linear-gradient(135deg, #f43f5e, #fb7185)';
          toggleBtn.style.borderColor = 'rgba(244,63,94,0.45)';
          statusText.textContent = 'Running';
          statusText.style.color = '#22c55e';
        } else {
          btn.textContent = '🤖 Autopilot: OFF';
          toggleBtn.textContent = 'Start Autopilot';
          toggleBtn.style.background = 'linear-gradient(135deg, #f97316, #fb923c)';
          toggleBtn.style.borderColor = 'rgba(249,115,22,0.45)';
          statusText.textContent = 'Stopped';
          statusText.style.color = '#94a3b8';
        }

        runningText.textContent = \`\${data.runningAgentsCount}/\${data.maxParallelAgents}\`;
        maxInput.value = data.maxParallelAgents;

      } catch (err) {
        console.error('Failed to get autopilot status:', err);
      }
    }

    async function toggleAutopilot() {
      const res = await fetch('/api/autopilot/status');
      const status = await res.json();

      const endpoint = status.enabled ? '/api/autopilot/stop' : '/api/autopilot/start';
      await fetch(endpoint, { method: 'POST' });

      await updateAutopilotStatus();
    }

    async function saveMaxParallel() {
      const max = document.getElementById('maxParallelInput').value;

      const res = await fetch('/api/autopilot/set-max', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxParallel: parseInt(max, 10) })
      });

      const data = await res.json();

      if (data.ok) {
        alert('✅ Settings saved!');
        await updateAutopilotStatus();
      } else {
        alert('❌ ' + (data.error || 'Failed to save'));
      }
    }

    // Issues diff functions
    let issuesDiffData = null;

    async function showIssuesDiff() {
      const modal = document.getElementById('issuesDiffModal');
      const content = document.getElementById('issuesDiffContent');
      const info = document.getElementById('issuesDiffInfo');

      modal.style.display = 'block';
      content.textContent = 'Loading...';
      info.textContent = '';

      try {
        const res = await fetch('/api/issues-diff');
        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch issues diff');
        }

        issuesDiffData = data;
        content.textContent = data.markdown;

        if (data.hasNewIssues) {
          info.textContent = \`\${data.issuesCount} new issue\${data.issuesCount !== 1 ? 's' : ''} since \${data.previousTag || 'last release'}\`;
        } else {
          info.textContent = data.previousTag ? \`No new issues since \${data.previousTag}\` : 'No issues found';
        }
      } catch (err) {
        content.textContent = 'Error: ' + err.message;
        info.textContent = 'Failed to load';
      }
    }

    function closeIssuesDiffModal() {
      document.getElementById('issuesDiffModal').style.display = 'none';
      issuesDiffData = null;
    }

    function copyIssuesDiff(event) {
      const content = document.getElementById('issuesDiffContent').textContent;
      navigator.clipboard.writeText(content).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '✅ Copied!';
        btn.style.background = '#6b7280';
        btn.style.borderColor = '#4b5563';
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.background = '#10b981';
          btn.style.borderColor = '#059669';
        }, 2000);
      }).catch(err => {
        alert('Failed to copy: ' + err.message);
      });
    }

    async function generateChangelog(type) {
      const content = document.getElementById('issuesDiffContent');
      const info = document.getElementById('issuesDiffInfo');

      const originalContent = content.textContent;
      content.textContent = \`Generating \${type} changelog with AI...\\n\\nThis may take 10-30 seconds depending on the number of issues.\\n\\nPlease wait...\`;

      try {
        const res = await fetch(\`/api/issues-diff/generate-changelog?type=\${type}\`);
        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to generate changelog');
        }

        content.textContent = data.changelog;
        info.textContent = \`AI-generated \${type} changelog using \${data.model} (\${data.issuesCount} issues)\`;
      } catch (err) {
        content.textContent = originalContent;
        alert('Error generating changelog: ' + err.message);
      }
    }

    // Close modal when clicking outside
    window.onclick = function(event) {
      const unassignedModal = document.getElementById('unassignedModal');
      const autopilotModal = document.getElementById('autopilotModal');
      const issuesDiffModal = document.getElementById('issuesDiffModal');
      if (event.target === unassignedModal) {
        closeUnassignedModal();
      }
      if (event.target === autopilotModal) {
        closeAutopilotModal();
      }
      if (event.target === issuesDiffModal) {
        closeIssuesDiffModal();
      }
    }

    // Update autopilot button on page load
    window.addEventListener('load', async () => {
      await updateAutopilotStatus();
    });

    // Render status functions
    async function fetchRenderStatus() {
      try {
        const res = await fetch('/api/render/status');
        const data = await res.json();

        if (!data.success || !data.hasIssues || data.environments.length === 0) {
          // Hide section if no issues
          document.getElementById('render-section').style.display = 'none';
          return;
        }

        // Show section and populate
        const section = document.getElementById('render-section');
        const body = document.getElementById('render-body');
        const count = document.getElementById('render-count');

        section.style.display = 'block';
        count.textContent = \`(\${data.environments.length})\`;

        let html = '';
        data.environments.forEach(env => {
          html += \`<tr><td colspan="4" style="background: var(--panel-strong); padding: 12px; font-weight: 700; color: var(--text); border-bottom: 1px solid var(--border);">\${env.name}\`;
          if (env.projectName) html += \` - \${env.projectName}\`;
          html += \`</td></tr>\`;

          env.services.forEach(service => {
            const statusClass = service.suspended !== 'not_suspended' ? 'status-render-suspended' :
                               service.deploy?.status === 'build_failed' ? 'status-render-failed' :
                               service.deploy?.status === 'building' ? 'status-render-building' :
                               'status-render-failed';

            const statusText = service.suspended !== 'not_suspended' ? 'Suspended' :
                             service.deploy?.status || 'Unknown';

            const deployDate = service.deploy?.finishedAt ? new Date(service.deploy.finishedAt) : null;
            const deployAgo = deployDate ? getTimeAgo(deployDate) : 'N/A';

            html += \`
              <tr>
                <td colspan="3" style="padding: 12px;">
                  <div class="render-service-name">
                    <a href="\${service.dashboardUrl}" target="_blank" style="color: var(--accent-2); text-decoration: none; font-weight: 700;">
                      \${service.name}
                    </a>
                    <span style="font-weight: normal; color: var(--muted);">(\${service.type.replace('_', ' ')})</span>
                  </div>
                  <div class="render-service-meta">
                    Branch: <strong>\${service.branch}</strong> | Deployed: <strong>\${deployAgo}</strong>
                  </div>
                </td>
                <td style="padding: 12px;">
                  <span class="status-badge \${statusClass}">\${statusText}</span>
                </td>
              </tr>
            \`;
          });
        });

        body.innerHTML = html;
      } catch (err) {
        console.error('Error fetching Render status:', err);
      }
    }

    function getTimeAgo(date) {
      const seconds = Math.floor((new Date() - date) / 1000);
      const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
      };

      for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
          return \`\${interval} \${unit}\${interval === 1 ? '' : 's'} ago\`;
        }
      }
      return 'just now';
    }

    // Check branch existence for Linear issues and update buttons
    async function checkLinearIssueBranches() {
      const issueRows = document.querySelectorAll('[data-issue-id]');

      for (const row of issueRows) {
        const issueId = row.getAttribute('data-issue-id');
        const btn = document.getElementById(\`btn-linear-\${issueId}\`);
        const branchNameEl = document.getElementById(\`branch-name-\${issueId}\`);

        if (!btn) continue;

        const branch = btn.getAttribute('data-branch');
        const issueDataId = btn.getAttribute('data-issue-id');
        const issueIdentifier = btn.getAttribute('data-issue-identifier');

        if (!branch) {
          console.error('No branch attribute found for issue:', issueId);
          btn.textContent = '🌿 Branch!';
          btn.onclick = () => createBranch(issueDataId, issueIdentifier, btn);
          btn.style.display = 'inline-block';
          continue;
        }

        try {
          // Check if branch exists and if it has a PR
          const res = await fetch(\`/api/branch-exists?branchName=\${encodeURIComponent(branch)}\`);
          const data = await res.json();

          if (branchNameEl) {
            branchNameEl.textContent = branch;
          }

          if (!data.exists) {
            // Branch doesn't exist - show branch! button (creates branch + PR)
            btn.textContent = '🌿 Branch!';
            btn.onclick = () => createBranch(issueDataId, issueIdentifier, btn);
          } else if (data.exists && !data.hasPR) {
            // Branch exists but no PR - show create PR button
            btn.textContent = '📝 Create PR';
            btn.onclick = () => createPROnly(issueDataId, issueIdentifier, branch, btn);
          } else {
            // Branch exists and has PR - show worktree button
            btn.textContent = '✨ Worktree';
            btn.onclick = () => createWorktree(branch, btn);
          }

          btn.style.display = 'inline-block';
        } catch (err) {
          console.error('Error checking branch:', err);
          btn.textContent = '❌ Error';
          btn.style.display = 'inline-block';
          btn.disabled = true;
        }
      }
    }

    // Create a new branch from staging
    async function createBranch(issueId, issueIdentifier, btn) {
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⏳ Creating branch...';

      try {
        const res = await fetch('/api/create-branch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            issueId,
            issueIdentifier
          })
        });

        const data = await res.json();

        if (data.ok) {
          btn.textContent = '✅ Branch created!';

          // After a short delay, change button to worktree button
          setTimeout(() => {
            btn.textContent = '✨ Worktree';
            btn.disabled = false;
            btn.onclick = () => createWorktree(data.branchName, btn);
          }, 1500);
        } else {
          throw new Error(data.error || 'Failed to create branch');
        }
      } catch (err) {
        console.error('Error creating branch:', err);
        alert('Failed to create branch: ' + err.message);
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }

    // Create PR only (for existing branch)
    async function createPROnly(issueId, issueIdentifier, branchName, btn) {
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⏳ Creating PR...';

      try {
        const res = await fetch('/api/create-pr-only', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            issueId,
            issueIdentifier,
            branchName
          })
        });

        const data = await res.json();

        if (data.ok) {
          btn.textContent = '✅ PR created!';

          // After a short delay, change button to worktree button
          setTimeout(() => {
            btn.textContent = '✨ Worktree';
            btn.disabled = false;
            btn.onclick = () => createWorktree(branchName, btn);
          }, 1500);
        } else {
          throw new Error(data.error || 'Failed to create PR');
        }
      } catch (err) {
        console.error('Error creating PR:', err);
        alert('Failed to create PR: ' + err.message);
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }


    fetchStatus();
    fetchRenderStatus();
    checkLinearIssueBranches();
    fetchLinearProjectUrl();

    // Refresh Render status every 60 seconds
    setInterval(fetchRenderStatus, 60000);
  </script>
</body>
</html>`;
}
