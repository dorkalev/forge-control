import fetch from 'node-fetch';
import { LINEAR_API_KEY } from '../config/env.js';

const LINEAR_API_URL = 'https://api.linear.app/graphql';

async function executeQuery(query, variables = {}) {
  if (!LINEAR_API_KEY) {
    throw new Error('LINEAR_API_KEY not configured');
  }

  const response = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': LINEAR_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status}`);
  }

  return response.json();
}

export async function getIssue(issueId) {
  const query = `
    query($id: String!) {
      issue(id: $id) {
        id
        identifier
        title
        description
        state {
          name
          type
        }
        assignee {
          name
        }
        priority
        url
        attachments {
          nodes {
            id
            url
            title
          }
        }
      }
    }
  `;

  const data = await executeQuery(query, { id: issueId });

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  return data.data?.issue;
}

export async function getIssueByBranchName(branchName) {
  const query = `
    query($branchName: String!) {
      issueVcsBranchSearch(branchName: $branchName) {
        id
        identifier
        title
        state {
          name
          type
        }
        assignee {
          name
        }
        priority
        url
        branchName
        attachments {
          nodes {
            id
            url
            title
          }
        }
      }
    }
  `;

  const data = await executeQuery(query, { branchName });

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  return data.data?.issueVcsBranchSearch;
}

export async function getWorkflowStates() {
  const query = `
    query {
      workflowStates {
        nodes {
          id
          name
          type
        }
      }
    }
  `;

  const data = await executeQuery(query);

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  return data.data?.workflowStates?.nodes || [];
}

export async function updateIssueState(issueId, stateId) {
  const mutation = `
    mutation($issueId: String!, $stateId: String!) {
      issueUpdate(id: $issueId, input: { stateId: $stateId }) {
        success
        issue {
          id
          identifier
          state {
            name
          }
        }
      }
    }
  `;

  const data = await executeQuery(mutation, { issueId, stateId });

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  if (!data.data?.issueUpdate?.success) {
    throw new Error('Failed to update Linear issue');
  }

  return data.data.issueUpdate.issue;
}

export async function moveIssueToInReview(issueId) {
  const states = await getWorkflowStates();
  const inReviewState = states.find(s => s.name.toLowerCase() === 'in review');

  if (!inReviewState) {
    throw new Error('Could not find "In Review" workflow state in Linear');
  }

  return updateIssueState(issueId, inReviewState.id);
}

export async function getCurrentCycleUnassignedIssues() {
  const query = `
    query {
      cycles(filter: { isActive: { eq: true } }) {
        nodes {
          id
          name
          startsAt
          endsAt
          issues(filter: { assignee: { null: true } }) {
            nodes {
              id
              identifier
              title
              description
              priority
              url
              state {
                name
                type
              }
            }
          }
        }
      }
    }
  `;

  const data = await executeQuery(query);

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  const activeCycles = data.data?.cycles?.nodes || [];

  // Get all issues from all active cycles
  const allIssues = [];
  for (const cycle of activeCycles) {
    const issues = cycle.issues?.nodes || [];
    allIssues.push(...issues.map(issue => ({
      ...issue,
      cycleName: cycle.name,
      cycleId: cycle.id
    })));
  }

  return allIssues;
}

export async function assignIssue(issueId, assigneeIds) {
  // assigneeIds can be a single string or an array
  const ids = Array.isArray(assigneeIds) ? assigneeIds : [assigneeIds];

  // Assign the first user as the primary assignee
  const mutation = `
    mutation($issueId: String!, $assigneeId: String!) {
      issueUpdate(id: $issueId, input: { assigneeId: $assigneeId }) {
        success
        issue {
          id
          identifier
          assignee {
            id
            name
          }
        }
      }
    }
  `;

  const data = await executeQuery(mutation, { issueId, assigneeId: ids[0] });

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  if (!data.data?.issueUpdate?.success) {
    throw new Error('Failed to assign issue');
  }

  // If there are additional assignees, add them as subscribers
  for (let i = 1; i < ids.length; i++) {
    await addSubscriber(issueId, ids[i]);
  }

  return data.data.issueUpdate.issue;
}

export async function addSubscriber(issueId, subscriberId) {
  const mutation = `
    mutation IssueAddSubscriber($issueId: String!, $subscriberId: String!) {
      issueUpdate(
        id: $issueId
        input: { subscriberIds: [$subscriberId] }
      ) {
        success
        issue {
          id
          subscribers {
            nodes {
              id
              name
            }
          }
        }
      }
    }
  `;

  const data = await executeQuery(mutation, { issueId, subscriberId });

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  if (!data.data?.issueUpdate?.success) {
    throw new Error('Failed to add subscriber');
  }

  return data.data.issueUpdate;
}

export async function getUsers() {
  const query = `
    query {
      users {
        nodes {
          id
          name
          email
          active
        }
      }
    }
  `;

  const data = await executeQuery(query);

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  return data.data?.users?.nodes || [];
}

/**
 * Get issues where "sdlc" is the primary assignee (not just subscriber)
 */
export async function getSDLCAssignedIssues() {
  console.log('🔍 [Linear] Fetching SDLC assigned issues...');

  const query = `
    query {
      issues(
        filter: {
          delegate: { name: { eq: "sdlc" } }
        }
      ) {
        nodes {
          id
          identifier
          title
          description
          state {
            name
            type
          }
          branchName
        }
      }
    }
  `;

  const data = await executeQuery(query);

  if (data.errors) {
    console.error('❌ [Linear] Query failed:', data.errors);
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  const allIssues = data.data?.issues?.nodes || [];
  console.log(`📊 [Linear] Found ${allIssues.length} issues assigned to sdlc`);

  // Only include Todo and In Progress issues (exclude Backlog, Done, In Review)
  const activeIssues = allIssues.filter(issue => {
    const stateType = issue.state?.type || '';
    const stateName = (issue.state?.name || '').toLowerCase();

    // Exclude completed
    if (stateType === 'completed') {
      console.log(`  ⏭️  [Linear] Skipping ${issue.identifier} - completed`);
      return false;
    }

    // Exclude in review
    if (stateName.includes('review')) {
      console.log(`  ⏭️  [Linear] Skipping ${issue.identifier} - in review`);
      return false;
    }

    // Exclude backlog
    if (stateType === 'backlog') {
      console.log(`  ⏭️  [Linear] Skipping ${issue.identifier} - backlog`);
      return false;
    }

    // Only include "unstarted" (Todo) and "started" (In Progress)
    if (stateType === 'unstarted' || stateType === 'started') {
      return true;
    }

    console.log(`  ⏭️  [Linear] Skipping ${issue.identifier} - unknown state: ${stateName} (${stateType})`);
    return false;
  });

  console.log(`✅ [Linear] ${activeIssues.length} active issues need agents`);
  return activeIssues;
}

/**
 * Get issues assigned to a specific user
 */
export async function getUserAssignedIssues(username) {
  if (!username) {
    console.log('⚠️  [Linear] No username provided, skipping user-assigned issues fetch');
    return [];
  }

  console.log(`🔍 [Linear] Fetching issues assigned to: ${username}`);

  // First, get all users to help debug
  try {
    const users = await getUsers();
    const activeUsers = users.filter(u => u.active);
    console.log(`📋 [Linear] Available active users:`);
    activeUsers.slice(0, 5).forEach(u => {
      console.log(`  - ${u.name} (email: ${u.email})`);
    });
  } catch (err) {
    console.log('⚠️  Could not fetch users list:', err.message);
  }

  const query = `
    query {
      issues(
        filter: {
          assignee: { name: { eq: "${username}" } }
        }
      ) {
        nodes {
          id
          identifier
          title
          description
          state {
            name
            type
          }
          assignee {
            id
            name
            displayName
            email
          }
          branchName
          url
          priority
        }
      }
    }
  `;

  try {
    const data = await executeQuery(query);

    if (data.errors) {
      console.error('❌ [Linear] Query failed:', JSON.stringify(data.errors, null, 2));
      throw new Error(data.errors[0]?.message || 'Linear API error');
    }

    const allIssues = data.data?.issues?.nodes || [];
    console.log(`📊 [Linear] Found ${allIssues.length} issues for exact username "${username}"`);

    // Log assignee info for debugging
    if (allIssues.length > 0) {
      allIssues.slice(0, 3).forEach(issue => {
        console.log(`  📋 ${issue.identifier}: assignee = ${issue.assignee?.name} (${issue.assignee?.displayName}, ${issue.assignee?.email}), state = ${issue.state?.name} (type: ${issue.state?.type})`);
      });
    }

    // Only include Todo, Backlog and In Progress issues (exclude Done, In Review)
    const activeIssues = allIssues.filter(issue => {
      const stateType = issue.state?.type || '';
      const stateName = (issue.state?.name || '').toLowerCase();

      // Exclude completed
      if (stateType === 'completed') {
        return false;
      }

      // Exclude in review
      if (stateName.includes('review')) {
        return false;
      }

      // Include "backlog", "unstarted" (Todo) and "started" (In Progress)
      return (stateType === 'backlog' || stateType === 'unstarted' || stateType === 'started');
    });

    console.log(`✅ [Linear] ${activeIssues.length} active issues for ${username}`);
    return activeIssues;
  } catch (err) {
    console.error(`❌ [Linear] Failed to fetch issues for ${username}:`, err.message);
    return [];
  }
}
