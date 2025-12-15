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
 * Parse a .forge or .env file and return key-value pairs
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
 * Parse LINEAR_PROJECTS comma-separated value into array
 * Handles project names with spaces (comma is the delimiter)
 */
function parseLinearProjects(value) {
  if (!value) return [];
  return value.split(',').map(p => p.trim()).filter(p => p.length > 0);
}

/**
 * Get Linear project names from a project config
 * Returns array of project names (handles both LINEAR_PROJECT and LINEAR_PROJECTS)
 * @param {Object} projectConfig - Project config object or .forge env object
 * @returns {string[]} Array of project names
 */
export function getLinearProjectNames(projectConfig) {
  if (!projectConfig) return [];

  // Check for multi-project config first (LINEAR_PROJECTS takes precedence)
  if (projectConfig.linearProjects && projectConfig.linearProjects.length > 0) {
    return projectConfig.linearProjects;
  }

  // Check for LINEAR_PROJECTS in .forge env format
  if (projectConfig.LINEAR_PROJECTS) {
    return parseLinearProjects(projectConfig.LINEAR_PROJECTS);
  }

  // Fall back to single project (LINEAR_PROJECT)
  if (projectConfig.linearProject) {
    return [projectConfig.linearProject];
  }

  // Check for LINEAR_PROJECT in .forge env format
  if (projectConfig.LINEAR_PROJECT) {
    return [projectConfig.LINEAR_PROJECT];
  }

  return [];
}

/**
 * Read project config from .forge file in a repo
 */
async function readProjectForgeConfig(repoPath) {
  const forgePath = path.join(repoPath, '.forge');
  return await parseDotEnvFile(forgePath);
}

// Cache for active project's .forge env vars
let cachedProjectEnv = null;
let cachedProjectEnvKey = null;

/**
 * Get environment variables from the active project's .forge file
 * Returns cached values if the active project hasn't changed
 */
export async function getActiveProjectEnv() {
  const config = await getConfig();
  const activeKey = config.activeProject;

  if (!activeKey) return null;

  // Return cached if same project
  if (cachedProjectEnvKey === activeKey && cachedProjectEnv) {
    return cachedProjectEnv;
  }

  const project = config.projects[activeKey];
  if (!project?.repoPath) return null;

  const forgeConfig = await readProjectForgeConfig(project.repoPath);
  if (forgeConfig) {
    cachedProjectEnv = forgeConfig;
    cachedProjectEnvKey = activeKey;
    console.log(`🔧 [Projects] Loaded .forge env for project: ${activeKey}`);
  }

  return cachedProjectEnv;
}

/**
 * Clear the cached project env (call when switching projects)
 */
export function clearProjectEnvCache() {
  cachedProjectEnv = null;
  cachedProjectEnvKey = null;
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
 * Only includes repos that have a .forge file with LINEAR_PROJECT or LINEAR_PROJECTS defined
 */
export async function detectProjects(scanPath = '~/src') {
  const srcDir = expandPath(scanPath);
  console.log(`🔍 [Projects] Scanning for projects with .forge config in ${srcDir}`);

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

    // Read .forge config file - include if LINEAR_PROJECT or LINEAR_PROJECTS is defined
    const forgeConfig = await readProjectForgeConfig(repoPath);
    if (!forgeConfig) {
      console.log(`⏭️  [Projects] Skipping ${entry.name} (no .forge file)`);
      continue;
    }

    // Check for LINEAR_PROJECTS (multi-project) or LINEAR_PROJECT (single)
    const hasLinearProjects = forgeConfig.LINEAR_PROJECTS && forgeConfig.LINEAR_PROJECTS.trim();
    const hasLinearProject = forgeConfig.LINEAR_PROJECT && forgeConfig.LINEAR_PROJECT.trim();

    if (!hasLinearProjects && !hasLinearProject) {
      console.log(`⏭️  [Projects] Skipping ${entry.name} (no LINEAR_PROJECT or LINEAR_PROJECTS)`);
      continue;
    }

    // Parse multi-project config
    const linearProjects = hasLinearProjects
      ? parseLinearProjects(forgeConfig.LINEAR_PROJECTS)
      : [];

    // Extract GitHub info from remote
    const remoteUrl = await getGitRemoteUrl(repoPath);
    const { owner, repo } = parseGithubRemote(remoteUrl);

    // Use folder name as the project identifier for multi-project repos,
    // or LINEAR_PROJECT for single-project repos (backwards compatible)
    const projectName = hasLinearProjects
      ? entry.name  // Use folder name for multi-project repos
      : forgeConfig.LINEAR_PROJECT;

    projects[projectName] = {
      name: projectName,
      folderName: entry.name,
      repoPath,
      worktreeBasePath: repoPath,
      githubOwner: owner,
      githubRepo: repo,
      // Store Linear project config - support both single and multi
      linearProject: hasLinearProject ? forgeConfig.LINEAR_PROJECT : null,
      linearProjects: linearProjects,  // Array of project names (empty if single-project)
      linearProjectUrl: forgeConfig.LINEAR_PROJECT_URL || null,
      linearTeamId: forgeConfig.LINEAR_TEAM_ID || null,
      detectedAt: new Date().toISOString()
    };

    const projectsDisplay = linearProjects.length > 0
      ? `[${linearProjects.join(', ')}]`
      : forgeConfig.LINEAR_PROJECT;
    console.log(`📂 [Projects] Found: ${projectName} (${entry.name}) - Linear: ${projectsDisplay} - GitHub: ${owner}/${repo || entry.name}`);
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

  // Clear env cache so next request loads the new project's .forge
  clearProjectEnvCache();

  console.log(`✅ [Projects] Active project set to: ${projectName}`);
  return config.projects[projectName];
}

/**
 * List all projects
 */
export async function listProjects() {
  const config = await getConfig();
  return Object.entries(config.projects).map(([key, p]) => ({
    ...p,
    key,  // The config key used for setActiveProject
    isActive: key === config.activeProject
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
 * Initialize projects on startup - always scan for fresh project list
 */
export async function initProjects(scanPath = '~/src') {
  console.log('🚀 [Projects] Initializing project management...');

  // Load existing config to preserve activeProject setting
  await loadProjectsConfig();
  const previousActive = cachedConfig.activeProject;

  // Always scan for projects on init
  console.log('📂 [Projects] Scanning for projects...');
  const detected = await detectProjects(scanPath);

  // Replace projects with freshly detected ones
  cachedConfig.projects = detected;

  // Preserve activeProject if it still exists, otherwise clear it
  if (previousActive && detected[previousActive]) {
    cachedConfig.activeProject = previousActive;
  } else {
    cachedConfig.activeProject = null;
  }

  const projectCount = Object.keys(cachedConfig.projects).length;
  const activeProject = cachedConfig.activeProject;

  console.log(`✅ [Projects] Found ${projectCount} projects, active: ${activeProject || 'none'}`);
  return cachedConfig;
}
