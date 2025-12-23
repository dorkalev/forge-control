import fs from 'fs';
import path from 'path';
import { runCommand } from '../utils/command.js';
import { REPO_PATH, WORKTREE_BASE_PATH, WORKTREE_REPO_PATH } from '../config/env.js';
import { getProjectContextSync, getActiveProjectEnv } from './projects.js';

// Cache for forge config (async-loaded, used by sync functions)
let cachedForgeConfig = null;

/**
 * Load forge config from active project (call this before using sync getters)
 */
export async function loadForgeConfig() {
  cachedForgeConfig = await getActiveProjectEnv();
  return cachedForgeConfig;
}

/**
 * Get the effective repo path, preferring .forge > project context > env vars
 */
function getEffectiveRepoPath() {
  if (cachedForgeConfig?.LOCAL_REPO_PATH) return cachedForgeConfig.LOCAL_REPO_PATH;
  const ctx = getProjectContextSync();
  return ctx?.REPO_PATH || REPO_PATH;
}

function getEffectiveWorktreeBasePath() {
  if (cachedForgeConfig?.WORKTREE_BASE_PATH) return cachedForgeConfig.WORKTREE_BASE_PATH;
  const ctx = getProjectContextSync();
  return ctx?.WORKTREE_BASE_PATH || WORKTREE_BASE_PATH;
}

function getEffectiveWorktreeRepoPath() {
  if (cachedForgeConfig?.WORKTREE_REPO_PATH) return cachedForgeConfig.WORKTREE_REPO_PATH;
  const ctx = getProjectContextSync();
  return ctx?.WORKTREE_REPO_PATH || WORKTREE_REPO_PATH;
}

export function mapBranchToDir(branch) {
  // Keep alnum, dash, dot and underscore; replace others (including '/') with '_'
  return branch.replace(/[^A-Za-z0-9._-]/g, '_');
}

export function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export async function readIssueDescription(worktreePath) {
  const issuesDir = path.join(worktreePath, 'issues');
  if (!exists(issuesDir)) return null;

  try {
    const files = fs.readdirSync(issuesDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    if (mdFiles.length === 0) return null;

    // Extract ticket ID from worktree path (e.g., "bol-31" from "bol-31-communicate-new-features...")
    const folderName = path.basename(worktreePath);
    const ticketIdMatch = folderName.match(/^([A-Za-z]+-\d+)/i);
    const ticketId = ticketIdMatch ? ticketIdMatch[1].toUpperCase() : null;

    // Try to find the matching issue file, fall back to first .md file
    let mdFile;
    if (ticketId) {
      // Match case-insensitively since folder might be lowercase but file might be uppercase
      mdFile = mdFiles.find(f => f.toUpperCase().startsWith(ticketId)) || mdFiles[0];
    } else {
      mdFile = mdFiles[0];
    }

    const fullPath = path.join(issuesDir, mdFile);
    console.log(`📖 Reading issue from: ${fullPath} (folder: ${folderName}, ticketId: ${ticketId})`);

    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');

    // Extract title (first line after #)
    const titleLine = lines.find(line => line.startsWith('# '));
    const title = titleLine ? titleLine.replace('# ', '').trim() : null;

    // Always include issueFile
    const issueFile = `issues/${mdFile}`;

    // Extract description section (optional)
    const descIndex = lines.findIndex(line => line.trim() === '## Description');
    if (descIndex === -1) {
      console.log(`📖 Extracted: title="${title?.substring(0, 50)}...", file="${issueFile}" (no ## Description section)`);
      return { title, issueFile };
    }

    let description = '';
    for (let i = descIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('## ') || line.startsWith('---')) break;
      if (line) description += line + ' ';
    }

    const result = { title, description: description.trim(), issueFile };
    console.log(`📖 Extracted: title="${title?.substring(0, 50)}...", desc="${result.description.substring(0, 50)}...", file="${result.issueFile}"`);
    return result;
  } catch (e) {
    console.error(`❌ Error reading issue from ${worktreePath}:`, e.message);
    return null;
  }
}

export async function listWorktrees(cwd) {
  const result = await runCommand('git', ['worktree', 'list', '--porcelain'], { cwd });

  if (result.code !== 0) {
    return [];
  }

  const worktrees = [];
  const lines = result.stdout.split('\n');
  let current = {};

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      if (current.path) worktrees.push(current);
      current = { path: line.slice('worktree '.length).trim() };
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).trim();
    }
  }

  if (current.path) worktrees.push(current);
  return worktrees;
}

export async function getBranchNameFromPath(worktreePath) {
  try {
    const result = await runCommand('git', ['branch', '--show-current'], { cwd: worktreePath });

    if (result.code === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  } catch (err) {
    console.error(`Error getting branch name from ${worktreePath}:`, err.message);
  }

  return null;
}

export function resolveWorktreeBaseDir() {
  const repoPath = getEffectiveRepoPath();
  let srcDir = getEffectiveWorktreeBasePath();
  if (!srcDir) {
    const projectFolder = process.env.PROJECT_FOLDER_NAME || 'project';
    const looksLikeProjectSrc = path.basename(repoPath) === projectFolder && path.basename(path.dirname(repoPath)) === 'src';
    srcDir = looksLikeProjectSrc ? repoPath : path.join(repoPath, 'src', projectFolder);
  }
  return srcDir;
}

export async function createWorktree(branch) {
  // Load forge config from active project before using paths
  await loadForgeConfig();

  const worktreeRepoPath = getEffectiveWorktreeRepoPath();
  const results = [];
  const srcDir = resolveWorktreeBaseDir();

  // Ensure base directory exists
  if (!exists(srcDir)) {
    try {
      fs.mkdirSync(srcDir, { recursive: true });
    } catch (e) {
      throw new Error(`Failed to create worktree base at ${srcDir}: ${e.message}`);
    }
  }

  const dirName = mapBranchToDir(branch);
  const worktreePath = path.join(srcDir, dirName);

  // Check if worktree already exists
  const existingWorktrees = await listWorktrees(worktreeRepoPath);
  const existing = existingWorktrees.find(wt => path.resolve(wt.path) === path.resolve(worktreePath));

  if (existing) {
    return { ok: true, branch, worktreePath, existed: true, results };
  }

  // Ensure parent dir exists
  try {
    fs.mkdirSync(worktreePath, { recursive: true });
  } catch {}

  // Fetch remote and add worktree tracking remote branch
  results.push({
    step: 'fetch',
    ...(await runCommand('git', ['fetch', '--all', '--prune'], { cwd: worktreeRepoPath }))
  });

  const verify = await runCommand('git', ['rev-parse', '--verify', `origin/${branch}`], { cwd: worktreeRepoPath });
  results.push({ step: 'verify-origin-branch', ...verify });

  let baseBranch = `origin/${branch}`;

  if (verify.code !== 0) {
    // Branch doesn't exist on remote, create from main
    console.log(`ℹ️  Branch ${branch} doesn't exist on remote, will create from main`);
    baseBranch = 'main';
  } else {
    // Fetch the specific branch to ensure we have the absolute latest state
    const fetchBranch = await runCommand('git', ['fetch', 'origin', branch], { cwd: worktreeRepoPath });
    results.push({ step: 'fetch-branch-latest', ...fetchBranch });
  }

  const add = await runCommand(
    'git',
    ['worktree', 'add', '-B', branch, worktreePath, baseBranch],
    { cwd: worktreeRepoPath }
  );
  results.push({ step: 'worktree-add', ...add });

  const ok = add.code === 0;

  // Copy .env file and .claude directory to the new worktree if successful
  if (ok) {
    await copyWorktreeFiles(worktreePath, worktreeRepoPath, results);
    await installForgeComplianceAgent(worktreePath, results);
    await initSubmodules(worktreePath, results);
  }

  return {
    ok,
    branch,
    worktreePath,
    results,
    error: ok ? undefined : add.stderr || add.stdout || 'failed to add worktree'
  };
}

async function copyWorktreeFiles(worktreePath, worktreeRepoPath, results) {
  // Copy .env file
  const sourceEnvPath = path.join(worktreeRepoPath, '.env');
  const targetEnvPath = path.join(worktreePath, '.env');

  if (exists(sourceEnvPath)) {
    try {
      fs.copyFileSync(sourceEnvPath, targetEnvPath);
      console.log(`✅ Copied .env to worktree: ${targetEnvPath}`);
      results.push({ step: 'copy-env', code: 0, message: 'Copied .env file' });
    } catch (err) {
      console.error(`⚠️  Failed to copy .env: ${err.message}`);
      results.push({ step: 'copy-env', code: 1, error: err.message });
    }
  } else {
    console.log(`ℹ️  No .env file found at ${sourceEnvPath}`);
    results.push({ step: 'copy-env', code: 0, message: 'No .env file to copy' });
  }

  // Copy .claude directory (Claude Code subagent settings)
  const sourceClaudePath = path.join(worktreeRepoPath, '.claude');
  const targetClaudePath = path.join(worktreePath, '.claude');

  if (exists(sourceClaudePath)) {
    try {
      fs.cpSync(sourceClaudePath, targetClaudePath, { recursive: true });
      console.log(`✅ Copied .claude directory to worktree: ${targetClaudePath}`);
      results.push({ step: 'copy-claude', code: 0, message: 'Copied .claude directory' });
    } catch (err) {
      console.error(`⚠️  Failed to copy .claude directory: ${err.message}`);
      results.push({ step: 'copy-claude', code: 1, error: err.message });
    }
  } else {
    console.log(`ℹ️  No .claude directory found at ${sourceClaudePath}`);
    results.push({ step: 'copy-claude', code: 0, message: 'No .claude directory to copy' });
  }

  // Symlink .forge file (for forge-control worktrees)
  const sourceForgePath = path.join(worktreeRepoPath, '.forge');
  const targetForgePath = path.join(worktreePath, '.forge');

  if (exists(sourceForgePath) && !exists(targetForgePath)) {
    try {
      fs.symlinkSync(sourceForgePath, targetForgePath);
      console.log(`✅ Symlinked .forge to worktree: ${targetForgePath}`);
      results.push({ step: 'symlink-forge', code: 0, message: 'Symlinked .forge file' });
    } catch (err) {
      console.error(`⚠️  Failed to symlink .forge: ${err.message}`);
      results.push({ step: 'symlink-forge', code: 1, error: err.message });
    }
  }
}

/**
 * Install forge-compliance agent if not already present
 * Sources the agent from a template location (FORGE_AGENT_TEMPLATE_PATH or ~/src/luigix)
 */
async function installForgeComplianceAgent(worktreePath, results) {
  const agentFileName = 'forge-compliance.md';
  const targetAgentsDir = path.join(worktreePath, '.claude', 'agents');
  const targetAgentPath = path.join(targetAgentsDir, agentFileName);

  // Skip if already exists
  if (exists(targetAgentPath)) {
    console.log(`ℹ️  forge-compliance agent already exists at ${targetAgentPath}`);
    results.push({ step: 'install-forge-compliance', code: 0, message: 'Agent already exists' });
    return;
  }

  // Find template source - check env var or use default luigix location
  const templateBase = process.env.FORGE_AGENT_TEMPLATE_PATH ||
    path.join(process.env.HOME, 'src', 'luigix');
  const sourceAgentPath = path.join(templateBase, '.claude', 'agents', agentFileName);

  if (!exists(sourceAgentPath)) {
    console.log(`ℹ️  No forge-compliance template found at ${sourceAgentPath}`);
    results.push({ step: 'install-forge-compliance', code: 0, message: 'No template found' });
    return;
  }

  try {
    // Ensure .claude/agents directory exists
    fs.mkdirSync(targetAgentsDir, { recursive: true });

    // Copy the agent file
    fs.copyFileSync(sourceAgentPath, targetAgentPath);
    console.log(`✅ Installed forge-compliance agent to ${targetAgentPath}`);
    results.push({ step: 'install-forge-compliance', code: 0, message: 'Installed forge-compliance agent' });
  } catch (err) {
    console.error(`⚠️  Failed to install forge-compliance agent: ${err.message}`);
    results.push({ step: 'install-forge-compliance', code: 1, error: err.message });
  }
}

/**
 * Initialize git submodules in the worktree
 */
async function initSubmodules(worktreePath, results) {
  // Check if there are any submodules
  const gitmodulesPath = path.join(worktreePath, '.gitmodules');
  if (!exists(gitmodulesPath)) {
    console.log(`ℹ️  No .gitmodules found, skipping submodule init`);
    return;
  }

  console.log(`📦 Initializing submodules in ${worktreePath}...`);

  // Initialize and update submodules (non-recursive to avoid issues with nested submodules)
  const submoduleInit = await runCommand('git', ['submodule', 'update', '--init'], { cwd: worktreePath });
  results.push({ step: 'submodule-init', ...submoduleInit });

  if (submoduleInit.code === 0) {
    console.log(`✅ Submodules initialized successfully`);
  } else {
    console.error(`⚠️  Submodule init had issues: ${submoduleInit.stderr || submoduleInit.stdout}`);
  }
}
