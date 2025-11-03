import { runCommand } from '../utils/command.js';
import { WORKTREE_REPO_PATH } from '../config/env.js';
import fs from 'fs';
import path from 'path';

/**
 * Get new issues added since the last production release tag
 * Replicates the logic from .github/workflows/tag-production.yml
 */
export async function getNewIssuesSinceLastRelease() {
  if (!WORKTREE_REPO_PATH) {
    throw new Error('WORKTREE_REPO_PATH not configured');
  }

  const baseBranch = process.env.DEFAULT_BASE_BRANCH || 'main';

  // Get the most recent release-* tag
  const tagResult = await runCommand(
    'git',
    ['tag', '--merged', baseBranch, '--list', 'release-*', '--sort=-creatordate'],
    { cwd: WORKTREE_REPO_PATH }
  );

  let previousTag = null;
  if (tagResult.code === 0 && tagResult.stdout.trim()) {
    previousTag = tagResult.stdout.trim().split('\n')[0];
  }

  let newIssueFiles = [];

  if (previousTag) {
    // Find Added/Modified files since previous tag on base branch
    const diffResult = await runCommand(
      'git',
      ['diff', '--name-only', '--diff-filter=AM', `${previousTag}..${baseBranch}`, '--', 'issues/'],
      { cwd: WORKTREE_REPO_PATH }
    );

    if (diffResult.code === 0 && diffResult.stdout.trim()) {
      const candidateFiles = diffResult.stdout.trim().split('\n').filter(f => f.endsWith('.md'));

      // Filter to only files that didn't exist in previous tag
      for (const file of candidateFiles) {
        const lsTreeResult = await runCommand(
          'git',
          ['ls-tree', '-r', previousTag, '--', file],
          { cwd: WORKTREE_REPO_PATH }
        );

        // If ls-tree returns nothing, file didn't exist in previous tag
        if (lsTreeResult.code === 0 && !lsTreeResult.stdout.trim()) {
          newIssueFiles.push(file);
        }
      }
    }
  } else {
    // No previous tag - get all issues from base branch
    const lsFilesResult = await runCommand(
      'git',
      ['ls-tree', '-r', '--name-only', baseBranch, '--', 'issues/'],
      { cwd: WORKTREE_REPO_PATH }
    );

    if (lsFilesResult.code === 0 && lsFilesResult.stdout.trim()) {
      newIssueFiles = lsFilesResult.stdout.trim().split('\n').filter(f => f.endsWith('.md'));
    }
  }

  // Read content of new issue files from base branch
  const issues = [];
  for (const file of newIssueFiles) {
    // Use git show to read file from base branch
    const showResult = await runCommand(
      'git',
      ['show', `${baseBranch}:${file}`],
      { cwd: WORKTREE_REPO_PATH }
    );

    if (showResult.code === 0) {
      issues.push({
        file,
        filename: path.basename(file),
        content: showResult.stdout
      });
    }
  }

  return {
    hasNewIssues: issues.length > 0,
    previousTag,
    issuesCount: issues.length,
    issues
  };
}

/**
 * Format issues diff as markdown (similar to GitHub release notes)
 */
export function formatIssuesDiff(diffData) {
  if (!diffData.hasNewIssues) {
    if (diffData.previousTag) {
      return `No new issues since ${diffData.previousTag}`;
    } else {
      return 'No issues found';
    }
  }

  let markdown = '';

  if (diffData.previousTag) {
    markdown += `## New Issues Since ${diffData.previousTag}\n\n`;
  } else {
    markdown += `## All Issues (First Release)\n\n`;
  }

  markdown += `**${diffData.issuesCount}** new issue${diffData.issuesCount !== 1 ? 's' : ''}\n\n`;
  markdown += '---\n\n';

  for (const issue of diffData.issues) {
    markdown += issue.content;
    markdown += '\n\n---\n\n';
  }

  return markdown;
}
