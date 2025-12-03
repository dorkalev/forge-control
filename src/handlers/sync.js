import fs from 'fs';
import path from 'path';
import { respond } from '../utils/http.js';
import { getIssue } from '../services/linear.js';
import { LINEAR_API_KEY } from '../config/env.js';
import { getProjectContextSync, getActiveProjectEnv } from '../services/projects.js';

export async function handleUpdateIssueFromLinear(req, res) {
  if (req.method !== 'POST') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', async () => {
    try {
      const { worktreePath, issueId } = JSON.parse(body);

      if (!worktreePath || !issueId) {
        return respond(res, 400, { ok: false, error: 'worktreePath and issueId required' });
      }

      // Get Linear API key from project context
      const projectEnv = await getActiveProjectEnv();
      const linearApiKey = projectEnv?.LINEAR_APP || LINEAR_API_KEY;

      if (!linearApiKey) {
        return respond(res, 400, { ok: false, error: 'Linear API key not configured' });
      }

      // Fetch issue from Linear
      console.log(`🔄 Fetching issue ${issueId} from Linear...`);
      const issue = await getIssue(issueId, linearApiKey);

      if (!issue) {
        return respond(res, 404, { ok: false, error: `Issue ${issueId} not found in Linear` });
      }

      // Generate issue file content
      const content = generateIssueFileContent(issue);

      // Write to file
      const issueFilePath = path.join(worktreePath, 'issues', `${issueId}.md`);
      const issuesDir = path.dirname(issueFilePath);

      // Ensure issues directory exists
      if (!fs.existsSync(issuesDir)) {
        fs.mkdirSync(issuesDir, { recursive: true });
      }

      fs.writeFileSync(issueFilePath, content, 'utf8');
      console.log(`✅ Updated issue file: ${issueFilePath}`);

      return respond(res, 200, {
        ok: true,
        issueId,
        issueFile: `issues/${issueId}.md`,
        title: issue.title
      });
    } catch (e) {
      console.error('❌ Error updating issue from Linear:', e.message);
      return respond(res, 500, { ok: false, error: e.message });
    }
  });
}

function generateIssueFileContent(issue) {
  const lines = [
    `# ${issue.identifier}: ${issue.title}`,
    '',
    `**Priority:** ${issue.priority || 'N/A'}`,
    `**State:** ${issue.state?.name || 'Unknown'}`,
    `**URL:** ${issue.url}`,
    '',
    '## Description',
    '',
    issue.description || '_No description provided._',
    '',
    '---',
    '',
    '<!-- Local notes below this line are preserved -->',
    ''
  ];

  return lines.join('\n');
}
