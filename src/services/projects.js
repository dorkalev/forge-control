import fs from 'fs/promises';
import path from 'path';
import { runCommand } from '../utils/command.js';

const CONFIG_FILE = path.join(process.cwd(), 'config', 'projects.json');

const DEFAULT_CONFIG = {
  activeProject: null,
  projects: {}
};

// In-memory cache of the loaded config
let cachedConfig = null;

/**
 * Expand ~ to home directory
 */
function expandPath(pathStr) {
  if (!pathStr) return pathStr;
  if (pathStr.startsWith('~/')) {
    return path.join(process.env.HOME || '', pathStr.slice(2));
  }
  return pathStr;
}

/**
 * Check if a path exists
 */
async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse GitHub remote URL to extract owner and repo
 * Supports: git@github.com:owner/repo.git and https://github.com/owner/repo.git
 */
function parseGithubRemote(url) {
  if (!url) return { owner: null, repo: null };
  const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  return match ? { owner: match[1], repo: match[2] } : { owner: null, repo: null };
}

/**
 * Get the origin remote URL for a git repository
 */
async function getGitRemoteUrl(repoPath) {
  try {
    const result = await runCommand('git', ['remote', 'get-url', 'origin'], { cwd: repoPath });
    if (result.code === 0) {
      return result.stdout.trim();
    }
  } catch (err) {
    console.log(`📂 [Projects] Could not get remote for ${repoPath}:`, err.message);
  }
  return null;
}

/**
 * Parse a .sdlc or .env file and return key-value pairs
 */
async function parseDotEnvFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const result = {};

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        result[key] = value;
      }
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Read project config from .sdlc file in a repo
 */
async function readProjectSdlcConfig(repoPath) {
  const sdlcPath = path.join(repoPath, '.sdlc');
  return await parseDotEnvFile(sdlcPath);
}

/**
 * Load projects config from JSON file
 */
export async function loadProjectsConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(data);

    // Validate structure
    const config = {
      activeProject: parsed.activeProject || null,
      projects: parsed.projects || {}
    };

    cachedConfig = config;
    return config;
  } catch (err) {
    console.log('📝 [Projects] No projects config found, using defaults');
    cachedConfig = { ...DEFAULT_CONFIG };
    return cachedConfig;
  }
}

/**
 * Save projects config to JSON file
 */
export async function saveProjectsConfig(config) {
  try {
    await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    cachedConfig = config;
    console.log('💾 [Projects] Saved projects config');
  } catch (err) {
    console.error('❌ [Projects] Failed to save config:', err);
    throw err;
  }
}

/**
 * Get the cached config, loading if necessary
 */
async function getConfig() {
  if (!cachedConfig) {
    await loadProjectsConfig();
  }
  return cachedConfig;
}

/**
 * Detect git repositories in a directory
 * Only includes repos that have a .sdlc file with LINEAR_PROJECT defined
 */
export async function detectProjects(scanPath = '~/src') {
  const srcDir = expandPath(scanPath);
  console.log(`🔍 [Projects] Scanning for projects with .sdlc config in ${srcDir}`);

  let entries;
  try {
    entries = await fs.readdir(srcDir, { withFileTypes: true });
  } catch (err) {
    console.error(`❌ [Projects] Cannot read directory ${srcDir}:`, err.message);
    return {};
  }

  const projects = {};

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;

    const repoPath = path.join(srcDir, entry.name);
    const gitDir = path.join(repoPath, '.git');

    // Check if it's a git repo
    if (!await exists(gitDir)) continue;

    // Read .sdlc config file - only include if LINEAR_PROJECT is defined
    const sdlcConfig = await readProjectSdlcConfig(repoPath);
    if (!sdlcConfig || !sdlcConfig.LINEAR_PROJECT) {
      console.log(`⏭️  [Projects] Skipping ${entry.name} (no .sdlc with LINEAR_PROJECT)`);
      continue;
    }

    // Extract GitHub info from remote
    const remoteUrl = await getGitRemoteUrl(repoPath);
    const { owner, repo } = parseGithubRemote(remoteUrl);

    // Use LINEAR_PROJECT as the project identifier/name
    const projectName = sdlcConfig.LINEAR_PROJECT;

    projects[projectName] = {
      name: projectName,
      folderName: entry.name,
      repoPath,
      worktreeBasePath: repoPath,
      githubOwner: owner,
      githubRepo: repo,
      // Store additional config from .sdlc
      linearProject: sdlcConfig.LINEAR_PROJECT,
      linearTeamId: sdlcConfig.LINEAR_TEAM_ID || null,
      detectedAt: new Date().toISOString()
    };

    console.log(`📂 [Projects] Found: ${projectName} (${entry.name}) - GitHub: ${owner}/${repo || entry.name}`);
  }

  console.log(`✅ [Projects] Detected ${Object.keys(projects).length} projects`);
  return projects;
}

/**
 * Scan for projects and merge with existing config (preserves manual edits)
 */
export async function scanAndMergeProjects(scanPath = '~/src') {
  const config = await getConfig();
  const detected = await detectProjects(scanPath);

  // Merge: keep existing projects, add new ones
  for (const [name, project] of Object.entries(detected)) {
    if (!config.projects[name]) {
      config.projects[name] = project;
    } else {
      // Update detection timestamp but preserve user customizations
      config.projects[name].detectedAt = project.detectedAt;
      // Update GitHub info if it was missing
      if (!config.projects[name].githubOwner && project.githubOwner) {
        config.projects[name].githubOwner = project.githubOwner;
        config.projects[name].githubRepo = project.githubRepo;
      }
    }
  }

  await saveProjectsConfig(config);
  return config;
}

/**
 * Get the active project
 */
export async function getActiveProject() {
  const config = await getConfig();
  if (!config.activeProject) return null;
  return config.projects[config.activeProject] || null;
}

/**
 * Set the active project by name
 */
export async function setActiveProject(projectName) {
  const config = await getConfig();

  if (!config.projects[projectName]) {
    throw new Error(`Project "${projectName}" not found`);
  }

  config.activeProject = projectName;
  await saveProjectsConfig(config);
  console.log(`✅ [Projects] Active project set to: ${projectName}`);
  return config.projects[projectName];
}

/**
 * List all projects
 */
export async function listProjects() {
  const config = await getConfig();
  return Object.values(config.projects).map(p => ({
    ...p,
    isActive: p.name === config.activeProject
  }));
}

/**
 * Get the project context for the active project
 * Returns null if no project is selected
 */
export async function getProjectContext() {
  const project = await getActiveProject();
  if (!project) return null;

  return {
    REPO_PATH: project.repoPath,
    WORKTREE_REPO_PATH: project.worktreeRepoPath || project.repoPath,
    WORKTREE_BASE_PATH: project.worktreeBasePath || project.repoPath,
    GITHUB_REPO_OWNER: project.githubOwner,
    GITHUB_REPO_NAME: project.githubRepo
  };
}

/**
 * Synchronous version for use in handlers - uses cached config
 * Returns null if no project is selected or config not loaded
 */
export function getProjectContextSync() {
  if (!cachedConfig || !cachedConfig.activeProject) return null;

  const project = cachedConfig.projects[cachedConfig.activeProject];
  if (!project) return null;

  return {
    REPO_PATH: project.repoPath,
    WORKTREE_REPO_PATH: project.worktreeRepoPath || project.repoPath,
    WORKTREE_BASE_PATH: project.worktreeBasePath || project.repoPath,
    GITHUB_REPO_OWNER: project.githubOwner,
    GITHUB_REPO_NAME: project.githubRepo
  };
}

/**
 * Initialize projects on startup - load config and optionally scan
 */
export async function initProjects(scanPath = '~/src') {
  console.log('🚀 [Projects] Initializing project management...');

  // Load existing config
  await loadProjectsConfig();

  // If no projects, scan for them
  if (Object.keys(cachedConfig.projects).length === 0) {
    console.log('📂 [Projects] No projects configured, running initial scan...');
    await scanAndMergeProjects(scanPath);
  }

  const projectCount = Object.keys(cachedConfig.projects).length;
  const activeProject = cachedConfig.activeProject;

  console.log(`✅ [Projects] Loaded ${projectCount} projects, active: ${activeProject || 'none'}`);
  return cachedConfig;
}
