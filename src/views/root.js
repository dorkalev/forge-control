// Root page view with complete original UI design
export function renderRootPage(worktrees, openPRs, tmuxSessions, localDevUrl = 'http://localhost:8001', dashboardUrls = {}) {
  const worktreeRows = worktrees.map(wt => {
    const ageClass = wt.ageInDays > 21 ? 'age-old' : wt.ageInDays > 14 ? 'age-warning' : 'age-fresh';
    const ageText = wt.ageInDays === 0 ? 'Today' : wt.ageInDays === 1 ? '1 day' : `${wt.ageInDays} days`;
    const ticketMatch = wt.branch.match(/^([A-Z]+-\d+)/);
    const ticketId = ticketMatch ? ticketMatch[1] : '';
    const branchId = wt.branch.replace(/[^a-zA-Z0-9]/g, '-');
    const folderName = wt.path.split('/').pop();
    
    return `
    <tr data-branch="${branchId}" data-folder="${folderName}">
      <td class="info-cell">
        <div class="info-header">
          <span class="title">${wt.title}</span>
          <a href="#" class="ticket-btn" id="ticket-btn-${branchId}">${ticketId}</a>
        </div>
        <div class="description">${wt.description}
          <button onclick="copyToClipboard('${wt.description.replace(/'/g, "\\'")}', this)" class="copy-btn" title="Copy description">📋</button>
        </div>
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
        <button onclick="openGitKraken('${wt.path}')" class="action-btn btn-gitkraken" title="Open in GitKraken">🦑 GitKraken</button>
        <button onclick="cleanupBranch('${wt.path}', '${wt.branch}', '${ticketId}')" class="action-btn btn-cleanup" style="display: none;" title="Delete branch and worktree">🗑 Cleanup!</button>
        <button onclick="hideWorktree('${wt.path}', '${wt.branch}')" class="action-btn btn-hide" title="Hide worktree">👁 Hide</button>
      </td>
    </tr>`;
  }).join('');

  const prRows = openPRs.map(pr => {
    const prId = pr.branch.replace(/[^a-zA-Z0-9]/g, '-');
    return `
    <tr>
      <td colspan="3" style="padding: 12px; color: #1f2937;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="flex: 1;">
            <a href="${pr.url}" target="_blank" style="color: #3b82f6; text-decoration: none; font-weight: 600;">
              ${pr.title}
            </a>
            <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
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

  const sessionRows = tmuxSessions.map(s => `
    <tr>
      <td style="padding: 12px; color: #1f2937;">${s.displayTitle}</td>
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
  <title>🚀 Local Agent - Worktrees</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      margin: 0; padding: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      min-height: 100vh;
    }
    .titlebar {
      -webkit-app-region: drag;
      user-select: none;
      height: 40px;
      background: rgba(0, 0, 0, 0.2);
      backdrop-filter: blur(10px);
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 1000;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
      padding-top: 60px;
    }
    .app-drag-region {
      -webkit-app-region: drag;
      user-select: none;
    }
    .button, .input, button, input, a {
      -webkit-app-region: no-drag;
    }
    .header {
      background: rgba(255, 255, 255, 0.15);
      padding: 24px 32px;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(31, 38, 135, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.25);
      backdrop-filter: blur(10px);
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    h1 { margin: 0; color: white; font-size: 28px; }
    .subtitle { color: rgba(255, 255, 255, 0.85); margin-top: 6px; font-size: 15px; }
    .header-actions {
      display: flex;
      gap: 12px;
    }
    .header-btn {
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: white;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .header-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: rgba(255, 255, 255, 0.95);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(31, 38, 135, 0.3);
    }
    th, td {
      padding: 14px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    th {
      background: #f9fafb;
      font-weight: 600;
      font-size: 13px;
      color: #374151;
      text-transform: uppercase;
      letter-spacing: 0.5px;
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
      font-weight: 600;
      font-size: 15px;
      color: #111827;
    }
    .ticket-btn {
      background: #3b82f6;
      color: white;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      text-decoration: none;
      font-weight: 600;
    }
    .ticket-btn:hover {
      background: #2563eb;
    }
    .description {
      color: #6b7280;
      font-size: 14px;
      line-height: 1.5;
    }
    .branch-path {
      font-size: 11px;
      color: #9ca3af;
      margin-top: 4px;
      font-family: 'Monaco', 'Menlo', monospace;
    }
    .copy-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 16px;
      padding: 2px;
      opacity: 0.5;
      transition: opacity 0.2s;
    }
    .copy-btn:hover {
      opacity: 1;
    }
    .status-cell {
      width: 20%;
      font-size: 12px;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      margin: 2px 4px 2px 0;
    }
    .status-loading { background: #e5e7eb; color: #6b7280; }
    .status-linear-done { background: #3b82f6; color: white; }
    .status-linear-progress { background: #10b981; color: white; }
    .status-linear-backlog { background: #f3f4f6; color: #4b5563; border: 1px solid #d1d5db; }
    .status-linear-default { background: #6366f1; color: white; }
    .status-github-open { background: #059669; color: white; }
    .status-github-merged { background: #6366f1; color: white; }
    .status-github-draft { background: #6b7280; color: white; }
    .status-wip { background: #fbbf24; color: #78350f; font-weight: 700; }
    .status-render-building { background: #fbbf24; color: #78350f; }
    .status-render-failed { background: #ef4444; color: white; }
    .status-render-suspended { background: #6b7280; color: white; }
    .render-service { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; }
    .render-service:last-child { border-bottom: none; }
    .render-service-name { font-weight: 600; color: #111827; font-size: 14px; }
    .render-service-name a:hover { text-decoration: underline; color: #667eea; }
    .render-service-meta { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .age-cell {
      width: 10%;
    }
    .age-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 500;
    }
    .age-fresh { background: #d1fae5; color: #065f46; }
    .age-warning { background: #fef3c7; color: #92400e; }
    .age-old { background: #fee2e2; color: #991b1b; }
    .actions-cell {
      white-space: normal;
      width: 237px;
      max-width: 237px;
    }
    .action-btn {
      background: #f3f4f6;
      border: 2px solid #d1d5db;
      padding: 8px 8px;
      border-radius: 6px;
      font-size: 11px;
      cursor: pointer;
      margin: 3px;
      color: #374151;
      font-weight: 500;
      transition: all 0.2s;
      display: inline-block;
      width: 108px;
      text-align: center;
    }
    .action-btn:hover {
      background: #e5e7eb;
      border-color: #9ca3af;
    }
    .btn-run {
      background: #3b82f6;
      color: white;
      border: 2px solid #2563eb;
    }
    .btn-run:hover {
      background: #2563eb;
      border-color: #1d4ed8;
    }
    .btn-claude {
      background: #7c3aed;
      color: white;
      border: 2px solid #6d28d9;
    }
    .btn-claude:hover {
      background: #6d28d9;
      border-color: #5b21b6;
    }
    .btn-warp {
      background: #10b981;
      color: white;
      border: 2px solid #059669;
    }
    .btn-warp:hover {
      background: #059669;
      border-color: #047857;
    }
    .btn-finder {
      background: #f59e0b;
      color: white;
      border: 2px solid #d97706;
    }
    .btn-finder:hover {
      background: #d97706;
      border-color: #b45309;
    }
    .btn-gitkraken {
      background: #06b6d4;
      color: white;
      border: 2px solid #0891b2;
    }
    .btn-gitkraken:hover {
      background: #0891b2;
      border-color: #0e7490;
    }
    .btn-hide {
      background: #6b7280;
      color: white;
      border: 2px solid #4b5563;
    }
    .btn-hide:hover {
      background: #4b5563;
      border-color: #374151;
    }
    .btn-cleanup {
      background: #ef4444;
      color: white;
      border: 2px solid #dc2626;
    }
    .btn-cleanup:hover {
      background: #dc2626;
      border-color: #b91c1c;
    }
    .btn-danger {
      background: #ef4444;
      color: white;
      border: 2px solid #dc2626;
    }
    .btn-danger:hover {
      background: #dc2626;
      border-color: #b91c1c;
    }
    .btn-attach {
      background: #8b5cf6;
      color: white;
      border: 2px solid #7c3aed;
    }
    .btn-attach:hover {
      background: #7c3aed;
      border-color: #6d28d9;
    }
    .section {
      margin-bottom: 24px;
    }
    .section-header {
      background: rgba(255, 255, 255, 0.15);
      padding: 16px 24px;
      border-radius: 12px 12px 0 0;
      font-size: 18px;
      font-weight: 600;
      color: white;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-bottom: none;
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
      background-color: rgba(0,0,0,0.5);
      backdrop-filter: blur(4px);
    }
    .modal-content {
      background: white;
      margin: 5% auto;
      padding: 0;
      border-radius: 12px;
      width: 80%;
      max-width: 900px;
      max-height: 80vh;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .modal-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-header h2 {
      margin: 0;
      font-size: 24px;
    }
    .modal-close {
      color: white;
      font-size: 28px;
      font-weight: bold;
      cursor: pointer;
      background: none;
      border: none;
      padding: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: background 0.2s;
    }
    .modal-close:hover {
      background: rgba(255,255,255,0.2);
    }
    .modal-body {
      padding: 30px;
      max-height: calc(80vh - 80px);
      overflow-y: auto;
    }
    .issue-card {
      background: #f8f9fa;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
      transition: all 0.2s;
    }
    .issue-card:hover {
      border-color: #667eea;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.1);
    }
    .issue-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
    }
    .issue-title {
      font-weight: 600;
      font-size: 15px;
      color: #111827;
      flex: 1;
    }
    .issue-id {
      background: #3b82f6;
      color: white;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      margin-left: 12px;
    }
    .issue-description {
      color: #6b7280;
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
      background: #e0e7ff;
      color: #3730a3;
      padding: 4px 8px;
      border-radius: 4px;
    }
    .issue-state {
      background: #dbeafe;
      color: #1e40af;
      padding: 4px 8px;
      border-radius: 4px;
    }
    .assign-btn {
      background: #10b981;
      color: white;
      border: 2px solid #059669;
      padding: 6px 16px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .assign-btn:hover {
      background: #059669;
      border-color: #047857;
    }
    .assign-btn:disabled {
      background: #9ca3af;
      border-color: #6b7280;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <div class="titlebar"></div>
  <div class="container">
    <div class="header">
      <div>
        <h1>🚀 SDLC RocketShip</h1>
        <div class="subtitle">Manage your development environments</div>
      </div>
      <div class="header-actions">
        <button onclick="openInspector()" class="header-btn">🔍 Inspector</button>
        <button onclick="openLocalhost()" class="header-btn">🌐 Localhost</button>
        <button onclick="window.open('https://linear.app', '_blank')" class="header-btn">📋 Linear</button>
        <button onclick="window.open('https://dashboard.render.com/', '_blank')" class="header-btn">☁️ Render</button>
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

    <div class="section">
      <div class="section-header">📁 Active Worktrees (${worktrees.length})</div>
      <table>
        <thead><tr>
          <th>Ticket</th>
          <th>Status</th>
          <th>Age</th>
          <th>Actions</th>
        </tr></thead>
        <tbody>${worktreeRows || '<tr><td colspan="4" style="text-align: center; padding: 40px; color: #6b7280;">No worktrees found</td></tr>'}</tbody>
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
        <p style="text-align: center; color: #6b7280;">Loading...</p>
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
          <label style="display: block; font-weight: 600; margin-bottom: 8px; color: #111827;">
            Max Parallel Agents
          </label>
          <input
            type="number"
            id="maxParallelInput"
            min="1"
            max="10"
            value="3"
            style="padding: 8px; border: 2px solid #e5e7eb; border-radius: 6px; width: 100px; font-size: 16px;"
          />
        </div>

        <div style="margin-bottom: 20px;">
          <div style="font-size: 14px; color: #6b7280;">
            <strong>Status:</strong> <span id="autopilotStatusText">Loading...</span>
          </div>
          <div style="font-size: 14px; color: #6b7280; margin-top: 4px;">
            <strong>Running Agents:</strong> <span id="runningAgentsText">0</span>
          </div>
        </div>

        <div style="display: flex; gap: 12px;">
          <button onclick="toggleAutopilot()" id="toggleBtn" class="assign-btn">
            Start Autopilot
          </button>
          <button onclick="saveMaxParallel()" class="assign-btn" style="background: #3b82f6; border-color: #2563eb;">
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
            <div id="issuesDiffInfo" style="font-size: 14px; color: #6b7280;"></div>
            <button onclick="copyIssuesDiff(event)" class="assign-btn" style="background: #10b981; border-color: #059669;">
              📋 Copy to Clipboard
            </button>
          </div>
          <div style="display: flex; gap: 8px;">
            <button onclick="generateChangelog('condensed')" class="assign-btn" style="background: #3b82f6; border-color: #2563eb; flex: 1;">
              ⚡ Generate Condensed Changelog
            </button>
            <button onclick="generateChangelog('detailed')" class="assign-btn" style="background: #6366f1; border-color: #4f46e5; flex: 1;">
              📄 Generate Detailed Changelog
            </button>
          </div>
        </div>
        <div id="issuesDiffContent" style="
          background: #f8f9fa;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 20px;
          max-height: 500px;
          overflow-y: auto;
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 13px;
          line-height: 1.6;
          white-space: pre-wrap;
          color: #1f2937;
        ">
          Loading...
        </div>
      </div>
    </div>
  </div>

  <script>
    async function fetchStatus() {
      const rows = document.querySelectorAll('[data-branch]');
      for (const row of rows) {
        const branchId = row.getAttribute('data-branch');
        const folder = row.getAttribute('data-folder');
        const statusCell = document.getElementById(\`status-\${branchId}\`);
        const ticketBtn = document.getElementById(\`ticket-btn-\${branchId}\`);
        
        try {
          const res = await fetch(\`/api/folder-status?folder=\${encodeURIComponent(folder)}\`);
          const data = await res.json();
          
          let html = '';

          // Add WIP badge if there are uncommitted or unpushed changes
          if (data.git && data.git.hasChanges) {
            html += '<span class="status-badge status-wip">WIP</span>';
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
      await fetch('/open-claude', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({path, branch, title, ticketId})
      });
    }

    async function openInFinder(path) {
      await fetch('/open-finder', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({path})
      });
    }

    async function openGitKraken(path) {
      await fetch('/open-gitkraken', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({path})
      });
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

    function copyToClipboard(text, btn) {
      navigator.clipboard.writeText(text);
      btn.textContent = '✅';
      setTimeout(() => btn.textContent = '📋', 1000);
    }

    async function createWorktree(branch) {
      const prId = branch.replace(/[^a-zA-Z0-9]/g, '-');
      const btn = document.getElementById(\`create-\${prId}\`);
      if (!btn) return;

      btn.disabled = true;
      btn.textContent = '⏳ Creating...';

      try {
        const res = await fetch(\`/worktree?branch=\${encodeURIComponent(branch)}\`);
        const data = await res.json();

        if (data.ok) {
          btn.textContent = '✅ Created!';
          setTimeout(() => location.reload(), 1000);
        } else {
          btn.textContent = '❌ Failed';
          alert('Failed to create worktree: ' + (data.error || 'Unknown error'));
          btn.disabled = false;
          setTimeout(() => btn.textContent = '✨ Worktree', 2000);
        }
      } catch (err) {
        btn.textContent = '❌ Error';
        alert('Error creating worktree: ' + err.message);
        btn.disabled = false;
        setTimeout(() => btn.textContent = '✨ Worktree', 2000);
      }
    }

    let dorUserId = null;
    let sdlcBotId = null;

    async function showUnassignedIssues() {
      const modal = document.getElementById('unassignedModal');
      const modalBody = document.getElementById('modalBody');

      modal.style.display = 'block';
      modalBody.innerHTML = '<p style="text-align: center; color: #6b7280;">Loading...</p>';

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

        // Find Dor Kalev and SDLC agent
        const users = usersData.users;
        const dorUser = users.find(u => u.name.includes('Dor Kalev') || u.email.includes('dor'));
        const sdlcBot = users.find(u => u.name.toLowerCase().includes('sdlc') || u.name.toLowerCase().includes('agent'));

        dorUserId = dorUser?.id;
        sdlcBotId = sdlcBot?.id;

        const issues = issuesData.issues;

        if (issues.length === 0) {
          modalBody.innerHTML = '<p style="text-align: center; color: #6b7280;">No unassigned issues found in current cycle.</p>';
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
        modalBody.innerHTML = \`<p style="text-align: center; color: #dc2626;">Error: \${err.message}</p>\`;
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
        // Build array of assignee IDs - SDLC first (primary assignee), then Dor (subscriber)
        const assigneeIds = [];
        if (sdlcBotId) {
          assigneeIds.push(sdlcBotId);
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
          btn.style.background = '#6b7280';
          btn.style.borderColor = '#4b5563';

          // Remove the card after a delay
          setTimeout(() => {
            btn.closest('.issue-card').style.opacity = '0';
            setTimeout(() => {
              btn.closest('.issue-card').remove();

              // Check if there are any issues left
              const remainingIssues = document.querySelectorAll('.issue-card');
              if (remainingIssues.length === 0) {
                document.getElementById('modalBody').innerHTML = '<p style="text-align: center; color: #6b7280;">All issues assigned!</p>';
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
          toggleBtn.style.background = '#ef4444';
          toggleBtn.style.borderColor = '#dc2626';
          statusText.textContent = 'Running';
          statusText.style.color = '#10b981';
        } else {
          btn.textContent = '🤖 Autopilot: OFF';
          toggleBtn.textContent = 'Start Autopilot';
          toggleBtn.style.background = '#10b981';
          toggleBtn.style.borderColor = '#059669';
          statusText.textContent = 'Stopped';
          statusText.style.color = '#6b7280';
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
          html += \`<tr><td colspan="4" style="background: #f9fafb; padding: 12px; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb;">\${env.name}\`;
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
                    <a href="\${service.dashboardUrl}" target="_blank" style="color: #111827; text-decoration: none;">
                      \${service.name}
                    </a>
                    <span style="font-weight: normal; color: #6b7280;">(\${service.type.replace('_', ' ')})</span>
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

    fetchStatus();
    fetchRenderStatus();

    // Refresh Render status every 60 seconds
    setInterval(fetchRenderStatus, 60000);
  </script>
</body>
</html>`;
}
