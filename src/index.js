import { startServer } from './server.js';
import { REPO_PATH, WORKTREE_REPO_PATH } from './config/env.js';
import { initProjects, getActiveProject } from './services/projects.js';

// Initialize projects and start server
async function main() {
  // Initialize project management (loads config, scans if needed)
  await initProjects();

  const activeProject = await getActiveProject();

  // Display warnings for missing configuration
  if (!activeProject && !REPO_PATH) {
    console.log('⚠️  No project selected and LOCAL_REPO_PATH not set');
    console.log('   Use /api/projects to list projects and /api/projects/active to select one');
  }

  if (!activeProject && !WORKTREE_REPO_PATH) {
    console.log('⚠️  No project selected and WORKTREE_REPO_PATH not set');
  }

  if (activeProject) {
    console.log(`✅ Active project: ${activeProject.name} (${activeProject.repoPath})`);
  }

  // Start the server
  startServer();
}

main().catch(err => {
  console.error('❌ Failed to start:', err);
  process.exit(1);
});
