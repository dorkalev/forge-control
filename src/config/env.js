import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

export const PORT = parseInt(process.env.LOCAL_AGENT_PORT || '4665', 10);
export const TOKEN = process.env.LOCAL_AGENT_TOKEN || '';

// LOCAL_REPO_PATH: base project path; worktrees placed under <base>/src/<project>/<branch>
// If LOCAL_REPO_PATH already points to <base>/src/<project>, we will not append again.
export const REPO_PATH = process.env.LOCAL_REPO_PATH || '';

// Optional explicit override for the directory that will directly contain per-branch worktrees
// e.g. /path/to/repo/src/<project>. If set, we use this as-is.
export const WORKTREE_BASE_PATH = process.env.WORKTREE_BASE_PATH || process.env.LOCAL_WORKTREE_BASE_PATH || '';

// WORKTREE_REPO_PATH: the Git repository whose branch will be checked out as a worktree
export const WORKTREE_REPO_PATH = process.env.WORKTREE_REPO_PATH || process.env.LOCAL_WORKTREE_REPO_PATH || '';

// Local dev URL for opening in browser
export const LOCAL_DEV_URL = process.env.LOCAL_DEV_URL || 'http://localhost:8001';

// API keys for status checking
export const LINEAR_API_KEY = process.env.LINEAR_APP;
export const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER;
export const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME;
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN;
export const RENDER_API_KEY = process.env.RENDER_API_KEY;
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
