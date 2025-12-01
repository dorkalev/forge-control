import path from 'path';
import fs from 'fs';
import { respond } from '../utils/http.js';
import { getIssue, getIssueByBranchName } from '../services/linear.js';
import { getBranchNameFromPath, resolveWorktreeBaseDir } from '../services/worktree.js';
import { getPullRequestsForBranch, getPullRequest, getReviewThreads, getCheckRuns, getTags, isConfigured as isGithubConfigured } from '../services/github.js';
import { hasUncommittedOrUnpushedChanges } from '../services/git.js';
import { LINEAR_API_KEY, GITHUB_REPO_OWNER, GITHUB_REPO_NAME, WORKTREE_BASE_PATH, REPO_PATH } from '../config/env.js';
import { getProjectContextSync } from '../services/projects.js';

export async function handleFolderStatus(req, res, query) {
  const folderName = query.folder;
  if (!folderName) {
    return respond(res, 400, { success: false, error: 'Missing folder parameter' });
  }

  // Get project context for GitHub owner/repo
  const ctx = getProjectContextSync();
  const githubOwner = ctx?.GITHUB_REPO_OWNER || GITHUB_REPO_OWNER;
  const githubRepo = ctx?.GITHUB_REPO_NAME || GITHUB_REPO_NAME;

  try {
    const result = { success: true, folder: folderName, linear: null, github: null, git: null };

    // Extract Linear ticket ID from folder name
    let linearIdMatch = folderName.match(/([A-Z]+)-(\d+)/);
    let linearId = linearIdMatch ? linearIdMatch[0] : null;

    // Convert folder name to branch name: fix_aikido-... -> fix/aikido-...
    const branchName = folderName.replace(/^([^_]+)_/, '$1/');

    // Get worktree path and check git status
    const worktreeBasePath = resolveWorktreeBaseDir();
    const worktreePath = path.join(worktreeBasePath, folderName);

    try {
      if (fs.existsSync(worktreePath)) {
        result.git = await hasUncommittedOrUnpushedChanges(worktreePath);
      }
    } catch (err) {
      console.error('Error checking git status:', err.message);
    }

    // Fetch Linear ticket status
    if (LINEAR_API_KEY) {
      try {
        if (linearId) {
          // Method 1: Query by ticket ID (e.g., A-303)
          console.log(`🔍 Searching Linear by ID: ${linearId}`);
          const issue = await getIssue(linearId);
          result.linear = issue || { error: 'Issue not found' };
          console.log(`📊 Linear response for ${linearId}:`, JSON.stringify(result.linear, null, 2));
        } else {
          // Method 2: For branches without Linear ID in folder name (e.g., Aikido PRs)
          console.log(`🔍 Converted folder to branch name: ${branchName}`);

          // Search GitHub for PRs with this branch
          if (isGithubConfigured()) {
            try {
              const prs = await getPullRequestsForBranch(branchName);
              if (prs.length > 0) {
                console.log(`📋 Found ${prs.length} PR(s) for branch ${branchName}`);

                // Parse Linear issue from first PR
                const pr = prs[0];
                const prLinearMatch = pr.body?.match(/https:\/\/linear\.app\/[^\/]+\/issue\/([A-Z]+-\d+)/i);
                const prLinearId = prLinearMatch ? prLinearMatch[1].toUpperCase() : null;

                if (prLinearId) {
                  console.log(`🎯 Found Linear issue ${prLinearId} from PR #${pr.number}`);
                  const issue = await getIssue(prLinearId);
                  if (issue) {
                    result.linear = issue;
                    console.log(`📊 Linear response for ${prLinearId}:`, JSON.stringify(result.linear, null, 2));
                  }
                } else {
                  console.log(`⚠️  No Linear issue found in PR #${pr.number} body`);
                }
              } else {
                console.log(`⚠️  No PRs found for branch: ${branchName}`);
              }
            } catch (err) {
              console.error(`Error searching GitHub PRs: ${err.message}`);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching Linear status:', err.message);
        result.linear = { error: err.message };
      }
    }

    // Fetch GitHub PR status
    if (isGithubConfigured()) {
      try {
        let prs = [];

        // First, try to get PRs from Linear attachments if we have a Linear issue
        if (result.linear && !result.linear.error && result.linear.attachments) {
          console.log(`🔍 Checking Linear attachments for GitHub PRs...`);
          const githubAttachments = result.linear.attachments.nodes.filter(att =>
            att.url && att.url.includes('github.com') && att.url.includes('/pull/')
          );

          console.log(`📎 Found ${githubAttachments.length} GitHub PR attachments in Linear`);

          for (const attachment of githubAttachments) {
            // Extract PR number from URL: https://github.com/owner/repo/pull/123
            const prMatch = attachment.url.match(/\/pull\/(\d+)/);
            if (prMatch) {
              const prNumber = parseInt(prMatch[1], 10);
              try {
                console.log(`🔍 Fetching PR #${prNumber} from GitHub...`);
                const pr = await getPullRequest(prNumber);

                // Only include PR if it matches the current branch
                if (pr.head.ref === branchName) {
                  prs.push(pr);
                  console.log(`✓ Found PR #${pr.number}: ${pr.title} (${pr.state}) - matches branch ${branchName}`);
                } else {
                  console.log(`⏭️  Skipping PR #${pr.number} (branch: ${pr.head.ref}, expected: ${branchName})`);
                }
              } catch (err) {
                console.error(`Error fetching PR #${prNumber}:`, err.message);
              }
            }
          }
        }

        // Fallback: Try searching by branch name if no PRs found from Linear
        if (prs.length === 0) {
          console.log(`🔍 Searching for PRs with head: ${githubOwner}:${branchName}`);
          prs = await getPullRequestsForBranch(branchName);
          console.log(`📊 Found ${prs.length} PRs for ${branchName}:`, prs.map(pr => `#${pr.number} (${pr.state}${pr.merged_at ? ', merged' : ''}, head: ${pr.head.ref})`).join(', '));
        }

        const prDataPromises = prs.map(pr => enrichPRData(pr, githubOwner, githubRepo));
        result.github = await Promise.all(prDataPromises);
      } catch (err) {
        console.error('Error fetching GitHub status:', err.message);
        result.github = { error: err.message };
      }
    } else {
      console.log('⚠️ Skipping GitHub PR fetch - missing GITHUB_REPO_OWNER, GITHUB_REPO_NAME, or GITHUB_TOKEN');
      result.github = null;
    }

    return respond(res, 200, result);
  } catch (error) {
    console.error('❌ Failed to get folder status:', error.message);
    return respond(res, 500, { success: false, error: error.message });
  }
}

async function enrichPRData(pr, githubOwner, githubRepo) {
  const prData = {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    url: pr.html_url,
    created_at: pr.created_at,
    updated_at: pr.updated_at,
    merged_at: pr.merged_at,
    draft: pr.draft,
    head_ref: pr.head.ref,
    tags: [],
    reviewThreads: { total: 0, resolved: 0, unresolved: 0 },
    checkRuns: [],
    suggestCleanup: false
  };

  // Fetch review threads for open PRs
  if (pr.state === 'open') {
    try {
      const data = await getReviewThreads(pr.number);
      const threads = data.data?.repository?.pullRequest?.reviewThreads;
      if (threads) {
        prData.reviewThreads.total = threads.totalCount;
        prData.reviewThreads.resolved = threads.nodes.filter(t => t.isResolved).length;
        prData.reviewThreads.unresolved = threads.nodes.filter(t => !t.isResolved).length;
      }
    } catch (err) {
      console.error(`Error fetching review threads for PR #${pr.number}:`, err.message);
    }

    // Fetch check runs
    try {
      const data = await getCheckRuns(pr.head.sha);
      prData.checkRuns = data.check_runs.map(run => ({
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        url: run.html_url,
        started_at: run.started_at,
        completed_at: run.completed_at
      }));
    } catch (err) {
      console.error(`Error fetching check runs for PR #${pr.number}:`, err.message);
    }
  }

  // Fetch tags for merged PRs
  if (pr.merged_at && pr.merge_commit_sha) {
    try {
      console.log(`🏷️  Fetching tags for merge commit: ${pr.merge_commit_sha}`);
      const tags = await getTags();
      const matchingTags = tags.filter(tag => tag.commit.sha === pr.merge_commit_sha);
      if (matchingTags.length > 0) {
        console.log(`🏷️  Found ${matchingTags.length} tags for PR #${pr.number}: ${matchingTags.map(t => t.name).join(', ')}`);
        prData.tags = matchingTags.map(tag => ({
          name: tag.name,
          url: `https://github.com/${githubOwner}/${githubRepo}/releases/tag/${tag.name}`
        }));
      }
    } catch (err) {
      console.error(`Error fetching tags for PR #${pr.number}:`, err.message);
    }

    prData.suggestCleanup = true;
  }

  return prData;
}
