import { respond } from '../utils/http.js';
import { runCommand } from '../utils/command.js';
import { exists } from '../services/worktree.js';
import { getPullRequestsForBranch } from '../services/github.js';
import { moveIssueToDone } from '../services/linear.js';
import { REPO_PATH, WORKTREE_REPO_PATH, LINEAR_API_KEY } from '../config/env.js';
import { getProjectContextSync, getActiveProjectEnv } from '../services/projects.js';

export async function handleCleanupBranch(req, res) {
  if (req.method !== 'POST') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', async () => {
    try {
      const { path: directoryPath, branch, ticketId } = JSON.parse(body);

      if (!directoryPath || !branch) {
        return respond(res, 400, { ok: false, error: 'path and branch required' });
      }

      console.log(`🗑️  Cleaning up branch: ${branch}`);

      const errors = [];
      const warnings = [];

      // Get project context or fall back to env vars
      const ctx = getProjectContextSync();
      const cwd = ctx?.WORKTREE_REPO_PATH || WORKTREE_REPO_PATH || ctx?.REPO_PATH || REPO_PATH;

      // Validate environment
      if (!cwd) {
        return respond(res, 500, { ok: false, error: 'No project selected and REPO_PATH not configured', requiresProjectSelection: !ctx });
      }

      // Verify directory exists
      if (!exists(directoryPath)) {
        return respond(res, 400, { ok: false, error: `Worktree directory does not exist: ${directoryPath}` });
      }

      // Get project env for GitHub token
      const projectEnv = await getActiveProjectEnv();

      // Run pre-flight checks
      const checkResult = await runPreflightChecks(branch, directoryPath, cwd, projectEnv);
      if (!checkResult.ok) {
        return respond(res, checkResult.status, { ok: false, error: checkResult.error, warnings: checkResult.warnings });
      }

      warnings.push(...checkResult.warnings);
      console.log(`✅ All pre-flight checks passed, proceeding with cleanup...`);

      // Perform cleanup
      await cleanupWorktree(directoryPath, cwd, errors, warnings);
      await cleanupBranches(branch, cwd, errors, warnings);

      // Update Linear if ticket ID provided
      if (ticketId) {
        await updateLinearIssue(ticketId, errors, warnings);
      }

      // Return result
      const result = {
        ok: errors.length === 0,
        message: errors.length === 0 ? 'Branch cleaned up successfully' : 'Cleanup completed with errors'
      };

      if (errors.length > 0) {
        result.errors = errors;
        console.error(`⚠️ Cleanup completed with errors:`, errors);
      }

      if (warnings.length > 0) {
        result.warnings = warnings;
        console.log(`⚠️  Warnings:`, warnings);
      }

      const status = errors.length > 0 ? 207 : 200;
      if (errors.length === 0) {
        console.log(`✅ Cleanup completed successfully`);
      }

      return respond(res, status, result);
    } catch (e) {
      console.error(`❌ Cleanup failed:`, e.message);
      return respond(res, 500, { ok: false, error: e.message });
    }
  });
}

async function runPreflightChecks(branch, directoryPath, cwd, projectEnv) {
  const warnings = [];

  // Check PR merge status
  try {
    console.log(`📡 Checking GitHub PR merge status for ${branch}...`);
    const ctx = getProjectContextSync();
    const prs = await getPullRequestsForBranch(branch, 'all', {
      owner: ctx?.GITHUB_REPO_OWNER || projectEnv?.GITHUB_REPO_OWNER,
      repo: ctx?.GITHUB_REPO_NAME || projectEnv?.GITHUB_REPO_NAME,
      token: projectEnv?.GITHUB_TOKEN
    });
    const mergedPR = prs.find(pr => pr.merged_at);

    if (!mergedPR) {
      return {
        ok: false,
        status: 400,
        error: 'Branch does not have a merged PR. Cannot cleanup unmerged branch.'
      };
    }
    console.log(`✅ PR #${mergedPR.number} is merged`);
  } catch (err) {
    if (err.message.includes('not configured')) {
      warnings.push('GitHub not configured, skipping PR merge verification');
      console.log(`⚠️  GitHub not configured, skipping PR merge verification`);
    } else {
      return { ok: false, status: 500, error: `Error checking PR merge status: ${err.message}` };
    }
  }

  // Check for uncommitted changes
  console.log(`📋 Checking for local changes in worktree...`);
  const statusResult = await runCommand('git', ['status', '--porcelain'], { cwd: directoryPath });
  if (statusResult.code === 0) {
    const hasChanges = statusResult.stdout.trim().length > 0;
    if (hasChanges) {
      console.error(`❌ Worktree has uncommitted changes:`, statusResult.stdout);
      return {
        ok: false,
        status: 400,
        error: 'Worktree has uncommitted changes. Please commit or discard them before cleanup.'
      };
    }
    console.log(`✅ No local changes`);
  } else {
    return { ok: false, status: 500, error: `Could not check git status: ${statusResult.stderr}` };
  }

  // Check for unpushed commits
  console.log(`🔄 Checking for unpushed commits...`);
  const unpushedResult = await runCommand('git', ['log', `origin/${branch}..${branch}`, '--oneline'], { cwd: directoryPath });
  if (unpushedResult.code === 0) {
    const hasUnpushed = unpushedResult.stdout.trim().length > 0;
    if (hasUnpushed) {
      console.error(`❌ Branch has unpushed commits:`, unpushedResult.stdout);
      return {
        ok: false,
        status: 400,
        error: 'Branch has unpushed commits. Please push them before cleanup.'
      };
    }
    console.log(`✅ No unpushed commits`);
  } else {
    warnings.push('Could not check unpushed commits (remote branch may not exist)');
    console.log(`⚠️  Could not check unpushed commits: ${unpushedResult.stderr}`);
  }

  return { ok: true, warnings };
}

async function cleanupWorktree(directoryPath, cwd, errors, warnings) {
  const listResult = await runCommand('git', ['worktree', 'list', '--porcelain'], { cwd });
  const isRegistered = listResult.stdout.includes(directoryPath);

  if (isRegistered) {
    console.log(`📁 Removing worktree: ${directoryPath}`);
    const removeResult = await runCommand('git', ['worktree', 'remove', directoryPath, '--force'], { cwd });
    if (removeResult.code !== 0) {
      errors.push(`Failed to remove worktree: ${removeResult.stderr}`);
    } else {
      console.log(`✅ Worktree removed`);
    }
  } else {
    warnings.push('Worktree not registered in git, skipping removal');
    console.log(`⚠️  Worktree not registered, skipping removal`);
  }
}

async function cleanupBranches(branch, cwd, errors, warnings) {
  // Delete local branch
  console.log(`🔧 Checking and deleting local branch: ${branch}`);
  const branchCheckResult = await runCommand('git', ['rev-parse', '--verify', branch], { cwd });
  if (branchCheckResult.code === 0) {
    const deleteLocalResult = await runCommand('git', ['branch', '-D', branch], { cwd });
    if (deleteLocalResult.code !== 0) {
      errors.push(`Failed to delete local branch: ${deleteLocalResult.stderr}`);
    } else {
      console.log(`✅ Local branch deleted`);
    }
  } else {
    warnings.push('Local branch does not exist, skipping');
    console.log(`ℹ️  Local branch already deleted, skipping`);
  }

  // Delete remote branch
  console.log(`🌐 Checking and deleting remote branch: ${branch}`);
  const remoteCheckResult = await runCommand('git', ['ls-remote', '--heads', 'origin', branch], { cwd });
  if (remoteCheckResult.code === 0 && remoteCheckResult.stdout.trim().length > 0) {
    const deleteRemoteResult = await runCommand('git', ['push', 'origin', '--delete', branch], { cwd });
    if (deleteRemoteResult.code !== 0) {
      const stderr = deleteRemoteResult.stderr.toLowerCase();
      if (stderr.includes('remote ref does not exist') || stderr.includes('does not exist')) {
        warnings.push('Remote branch already deleted');
        console.log(`ℹ️  Remote branch already deleted`);
      } else {
        errors.push(`Failed to delete remote branch: ${deleteRemoteResult.stderr}`);
      }
    } else {
      console.log(`✅ Remote branch deleted`);
    }
  } else {
    warnings.push('Remote branch does not exist, skipping');
    console.log(`ℹ️  Remote branch already deleted, skipping`);
  }
}

async function updateLinearIssue(ticketId, errors, warnings) {
  if (!LINEAR_API_KEY) {
    warnings.push('Linear API key not configured, skipping issue update');
    console.log(`⚠️  Linear API key not configured, skipping issue update`);
    return;
  }

  console.log(`📝 Updating Linear issue ${ticketId} to "Done"`);
  try {
    await moveIssueToDone(ticketId);
    console.log(`✅ Linear issue updated to "Done"`);
  } catch (err) {
    errors.push(`Error updating Linear issue: ${err.message}`);
  }
}

export async function handleHideWorktree(req, res) {
  if (req.method !== 'POST') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', async () => {
    try {
      const { path: directoryPath } = JSON.parse(body);

      if (!directoryPath) {
        return respond(res, 400, { ok: false, error: 'path required' });
      }

      if (!exists(directoryPath)) {
        return respond(res, 400, { ok: false, error: 'directory does not exist' });
      }

      console.log(`🙈 Hiding directory: ${directoryPath}`);
      const result = await runCommand('chflags', ['hidden', directoryPath]);

      if (result.code === 0) {
        console.log(`✅ Successfully hidden directory: ${directoryPath}`);
        return respond(res, 200, { ok: true });
      } else {
        console.error(`❌ Failed to hide directory: ${result.stderr}`);
        return respond(res, 500, { ok: false, error: result.stderr || 'Failed to hide directory' });
      }
    } catch (e) {
      return respond(res, 500, { ok: false, error: e.message });
    }
  });
}
