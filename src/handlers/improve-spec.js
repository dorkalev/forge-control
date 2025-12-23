import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import fetch from 'node-fetch';
import { respond, parseBody } from '../utils/http.js';
import { getProjectContextSync, getActiveProjectEnv } from '../services/projects.js';
import { resolveWorktreeBaseDir } from '../services/worktree.js';
import * as linear from '../services/linear.js';
import { LINEAR_API_KEY } from '../config/env.js';

/**
 * Download Linear images to temp directory with authentication
 * Returns array of local file paths
 */
async function downloadLinearImages(imageUrls, apiKey = null) {
  const key = apiKey || LINEAR_API_KEY;
  if (!key || imageUrls.length === 0) {
    return [];
  }

  const tempDir = path.join(os.tmpdir(), `forge-spec-images-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  const localPaths = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    try {
      console.log(`📥 [Improve Spec] Downloading image ${i + 1}/${imageUrls.length}: ${url.substring(0, 80)}...`);

      const response = await fetch(url, {
        headers: {
          'Authorization': key
        }
      });

      if (!response.ok) {
        console.warn(`⚠️  [Improve Spec] Failed to download image: ${response.status}`);
        continue;
      }

      // Determine extension from content-type
      const contentType = response.headers.get('content-type') || 'image/png';
      const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? '.jpg'
        : contentType.includes('gif') ? '.gif'
        : contentType.includes('webp') ? '.webp'
        : '.png';

      const filePath = path.join(tempDir, `image-${i + 1}${ext}`);
      const buffer = await response.buffer();
      await fs.writeFile(filePath, buffer);

      localPaths.push(filePath);
      console.log(`✅ [Improve Spec] Saved image to ${filePath}`);
    } catch (err) {
      console.warn(`⚠️  [Improve Spec] Error downloading image: ${err.message}`);
    }
  }

  return localPaths;
}

/**
 * Cleanup temp image files
 */
async function cleanupTempImages(localPaths) {
  for (const filePath of localPaths) {
    try {
      await fs.unlink(filePath);
    } catch (err) {
      // Ignore cleanup errors
    }
  }
  // Try to remove the temp directory
  if (localPaths.length > 0) {
    try {
      const tempDir = path.dirname(localPaths[0]);
      await fs.rmdir(tempDir);
    } catch (err) {
      // Ignore if not empty or other errors
    }
  }
}

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

    // Download images locally so Claude can view them (Linear URLs require auth)
    let localImagePaths = [];
    if (imageUrls.length > 0) {
      const projectEnv = await getActiveProjectEnv();
      const apiKey = projectEnv?.LINEAR_APP || null;
      localImagePaths = await downloadLinearImages(imageUrls, apiKey);
      console.log(`📁 [Improve Spec] Downloaded ${localImagePaths.length}/${imageUrls.length} images locally`);
    }

    try {
      const improvedSpec = await runClaudeForSpec(repoPath, title, currentSpec, subIssues, localImagePaths);
      return respond(res, 200, { ok: true, improvedSpec });
    } finally {
      // Cleanup temp images
      if (localImagePaths.length > 0) {
        await cleanupTempImages(localImagePaths);
      }
    }
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
function runClaudeForSpec(repoPath, title, currentSpec, subIssues = [], localImagePaths = []) {
  return new Promise((resolve, reject) => {
    // Format sub-issues if present
    let subIssuesSection = '';
    if (subIssues.length > 0) {
      const subIssuesList = subIssues.map(sub => {
        // Use full description - images are often the entire content
        const desc = sub.description ? `\n     Description: ${sub.description}` : '';
        return `  - ${sub.identifier}: ${sub.title}${desc}`;
      }).join('\n\n');
      subIssuesSection = `

Sub-issues/tasks:
${subIssuesList}`;
    }

    // Format local image paths if present
    let imagesSection = '';
    if (localImagePaths.length > 0) {
      imagesSection = `

Screenshots/Attachments (LOCAL FILES - use Read tool to view each one):
${localImagePaths.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}`;
    }

    const prompt = `Read my codebase carefully to understand the project structure, patterns, and existing features.

I have a backlog item titled: "${title}"

Current spec/description:
${currentSpec || '(No description provided)'}${subIssuesSection}${imagesSection}
${localImagePaths.length > 0 ? `
CRITICAL: This issue has ${localImagePaths.length} screenshot(s)/attachment(s) saved as local files. These images ARE the requirements - the text alone is NOT sufficient.
You MUST use the Read tool to view EVERY image file listed above BEFORE writing ANY spec content.
The images show the actual UI/feature being requested. Do NOT invent or assume what they show - describe what you actually see.
` : ''}
Please improve this spec with clear product requirements. Focus on:
- What the feature should do from a user perspective
- Acceptance criteria
- Edge cases to consider
- Any dependencies on existing features
${subIssues.length > 0 ? '- Incorporate the sub-issues into the overall spec as implementation phases or acceptance criteria' : ''}
${localImagePaths.length > 0 ? '- Reference specific details from the screenshots in the acceptance criteria' : ''}

OUTPUT FORMAT:
- First, do any research/image viewing you need
- When ready to output the spec, write "---SPEC START---" on its own line
- Then write the spec (title on first line, then content)
- Only include product decisions, no technical implementation details
- Keep it concise: ${subIssues.length > 0 ? `${300 * subIssues.length}-${400 * subIssues.length}` : '300-400'} words maximum
- End with "---SPEC END---" on its own line

Everything between ---SPEC START--- and ---SPEC END--- will be extracted as the final spec.`;

    // Use --tools to enable WebFetch so Claude can view images
    const args = ['--print', '--tools', 'Read,Glob,Grep,WebFetch'];
    console.log(`🔧 [Improve Spec] Running: claude ${args.join(' ')}`);

    const claude = spawn('claude', args, {
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

        // Extract content between markers
        const startMarker = '---SPEC START---';
        const endMarker = '---SPEC END---';
        const startIdx = output.indexOf(startMarker);
        const endIdx = output.indexOf(endMarker);

        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          const spec = output.substring(startIdx + startMarker.length, endIdx).trim();
          console.log(`📄 [Improve Spec] Extracted spec (${spec.length} chars)`);
          resolve(spec);
        } else {
          // Fallback: use full output if markers not found
          console.warn(`⚠️  [Improve Spec] Markers not found, using full output`);
          resolve(output.trim());
        }
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
