import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { respond, parseBody } from '../utils/http.js';
import { getProjectContextSync, getActiveProjectEnv } from '../services/projects.js';
import { resolveWorktreeBaseDir } from '../services/worktree.js';
import * as linear from '../services/linear.js';

/**
 * Extract image URLs from markdown text and attachments
 */
function extractImageUrls(description, attachments = []) {
  const urls = new Set();

  // Extract markdown image URLs: ![alt](url) or ![](url)
  if (description) {
    const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = markdownImageRegex.exec(description)) !== null) {
      urls.add(match[2]);
    }

    // Also extract plain URLs that look like images
    const plainImageUrlRegex = /https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|svg)/gi;
    while ((match = plainImageUrlRegex.exec(description)) !== null) {
      urls.add(match[0]);
    }

    // Linear upload URLs (they don't always have extensions)
    const linearUploadRegex = /https:\/\/uploads\.linear\.app\/[^\s)]+/g;
    while ((match = linearUploadRegex.exec(description)) !== null) {
      urls.add(match[0]);
    }
  }

  // Add attachment URLs
  for (const att of attachments) {
    if (att.url) {
      urls.add(att.url);
    }
  }

  return Array.from(urls);
}

/**
 * Run Claude Code in oneshot mode to improve a spec
 */
export async function handleImproveSpec(req, res) {
  if (req.method !== 'POST') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const body = await parseBody(req);
  const { issueId, issueIdentifier, currentSpec, title } = body;

  if (!issueId || !issueIdentifier) {
    return respond(res, 400, { ok: false, error: 'issueId and issueIdentifier required' });
  }

  const ctx = getProjectContextSync();
  const repoPath = ctx?.REPO_PATH || process.cwd();

  console.log(`🤖 [Improve Spec] Running Claude Code for ${issueIdentifier} in ${repoPath}`);

  try {
    // Fetch full issue with sub-issues and attachments
    let subIssues = [];
    let imageUrls = [];
    try {
      const issueWithChildren = await linear.getIssueWithChildren(issueId);
      subIssues = issueWithChildren?.children?.nodes || [];

      // Extract images from main issue
      const mainAttachments = issueWithChildren?.attachments?.nodes || [];
      imageUrls = extractImageUrls(issueWithChildren?.description || currentSpec, mainAttachments);

      // Extract images from sub-issues
      for (const sub of subIssues) {
        const subAttachments = sub.attachments?.nodes || [];
        const subImages = extractImageUrls(sub.description, subAttachments);
        imageUrls.push(...subImages);
      }

      // Dedupe
      imageUrls = [...new Set(imageUrls)];

      if (subIssues.length > 0) {
        console.log(`📋 [Improve Spec] Found ${subIssues.length} sub-issues`);
      }
      if (imageUrls.length > 0) {
        console.log(`🖼️  [Improve Spec] Found ${imageUrls.length} image(s)/attachment(s)`);
      }
    } catch (err) {
      console.warn(`⚠️ [Improve Spec] Could not fetch sub-issues: ${err.message}`);
    }

    const improvedSpec = await runClaudeForSpec(repoPath, title, currentSpec, subIssues, imageUrls);
    return respond(res, 200, { ok: true, improvedSpec });
  } catch (err) {
    console.error(`❌ [Improve Spec] Error:`, err.message);
    return respond(res, 500, { ok: false, error: err.message });
  }
}

/**
 * Apply improved spec to Linear issue and optionally update local file
 */
export async function handleApplySpec(req, res) {
  if (req.method !== 'POST') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const body = await parseBody(req);
  const { issueId, issueIdentifier, newSpec } = body;

  if (!issueId || !newSpec) {
    return respond(res, 400, { ok: false, error: 'issueId and newSpec required' });
  }

  // Load project-specific API key
  const projectEnv = await getActiveProjectEnv();
  const apiKey = projectEnv?.LINEAR_APP || null;

  console.log(`📝 [Apply Spec] Updating Linear issue ${issueId}`);

  try {
    // Parse title from first line (may have # prefix for markdown header)
    const lines = newSpec.trim().split('\n');
    let title = lines[0].replace(/^#+\s*/, '').trim(); // Remove markdown header prefix
    const description = lines.slice(1).join('\n').trim();

    let result;
    // If title is empty or too long, fall back to just updating description
    if (!title || title.length > 200) {
      console.log(`📝 [Apply Spec] Title invalid, updating description only`);
      result = await linear.updateIssueDescription(issueId, newSpec, apiKey);
      console.log(`✅ [Apply Spec] Updated ${result.identifier} (description only)`);
    } else {
      console.log(`📝 [Apply Spec] New title: "${title}"`);
      result = await linear.updateIssueTitleAndDescription(issueId, title, description, apiKey);
      console.log(`✅ [Apply Spec] Updated ${result.identifier} with new title and description`);
    }

    // Also update local issue file if we can find a matching worktree
    const identifier = issueIdentifier || result.identifier;
    if (identifier) {
      await updateLocalIssueFile(identifier, title || result.title, description || newSpec);
    }

    return respond(res, 200, { ok: true, issue: result });
  } catch (err) {
    console.error(`❌ [Apply Spec] Error:`, err.message);
    return respond(res, 500, { ok: false, error: err.message });
  }
}

/**
 * Update local issue file in worktree if it exists
 */
async function updateLocalIssueFile(identifier, title, description) {
  try {
    const worktreeBase = resolveWorktreeBaseDir();
    if (!worktreeBase) {
      console.log(`⏭️ [Apply Spec] No worktree base path configured`);
      return;
    }

    // Find worktrees that match this identifier
    const entries = await fs.readdir(worktreeBase, { withFileTypes: true });
    const matchingWorktree = entries.find(entry => {
      if (!entry.isDirectory()) return false;
      // Check if folder name contains the identifier (case-insensitive)
      return entry.name.toLowerCase().includes(identifier.toLowerCase());
    });

    if (!matchingWorktree) {
      console.log(`⏭️ [Apply Spec] No worktree found for ${identifier}`);
      return;
    }

    const worktreePath = path.join(worktreeBase, matchingWorktree.name);
    const issuesDir = path.join(worktreePath, 'issues');
    const issueFilePath = path.join(issuesDir, `${identifier.toUpperCase()}.md`);

    // Check if issues directory exists
    try {
      await fs.access(issuesDir);
    } catch {
      console.log(`⏭️ [Apply Spec] No issues/ directory in ${matchingWorktree.name}`);
      return;
    }

    // Check if issue file exists
    try {
      await fs.access(issueFilePath);
    } catch {
      console.log(`⏭️ [Apply Spec] No issue file ${identifier}.md in ${matchingWorktree.name}`);
      return;
    }

    // Read existing file to preserve local notes section
    const existingContent = await fs.readFile(issueFilePath, 'utf8');

    // Extract local notes section if present
    const localNotesMatch = existingContent.match(/(<!-- Local notes[\s\S]*)/);
    const localNotes = localNotesMatch ? localNotesMatch[1] : '';

    // Build new file content
    const newContent = `# ${identifier}: ${title}

## Description

${description}

---

${localNotes || `<!-- Local notes below this line -->

`}`;

    await fs.writeFile(issueFilePath, newContent, 'utf8');
    console.log(`✅ [Apply Spec] Updated local file: ${issueFilePath}`);
  } catch (err) {
    console.error(`⚠️ [Apply Spec] Failed to update local file:`, err.message);
    // Don't throw - local file update is best-effort
  }
}

/**
 * Run Claude Code in oneshot mode
 */
function runClaudeForSpec(repoPath, title, currentSpec, subIssues = [], imageUrls = []) {
  return new Promise((resolve, reject) => {
    // Format sub-issues if present
    let subIssuesSection = '';
    if (subIssues.length > 0) {
      const subIssuesList = subIssues.map(sub => {
        const desc = sub.description ? `\n     ${sub.description.substring(0, 200)}${sub.description.length > 200 ? '...' : ''}` : '';
        return `  - ${sub.identifier}: ${sub.title}${desc}`;
      }).join('\n');
      subIssuesSection = `

Sub-issues/tasks:
${subIssuesList}`;
    }

    // Format image URLs if present
    let imagesSection = '';
    if (imageUrls.length > 0) {
      imagesSection = `

Screenshots/Attachments (IMPORTANT - fetch these to understand the visual requirements):
${imageUrls.map((url, i) => `  ${i + 1}. ${url}`).join('\n')}`;
    }

    const prompt = `Read my codebase carefully to understand the project structure, patterns, and existing features.

I have a backlog item titled: "${title}"

Current spec/description:
${currentSpec || '(No description provided)'}${subIssuesSection}${imagesSection}
${imageUrls.length > 0 ? `
IMPORTANT: This issue has ${imageUrls.length} screenshot(s)/attachment(s) listed above. You MUST use WebFetch to view each image URL before writing the spec - they contain critical visual context about what the user wants.
` : ''}
Please improve this spec with clear product requirements. Focus on:
- What the feature should do from a user perspective
- Acceptance criteria
- Edge cases to consider
- Any dependencies on existing features
${subIssues.length > 0 ? '- Incorporate the sub-issues into the overall spec as implementation phases or acceptance criteria' : ''}
${imageUrls.length > 0 ? '- Reference specific details from the screenshots in the acceptance criteria' : ''}

IMPORTANT OUTPUT FORMAT RULES:
- Output ONLY the raw spec text itself - nothing else
- Do NOT include any preamble like "Here is the improved spec:" or "I understand..."
- Do NOT include any closing remarks like "Let me know if you need changes"
- Do NOT wrap the output in markdown code blocks
- Start directly with the spec title on line 1
- Only include product decisions, no technical implementation details
- Keep it concise: ${subIssues.length > 0 ? `${300 * subIssues.length}-${400 * subIssues.length}` : '300-400'} words maximum

Your entire response should be the spec and nothing but the spec.`;

    const claude = spawn('claude', ['--print'], {
      cwd: repoPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env
      }
    });

    let output = '';
    let errorOutput = '';

    claude.stdout.on('data', (data) => {
      output += data.toString();
    });

    claude.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    claude.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ [Improve Spec] Claude Code completed successfully`);
        resolve(output.trim());
      } else {
        console.error(`❌ [Improve Spec] Claude Code exited with code ${code}`);
        console.error(`Error output: ${errorOutput}`);
        reject(new Error(`Claude Code failed: ${errorOutput || 'Unknown error'}`));
      }
    });

    claude.on('error', (error) => {
      console.error('❌ [Improve Spec] Error spawning Claude Code:', error.message);
      reject(error);
    });

    // Send the prompt to Claude Code
    claude.stdin.write(prompt);
    claude.stdin.end();
  });
}
