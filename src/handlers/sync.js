import fs from 'fs';
import path from 'path';
import { respond } from '../utils/http.js';
import { getIssue, updateIssueDescription } from '../services/linear.js';
import { LINEAR_API_KEY } from '../config/env.js';
import { getProjectContextSync, getActiveProjectEnv } from '../services/projects.js';
import { runCommand } from '../utils/command.js';

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

/**
 * Extract description from local issue file
 * Parses the markdown and returns the Description section content
 * The description may contain its own ## headers (like ## Overview), so we only
 * stop at --- separator or <!-- Local notes comment
 */
function extractDescriptionFromIssueFile(content) {
  const lines = content.split('\n');
  let inDescription = false;
  let description = [];

  for (const line of lines) {
    if (line.startsWith('## Description')) {
      inDescription = true;
      continue;
    }
    if (inDescription) {
      // Stop at separator or local notes section (not at ## headers which are part of content)
      if (line.startsWith('---') || line.startsWith('<!-- Local notes')) {
        break;
      }
      description.push(line);
    }
  }

  // Trim leading/trailing empty lines
  while (description.length > 0 && description[0].trim() === '') {
    description.shift();
  }
  while (description.length > 0 && description[description.length - 1].trim() === '') {
    description.pop();
  }

  return description.join('\n');
}

export async function handleUploadIssueToLinear(req, res) {
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

      // Read local issue file
      const issueFilePath = path.join(worktreePath, 'issues', `${issueId}.md`);
      if (!fs.existsSync(issueFilePath)) {
        return respond(res, 404, { ok: false, error: `Issue file not found: issues/${issueId}.md` });
      }

      const localContent = fs.readFileSync(issueFilePath, 'utf8');
      const localDescription = extractDescriptionFromIssueFile(localContent);

      if (!localDescription || localDescription === '_No description provided._') {
        return respond(res, 400, { ok: false, error: 'No description found in local issue file' });
      }

      // First get the issue to get its internal ID
      console.log(`⬆️  Uploading local description to Linear for ${issueId}...`);
      const issue = await getIssue(issueId, linearApiKey);

      if (!issue) {
        return respond(res, 404, { ok: false, error: `Issue ${issueId} not found in Linear` });
      }

      // Update Linear with local description
      const updatedIssue = await updateIssueDescription(issue.id, localDescription, linearApiKey);
      console.log(`✅ Updated Linear issue: ${updatedIssue.identifier}`);

      return respond(res, 200, {
        ok: true,
        issueId,
        title: updatedIssue.title
      });
    } catch (e) {
      console.error('❌ Error uploading issue to Linear:', e.message);
      return respond(res, 500, { ok: false, error: e.message });
    }
  });
}

export async function handleIssueDiff(req, res) {
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

      // Read local issue file
      const issueFilePath = path.join(worktreePath, 'issues', `${issueId}.md`);
      if (!fs.existsSync(issueFilePath)) {
        return respond(res, 404, { ok: false, error: `Issue file not found: issues/${issueId}.md` });
      }

      const localContent = fs.readFileSync(issueFilePath, 'utf8');
      const localDescription = extractDescriptionFromIssueFile(localContent);

      // Fetch issue from Linear
      console.log(`📊 Fetching issue ${issueId} for diff...`);
      const issue = await getIssue(issueId, linearApiKey);

      if (!issue) {
        return respond(res, 404, { ok: false, error: `Issue ${issueId} not found in Linear` });
      }

      const linearDescription = issue.description || '';

      // Create temp files for diff (use .md extension for better Meld compatibility)
      const tmpDir = '/tmp/forge-diff';
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }

      const localFile = path.join(tmpDir, `${issueId}-local.md`);
      const linearFile = path.join(tmpDir, `${issueId}-linear.md`);

      fs.writeFileSync(localFile, localDescription, 'utf8');
      fs.writeFileSync(linearFile, linearDescription, 'utf8');

      // Open diff in Meld - call meld directly instead of using open -a
      console.log(`📂 Opening diff: ${linearFile} vs ${localFile}`);
      const result = await runCommand('/opt/homebrew/bin/meld', [linearFile, localFile]);
      console.log(`📂 Meld result: code=${result.code}, stdout=${result.stdout}, stderr=${result.stderr}`);

      if (result.code !== 0) {
        // Fallback: try with open -a
        console.log(`📂 Fallback: using open -a Meld`);
        await runCommand('/usr/bin/open', ['-a', 'Meld', linearFile, localFile]);
      }

      return respond(res, 200, {
        ok: true,
        localFile,
        linearFile,
        localDescription,
        linearDescription
      });
    } catch (e) {
      console.error('❌ Error showing issue diff:', e.message);
      return respond(res, 500, { ok: false, error: e.message });
    }
  });
}
