/**
 * Handler for creating branches from Linear issues
 */
import { respond } from '../utils/http.js';
import { runCommand } from '../utils/command.js';
import * as github from '../services/github.js';
import { getIssue } from '../services/linear.js';
import { REPO_PATH, GITHUB_REPO_OWNER, GITHUB_REPO_NAME } from '../config/env.js';
import { getProjectContextSync, getActiveProjectEnv } from '../services/projects.js';
import path from 'path';
import fs from 'fs';

const MAIN_BRANCH = process.env.DEFAULT_BASE_BRANCH || 'main';
const STAGING_BRANCH = 'staging';

/**
 * Get effective config, preferring project context over env vars
 */
function getEffectiveConfig() {
  const ctx = getProjectContextSync();
  return {
    repoPath: ctx?.REPO_PATH || REPO_PATH,
    githubOwner: ctx?.GITHUB_REPO_OWNER || GITHUB_REPO_OWNER,
    githubRepo: ctx?.GITHUB_REPO_NAME || GITHUB_REPO_NAME
  };
}

/**
 * Parse JSON body from request
 */
async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Slugify text for branch names
 */
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

/**
 * Check if a branch exists locally or remotely
 */
async function branchExists(branchName, repoPath) {
  try {
    // Check local branches
    const localResult = await runCommand('git', ['branch', '--list', branchName], {
      cwd: repoPath
    });

    if (localResult.stdout.trim()) {
      return true;
    }

    // Check remote branches
    const remoteResult = await runCommand('git', ['branch', '-r', '--list', `origin/${branchName}`], {
      cwd: repoPath
    });

    return remoteResult.stdout.trim() !== '';
  } catch (err) {
    console.error('Error checking branch existence:', err);
    return false;
  }
}

/**
 * Ensure staging branch exists, create it from main if it doesn't
 */
async function ensureStagingExists(repoPath) {
  console.log(`🔍 [Branch] Checking if ${STAGING_BRANCH} exists...`);

  // Fetch latest from remote
  await runCommand('git', ['fetch', 'origin'], { cwd: repoPath });

  const exists = await branchExists(STAGING_BRANCH, repoPath);

  if (!exists) {
    console.log(`🌿 [Branch] ${STAGING_BRANCH} doesn't exist, creating from ${MAIN_BRANCH}...`);

    // Checkout main and pull latest
    await runCommand('git', ['checkout', MAIN_BRANCH], { cwd: repoPath });
    await runCommand('git', ['pull', 'origin', MAIN_BRANCH], { cwd: repoPath });

    // Create staging from main
    await runCommand('git', ['checkout', '-b', STAGING_BRANCH], { cwd: repoPath });

    // Push staging to remote
    await runCommand('git', ['push', '-u', 'origin', STAGING_BRANCH], { cwd: repoPath });

    console.log(`✅ [Branch] Created ${STAGING_BRANCH} from ${MAIN_BRANCH}`);
  } else {
    console.log(`✅ [Branch] ${STAGING_BRANCH} exists`);
  }
}

/**
 * Handle POST /api/create-branch
 * Creates a branch from staging, adds issues file, commits, and creates draft PR
 */
export async function handleCreateBranch(req, res) {
  try {
    const data = await parseJsonBody(req);
    const { issueId, issueIdentifier } = data;

    if (!issueId || !issueIdentifier) {
      return respond(res, 400, {
        ok: false,
        error: 'Missing required fields: issueId, issueIdentifier'
      });
    }

    const config = getEffectiveConfig();

    if (!config.repoPath) {
      return respond(res, 500, {
        ok: false,
        error: 'No project selected and REPO_PATH not configured',
        requiresProjectSelection: true
      });
    }

    // Load project-specific env vars
    const projectEnv = await getActiveProjectEnv();
    const linearApiKey = projectEnv?.LINEAR_APP || null;
    const githubToken = projectEnv?.GITHUB_TOKEN || null;

    console.log(`🌿 [Branch] Creating branch for ${issueIdentifier}...`);

    // Fetch issue details from Linear
    const issue = await getIssue(issueId, linearApiKey);
    if (!issue) {
      return respond(res, 404, {
        ok: false,
        error: 'Issue not found in Linear'
      });
    }

    // Generate branch name: feature/{identifier}-{slugified-title}
    const identifier = issueIdentifier.toLowerCase();
    const titleSlug = slugify(issue.title);
    const branchName = `feature/${identifier}-${titleSlug}`;

    console.log(`📋 [Branch] Branch name: ${branchName}`);

    // Check if branch already exists
    const exists = await branchExists(branchName, config.repoPath);
    if (exists) {
      console.log(`⚠️  [Branch] Branch ${branchName} already exists`);
      return respond(res, 409, {
        ok: false,
        error: 'Branch already exists',
        branchName
      });
    }

    // Ensure staging branch exists
    await ensureStagingExists(config.repoPath);

    // Checkout staging and pull latest
    console.log(`🔄 [Branch] Checking out ${STAGING_BRANCH}...`);
    await runCommand('git', ['checkout', STAGING_BRANCH], { cwd: config.repoPath });

    console.log(`🔄 [Branch] Pulling latest ${STAGING_BRANCH}...`);
    await runCommand('git', ['pull', 'origin', STAGING_BRANCH], { cwd: config.repoPath });

    // Create new branch from staging
    console.log(`🌿 [Branch] Creating branch: ${branchName}`);
    await runCommand('git', ['checkout', '-b', branchName], { cwd: config.repoPath });

    // Create issues directory if it doesn't exist
    const issuesDir = path.join(config.repoPath, 'issues');
    if (!fs.existsSync(issuesDir)) {
      console.log('📁 [Branch] Creating issues directory...');
      fs.mkdirSync(issuesDir, { recursive: true });
    }

    // Create issue file
    const safeIdentifier = issueIdentifier.replace(/[^A-Za-z0-9-]/g, '');
    const issueFilePath = path.join(issuesDir, `${safeIdentifier}.md`);

    const issueContent = `# ${issueIdentifier}: ${issue.title}

**Priority:** ${issue.priority || 'N/A'}
**State:** ${issue.state?.name || 'Unknown'}
**URL:** ${issue.url}

## Description

${issue.description || 'No description provided'}

## Tasks

- [ ] Implement the feature
- [ ] Add tests
- [ ] Update documentation (if needed)
`;

    console.log(`📝 [Branch] Creating issue file: ${issueFilePath}`);
    fs.writeFileSync(issueFilePath, issueContent, 'utf8');

    // Stage and commit the file
    console.log('➕ [Branch] Adding issue file to git...');
    await runCommand('git', ['add', issueFilePath], { cwd: config.repoPath });

    console.log('💾 [Branch] Committing...');
    const commitMessage = `Add issue file for ${issueIdentifier}`;
    await runCommand('git', ['commit', '-m', commitMessage], { cwd: config.repoPath });

    // Push branch to origin
    console.log('⬆️  [Branch] Pushing to origin...');
    await runCommand('git', ['push', '-u', 'origin', branchName], { cwd: config.repoPath });

    // Create draft PR using GitHub API
    console.log('📝 [Branch] Creating draft PR...');
    const prBody = `Fixes ${issueIdentifier}

${issue.description || 'No description provided'}

**Linear Issue:** ${issue.url}`;

    const pr = await github.createPullRequest({
      owner: config.githubOwner,
      repo: config.githubRepo,
      title: `${issueIdentifier}: ${issue.title}`,
      head: branchName,
      base: STAGING_BRANCH,
      body: prBody,
      draft: true,
      token: githubToken
    });

    console.log(`✅ [Branch] Draft PR created: ${pr.html_url}`);

    // Go back to staging
    await runCommand('git', ['checkout', STAGING_BRANCH], { cwd: config.repoPath });

    return respond(res, 200, {
      ok: true,
      branchName,
      prUrl: pr.html_url,
      prNumber: pr.number
    });

  } catch (err) {
    console.error('❌ [Branch] Error:', err);
    return respond(res, 500, {
      ok: false,
      error: err.message
    });
  }
}

/**
 * Handle GET /api/branch-exists?branchName=...
 * Check if a branch exists and if it has a PR
 */
export async function handleBranchExists(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const branchName = url.searchParams.get('branchName');

    if (!branchName) {
      return respond(res, 400, {
        ok: false,
        error: 'Missing branchName parameter'
      });
    }

    const config = getEffectiveConfig();

    if (!config.repoPath) {
      return respond(res, 500, {
        ok: false,
        error: 'No project selected',
        requiresProjectSelection: true
      });
    }

    // Load project-specific env vars
    const projectEnv = await getActiveProjectEnv();
    const githubToken = projectEnv?.GITHUB_TOKEN || null;

    const exists = await branchExists(branchName, config.repoPath);

    let hasPR = false;
    if (exists) {
      // Check if there's a PR for this branch
      try {
        const prs = await github.getPullRequestsForBranch(branchName, 'all', {
          owner: config.githubOwner,
          repo: config.githubRepo,
          token: githubToken
        });
        hasPR = prs.length > 0;
      } catch (err) {
        console.log('⚠️ Could not check PR existence:', err.message);
      }
    }

    return respond(res, 200, {
      ok: true,
      exists,
      hasPR,
      branchName
    });

  } catch (err) {
    console.error('❌ [Branch] Error checking branch:', err);
    return respond(res, 500, {
      ok: false,
      error: err.message
    });
  }
}

/**
 * Handle POST /api/create-pr-only
 * Creates a PR for an existing branch
 */
export async function handleCreatePROnly(req, res) {
  try {
    const data = await parseJsonBody(req);
    const { issueId, issueIdentifier, branchName } = data;

    if (!issueId || !issueIdentifier || !branchName) {
      return respond(res, 400, {
        ok: false,
        error: 'Missing required fields: issueId, issueIdentifier, branchName'
      });
    }

    const config = getEffectiveConfig();

    if (!config.repoPath) {
      return respond(res, 500, {
        ok: false,
        error: 'No project selected',
        requiresProjectSelection: true
      });
    }

    // Load project-specific env vars
    const projectEnv = await getActiveProjectEnv();
    const linearApiKey = projectEnv?.LINEAR_APP || null;
    const githubToken = projectEnv?.GITHUB_TOKEN || null;

    console.log(`📝 [Branch] Creating PR for existing branch: ${branchName}`);

    // Fetch issue details from Linear
    const issue = await getIssue(issueId, linearApiKey);
    if (!issue) {
      return respond(res, 404, {
        ok: false,
        error: 'Issue not found in Linear'
      });
    }

    // Check if branch exists
    const exists = await branchExists(branchName, config.repoPath);
    if (!exists) {
      return respond(res, 404, {
        ok: false,
        error: 'Branch does not exist'
      });
    }

    // Ensure staging branch exists
    await ensureStagingExists(config.repoPath);

    // Verify the feature branch exists on remote
    console.log(`🔍 [Branch] Verifying ${branchName} exists on remote...`);
    const remoteBranchCheck = await runCommand('git', ['ls-remote', '--heads', 'origin', `refs/heads/${branchName}`], {
      cwd: config.repoPath
    });

    console.log(`🔍 [Branch] Remote check result: ${remoteBranchCheck.stdout.trim() ? 'Found' : 'Not found'}`);
    if (remoteBranchCheck.stdout.trim()) {
      console.log(`   Remote ref: ${remoteBranchCheck.stdout.trim()}`);
    }

    if (!remoteBranchCheck.stdout.trim()) {
      console.log(`⚠️  [Branch] Branch ${branchName} not found on remote, pushing...`);
      // Branch exists locally but not on remote, push it
      await runCommand('git', ['checkout', branchName], { cwd: config.repoPath });
      await runCommand('git', ['push', '-u', 'origin', branchName], { cwd: config.repoPath });
    }

    // Also verify staging exists on remote
    console.log(`🔍 [Branch] Verifying ${STAGING_BRANCH} exists on remote...`);
    const stagingCheck = await runCommand('git', ['ls-remote', '--heads', 'origin', `refs/heads/${STAGING_BRANCH}`], {
      cwd: config.repoPath
    });
    console.log(`🔍 [Branch] Staging check result: ${stagingCheck.stdout.trim() ? 'Found' : 'Not found'}`);
    if (stagingCheck.stdout.trim()) {
      console.log(`   Remote ref: ${stagingCheck.stdout.trim()}`);
    }

    // Give GitHub a moment to process the refs
    console.log('⏳ [Branch] Waiting for GitHub to process refs...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Create draft PR using GitHub API
    console.log('📝 [Branch] Creating draft PR...');
    console.log(`   Owner: ${config.githubOwner}`);
    console.log(`   Repo: ${config.githubRepo}`);
    console.log(`   Head: ${config.githubOwner}:${branchName}`);
    console.log(`   Base: ${STAGING_BRANCH}`);

    const prBody = `Fixes ${issueIdentifier}

${issue.description || 'No description provided'}

**Linear Issue:** ${issue.url}`;

    const pr = await github.createPullRequest({
      owner: config.githubOwner,
      repo: config.githubRepo,
      title: `${issueIdentifier}: ${issue.title}`,
      head: branchName,
      base: STAGING_BRANCH,
      body: prBody,
      draft: true,
      token: githubToken
    });

    console.log(`✅ [Branch] Draft PR created: ${pr.html_url}`);

    return respond(res, 200, {
      ok: true,
      branchName,
      prUrl: pr.html_url,
      prNumber: pr.number
    });

  } catch (err) {
    console.error('❌ [Branch] Error creating PR:', err);
    return respond(res, 500, {
      ok: false,
      error: err.message
    });
  }
}
