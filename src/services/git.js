import { runCommand } from '../utils/command.js';

export async function checkoutBranch(branch, cwd) {
  const results = [];

  // Fetch all branches
  results.push({
    step: 'fetch',
    ...(await runCommand('git', ['fetch', '--all', '--prune'], { cwd }))
  });

  // Check if remote branch exists
  const checkRemote = await runCommand('git', ['rev-parse', '--verify', `origin/${branch}`], { cwd });

  if (checkRemote.code === 0) {
    // Checkout tracking remote branch
    results.push({
      step: 'checkout-track',
      ...(await runCommand('git', ['checkout', '-B', branch, `origin/${branch}`], { cwd }))
    });
  } else {
    // Try plain checkout or create
    const co = await runCommand('git', ['checkout', branch], { cwd });
    results.push({ step: 'checkout', ...co });

    if (co.code !== 0) {
      results.push({
        step: 'create',
        ...(await runCommand('git', ['checkout', '-b', branch], { cwd }))
      });
    }
  }

  return results;
}

export async function getCurrentBranch(cwd) {
  const result = await runCommand('git', ['branch', '--show-current'], { cwd });
  return result.code === 0 ? result.stdout.trim() : null;
}

export async function getBranchStatus(cwd) {
  const result = await runCommand('git', ['status', '--porcelain'], { cwd });
  return result;
}

export async function deleteBranch(branch, cwd, force = false) {
  const flag = force ? '-D' : '-d';
  return runCommand('git', ['branch', flag, branch], { cwd });
}

export async function deleteRemoteBranch(branch, cwd) {
  return runCommand('git', ['push', 'origin', '--delete', branch], { cwd });
}

export async function hasUncommittedOrUnpushedChanges(cwd) {
  const result = { hasChanges: false, uncommitted: false, unpushed: false };

  // Check for uncommitted changes
  const statusResult = await runCommand('git', ['status', '--porcelain'], { cwd });
  if (statusResult.code === 0 && statusResult.stdout.trim()) {
    result.uncommitted = true;
    result.hasChanges = true;
  }

  // Check for unpushed commits (local ahead of remote)
  const revListResult = await runCommand('git', ['rev-list', '@{u}..HEAD'], { cwd });
  if (revListResult.code === 0 && revListResult.stdout.trim()) {
    result.unpushed = true;
    result.hasChanges = true;
  }

  return result;
}
