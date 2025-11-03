import { startServer } from './server.js';
import { REPO_PATH, WORKTREE_REPO_PATH } from './config/env.js';

// Display warnings for missing configuration
if (!REPO_PATH) {
  console.log('WARNING: LOCAL_REPO_PATH is not set; /checkout will fail');
}

if (!WORKTREE_REPO_PATH) {
  console.log('WARNING: WORKTREE_REPO_PATH is not set; /worktree will fail');
}

// Start the server
startServer();
