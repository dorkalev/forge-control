import { respond } from '../utils/http.js';
import * as linear from '../services/linear.js';

export async function handleGetUnassignedIssues(req, res) {
  if (req.method !== 'GET') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const issues = await linear.getCurrentCycleUnassignedIssues();
    return respond(res, 200, { ok: true, issues });
  } catch (err) {
    console.error('Error fetching unassigned issues:', err);
    return respond(res, 500, { ok: false, error: err.message });
  }
}

export async function handleAssignIssue(req, res) {
  if (req.method !== 'POST') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', async () => {
    try {
      const { issueId, assigneeIds } = JSON.parse(body);

      if (!issueId || !assigneeIds) {
        return respond(res, 400, { ok: false, error: 'issueId and assigneeIds required' });
      }

      console.log(`📝 Assigning issue ${issueId} to users:`, assigneeIds);
      const result = await linear.assignIssue(issueId, assigneeIds);

      console.log(`✅ Issue assigned successfully`);
      return respond(res, 200, { ok: true, issue: result });
    } catch (err) {
      console.error('Error assigning issue:', err);
      return respond(res, 500, { ok: false, error: err.message });
    }
  });
}

export async function handleGetUsers(req, res) {
  if (req.method !== 'GET') {
    return respond(res, 405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const users = await linear.getUsers();
    return respond(res, 200, { ok: true, users });
  } catch (err) {
    console.error('Error fetching users:', err);
    return respond(res, 500, { ok: false, error: err.message });
  }
}
