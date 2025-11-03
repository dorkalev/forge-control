import { respond } from '../utils/http.js';
import { checkoutBranch } from '../services/git.js';
import { REPO_PATH, WORKTREE_REPO_PATH } from '../config/env.js';

export async function handleCheckout(req, res, query) {
  if (!REPO_PATH) {
    return respond(res, 400, { ok: false, error: 'LOCAL_REPO_PATH not set' });
  }

  const branch = (query.branch || '').toString();
  if (!branch) {
    return respond(res, 400, { ok: false, error: 'branch required' });
  }

  const cwd = WORKTREE_REPO_PATH || REPO_PATH;
  const results = await checkoutBranch(branch, cwd);

  return respond(res, 200, { ok: true, branch, results });
}
