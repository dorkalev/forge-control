import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// If SDLC_CONFIG_DIR is set (from CLI wrapper), look for .sdlc there
// Otherwise, look for .env in the current directory
const configDir = process.env.SDLC_CONFIG_DIR || process.cwd();
const configFile = path.join(configDir, '.sdlc');

console.log('🔧 [Config] Loading configuration from:', configDir);

// Try to load .sdlc first, fallback to .env
const result = dotenv.config({ path: configFile });
if (result.error) {
  console.log('🔧 [Config] No .sdlc file found, trying .env...');
  dotenv.config({ path: path.join(configDir, '.env') });
} else {
  console.log('✅ [Config] Loaded .sdlc configuration');
}

// Helper function to expand ~ in paths
function expandPath(pathStr) {
  if (!pathStr) return pathStr;
  if (pathStr.startsWith('~/')) {
    return path.join(process.env.HOME || '', pathStr.slice(2));
  }
  return pathStr;
}

export const PORT = parseInt(process.env.LOCAL_AGENT_PORT || '4665', 10);
export const TOKEN = process.env.LOCAL_AGENT_TOKEN || '';

// LOCAL_REPO_PATH: base project path; worktrees placed under <base>/src/<project>/<branch>
// If LOCAL_REPO_PATH already points to <base>/src/<project>, we will not append again.
export const REPO_PATH = expandPath(process.env.LOCAL_REPO_PATH || '');

// Optional explicit override for the directory that will directly contain per-branch worktrees
// e.g. /path/to/repo/src/<project>. If set, we use this as-is.
export const WORKTREE_BASE_PATH = expandPath(process.env.WORKTREE_BASE_PATH || process.env.LOCAL_WORKTREE_BASE_PATH || '');

// WORKTREE_REPO_PATH: the Git repository whose branch will be checked out as a worktree
export const WORKTREE_REPO_PATH = expandPath(process.env.WORKTREE_REPO_PATH || process.env.LOCAL_WORKTREE_REPO_PATH || '');

// Local dev URL for opening in browser
export const LOCAL_DEV_URL = process.env.LOCAL_DEV_URL || 'http://localhost:8001';

// API keys for status checking
export const LINEAR_API_KEY = process.env.LINEAR_APP;
export const LINEAR_USERNAME = process.env.LINEAR_USERNAME || '';
export const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER;
export const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME;
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN;
export const RENDER_API_KEY = process.env.RENDER_API_KEY;
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
