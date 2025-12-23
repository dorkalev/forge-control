import fetch from 'node-fetch';
import { LINEAR_API_KEY } from '../config/env.js';

const LINEAR_API_URL = 'https://api.linear.app/graphql';

// Cache for project URLs
const projectUrlCache = new Map();

async function executeQuery(query, variables = {}, apiKeyOverride = null) {
  const apiKey = apiKeyOverride || LINEAR_API_KEY;

  if (!apiKey) {
    throw new Error('LINEAR_APP not configured');
  }

  const response = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status}`);
  }

  return response.json();
}

export async function getIssue(issueId, apiKey = null) {
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
        project {
          id
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

  const data = await executeQuery(query, { id: issueId }, apiKey);

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  return data.data?.issue;
}

export async function getIssueWithChildren(issueId, apiKey = null) {
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
        project {
          id
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
        children {
          nodes {
            id
            identifier
            title
            description
            priority
            state {
              name
              type
            }
            attachments {
              nodes {
                id
                url
                title
              }
            }
          }
        }
      }
    }
  `;

  const data = await executeQuery(query, { id: issueId }, apiKey);

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

export async function moveIssueToInProgress(issueId) {
  const states = await getWorkflowStates();
  const inProgressState = states.find(s => s.name.toLowerCase() === 'in progress')
    || states.find(s => s.type === 'started');

  if (!inProgressState) {
    throw new Error('Could not find "In Progress" workflow state in Linear');
  }

  return updateIssueState(issueId, inProgressState.id);
}

export async function moveIssueToInReview(issueId) {
  const states = await getWorkflowStates();
  const inReviewState = states.find(s => s.name.toLowerCase() === 'in review');

  if (!inReviewState) {
    throw new Error('Could not find "In Review" workflow state in Linear');
  }

  return updateIssueState(issueId, inReviewState.id);
}

export async function moveIssueToDone(issueId) {
  const states = await getWorkflowStates();
  console.log('📋 Available workflow states:', states.map(s => `${s.name} (type: ${s.type})`).join(', '));

  // First try to find by type 'completed', then by name 'done'
  const doneState = states.find(s => s.type === 'completed')
    || states.find(s => s.name.toLowerCase() === 'done');

  if (!doneState) {
    throw new Error(`Could not find "Done" workflow state in Linear. Available states: ${states.map(s => s.name).join(', ')}`);
  }

  console.log(`📋 Using workflow state: ${doneState.name} (type: ${doneState.type})`);
  return updateIssueState(issueId, doneState.id);
}

export async function updateIssueDescription(issueId, description, apiKey = null) {
  const mutation = `
    mutation($issueId: String!, $description: String!) {
      issueUpdate(id: $issueId, input: { description: $description }) {
        success
        issue {
          id
          identifier
          title
          description
        }
      }
    }
  `;

  const data = await executeQuery(mutation, { issueId, description }, apiKey);

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  if (!data.data?.issueUpdate?.success) {
    throw new Error('Failed to update Linear issue description');
  }

  return data.data.issueUpdate.issue;
}

export async function updateIssueTitleAndDescription(issueId, title, description, apiKey = null) {
  const mutation = `
    mutation($issueId: String!, $title: String!, $description: String!) {
      issueUpdate(id: $issueId, input: { title: $title, description: $description }) {
        success
        issue {
          id
          identifier
          title
          description
        }
      }
    }
  `;

  const data = await executeQuery(mutation, { issueId, title, description }, apiKey);

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  if (!data.data?.issueUpdate?.success) {
    throw new Error('Failed to update Linear issue');
  }

  return data.data.issueUpdate.issue;
}

export async function getCurrentCycleUnassignedIssues(apiKey = null) {
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

  const data = await executeQuery(query, {}, apiKey);

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

export async function assignIssue(issueId, assigneeIds, apiKey = null) {
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

  const data = await executeQuery(mutation, { issueId, assigneeId: ids[0] }, apiKey);

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  if (!data.data?.issueUpdate?.success) {
    throw new Error('Failed to assign issue');
  }

  // If there are additional assignees, add them as subscribers
  for (let i = 1; i < ids.length; i++) {
    await addSubscriber(issueId, ids[i], apiKey);
  }

  return data.data.issueUpdate.issue;
}

export async function addSubscriber(issueId, subscriberId, apiKey = null) {
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

  const data = await executeQuery(mutation, { issueId, subscriberId }, apiKey);

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  if (!data.data?.issueUpdate?.success) {
    throw new Error('Failed to add subscriber');
  }

  return data.data.issueUpdate;
}

export async function getUsers(apiKey = null) {
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

  const data = await executeQuery(query, {}, apiKey);

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  return data.data?.users?.nodes || [];
}

/**
 * Get issues where "forge" is the primary assignee (not just subscriber)
 */
export async function getForgeAssignedIssues() {
  console.log('🔍 [Linear] Fetching Forge assigned issues...');

  const query = `
    query {
      issues(
        filter: {
          delegate: { name: { eq: "forge" } }
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
  console.log(`📊 [Linear] Found ${allIssues.length} issues assigned to forge`);

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
 * Fetch issues for a single project (internal helper)
 */
async function fetchIssuesForProject(username, projectName, apiKey) {
  const projectFilter = projectName ? `, project: { name: { eq: "${projectName}" } }` : '';

  const query = `
    query {
      issues(
        filter: {
          assignee: { name: { eq: "${username}" } }${projectFilter}
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
          project {
            id
            name
          }
          branchName
          url
          priority
        }
      }
    }
  `;

  const data = await executeQuery(query, {}, apiKey);

  if (data.errors) {
    console.error('❌ [Linear] Query failed:', JSON.stringify(data.errors, null, 2));
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  return data.data?.issues?.nodes || [];
}

/**
 * Filter issues to only active ones (Todo, In Progress)
 */
function filterActiveIssues(issues) {
  return issues.filter(issue => {
    const stateType = issue.state?.type || '';
    const stateName = (issue.state?.name || '').toLowerCase();

    // Exclude completed
    if (stateType === 'completed') return false;

    // Exclude in review
    if (stateName.includes('review')) return false;

    // Exclude backlog
    if (stateType === 'backlog') return false;

    // Only include "unstarted" (Todo) and "started" (In Progress)
    return (stateType === 'unstarted' || stateType === 'started');
  });
}

/**
 * Sort issues by priority (urgent first)
 */
function sortByPriority(issues) {
  return issues.sort((a, b) => {
    // Lower priority number = higher priority (1 = urgent, 4 = low, 0 = no priority)
    const priorityA = a.priority || 5;
    const priorityB = b.priority || 5;
    return priorityA - priorityB;
  });
}

/**
 * Dedupe issues by identifier (in case same issue appears in multiple projects)
 */
function dedupeIssues(issues) {
  const seen = new Set();
  return issues.filter(issue => {
    if (seen.has(issue.identifier)) return false;
    seen.add(issue.identifier);
    return true;
  });
}

/**
 * Get issues assigned to a specific user
 * @param {string} username - The username to filter by
 * @param {string|string[]} projectNames - Optional project name(s) to filter by. Can be a string or array of strings.
 * @param {string} apiKey - Optional API key override (uses env var if not provided)
 */
export async function getUserAssignedIssues(username, projectNames = null, apiKey = null) {
  if (!username) {
    console.log('⚠️  [Linear] No username provided, skipping user-assigned issues fetch');
    return [];
  }

  // Normalize projectNames to array
  let projects = [];
  if (Array.isArray(projectNames)) {
    projects = projectNames.filter(p => p && p.trim());
  } else if (projectNames && typeof projectNames === 'string') {
    projects = [projectNames];
  }

  const projectsDisplay = projects.length > 0 ? ` for projects: [${projects.join(', ')}]` : '';
  console.log(`🔍 [Linear] Fetching issues assigned to: ${username}${projectsDisplay}`);

  // First, get all users to help debug
  try {
    const users = await getUsers(apiKey);
    const activeUsers = users.filter(u => u.active);
    console.log(`📋 [Linear] Available active users:`);
    activeUsers.slice(0, 5).forEach(u => {
      console.log(`  - ${u.name} (email: ${u.email})`);
    });
  } catch (err) {
    console.log('⚠️  Could not fetch users list:', err.message);
  }

  try {
    let allIssues = [];

    if (projects.length === 0) {
      // No project filter - fetch all assigned issues
      allIssues = await fetchIssuesForProject(username, null, apiKey);
    } else if (projects.length === 1) {
      // Single project - simple query
      allIssues = await fetchIssuesForProject(username, projects[0], apiKey);
    } else {
      // Multiple projects - fetch each and merge
      console.log(`📊 [Linear] Fetching issues from ${projects.length} projects...`);
      for (const projectName of projects) {
        console.log(`  🔍 Fetching from project: ${projectName}`);
        const projectIssues = await fetchIssuesForProject(username, projectName, apiKey);
        console.log(`  📋 Found ${projectIssues.length} issues in ${projectName}`);
        allIssues.push(...projectIssues);
      }
    }

    console.log(`📊 [Linear] Found ${allIssues.length} total issues for "${username}"${projectsDisplay}`);

    // Log assignee info for debugging
    if (allIssues.length > 0) {
      allIssues.slice(0, 3).forEach(issue => {
        console.log(`  📋 ${issue.identifier}: assignee = ${issue.assignee?.name} (${issue.assignee?.displayName}, ${issue.assignee?.email}), state = ${issue.state?.name} (type: ${issue.state?.type}), project = ${issue.project?.name || 'none'}`);
      });
    }

    // Filter, dedupe, and sort
    const activeIssues = filterActiveIssues(allIssues);
    const dedupedIssues = dedupeIssues(activeIssues);
    const sortedIssues = sortByPriority(dedupedIssues);

    console.log(`✅ [Linear] ${sortedIssues.length} active issues for ${username}`);
    return sortedIssues;
  } catch (err) {
    console.error(`❌ [Linear] Failed to fetch issues for ${username}:`, err.message);
    return [];
  }
}

/**
 * Fetch backlog issues for a single project (internal helper)
 */
async function fetchBacklogForProject(projectName, apiKey) {
  const query = `
    query($projectName: String!) {
      issues(
        filter: {
          project: { name: { eq: $projectName } }
          state: { type: { eq: "backlog" } }
        }
      ) {
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
          assignee {
            name
          }
          project {
            id
            name
          }
        }
      }
    }
  `;

  const data = await executeQuery(query, { projectName }, apiKey);

  if (data.errors) {
    console.error('❌ [Linear] Backlog query failed:', JSON.stringify(data.errors, null, 2));
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  return data.data?.issues?.nodes || [];
}

/**
 * Get backlog issues for one or more projects
 * @param {string|string[]} projectNames - The project name(s) to filter by. Can be string or array.
 * @param {string} apiKey - Optional API key override
 * @returns {Array} Array of backlog issues
 */
export async function getBacklogIssues(projectNames, apiKey = null) {
  // Normalize to array
  let projects = [];
  if (Array.isArray(projectNames)) {
    projects = projectNames.filter(p => p && p.trim());
  } else if (projectNames && typeof projectNames === 'string') {
    projects = [projectNames];
  }

  if (projects.length === 0) {
    console.log('⚠️  [Linear] No project name provided for backlog issues');
    return [];
  }

  const projectsDisplay = `[${projects.join(', ')}]`;
  console.log(`🔍 [Linear] Fetching backlog issues for projects: ${projectsDisplay}`);

  try {
    let allIssues = [];

    if (projects.length === 1) {
      // Single project - simple query
      allIssues = await fetchBacklogForProject(projects[0], apiKey);
    } else {
      // Multiple projects - fetch each and merge
      for (const projectName of projects) {
        console.log(`  🔍 Fetching backlog from project: ${projectName}`);
        const projectIssues = await fetchBacklogForProject(projectName, apiKey);
        console.log(`  📋 Found ${projectIssues.length} backlog issues in ${projectName}`);
        allIssues.push(...projectIssues);
      }
    }

    // Dedupe and sort by priority
    const dedupedIssues = dedupeIssues(allIssues);
    const sortedIssues = sortByPriority(dedupedIssues);

    console.log(`✅ [Linear] Found ${sortedIssues.length} total backlog issues for projects ${projectsDisplay}`);
    return sortedIssues;
  } catch (err) {
    console.error(`❌ [Linear] Failed to fetch backlog issues:`, err.message);
    return [];
  }
}

/**
 * Get project URL by project name
 * @param {string} projectName - The project name to search for
 * @param {string} apiKey - Optional API key override
 * @returns {string|null} The project URL or null if not found
 */
export async function getProjectUrl(projectName, apiKey = null) {
  if (!projectName) return null;

  // Check cache first
  if (projectUrlCache.has(projectName)) {
    return projectUrlCache.get(projectName);
  }

  const query = `
    query($name: String!) {
      projects(filter: { name: { eq: $name } }) {
        nodes {
          id
          name
          url
        }
      }
    }
  `;

  try {
    const data = await executeQuery(query, { name: projectName }, apiKey);

    if (data.errors) {
      console.error('❌ [Linear] Project query failed:', data.errors);
      return null;
    }

    const project = data.data?.projects?.nodes?.[0];
    if (project?.url) {
      projectUrlCache.set(projectName, project.url);
      return project.url;
    }

    return null;
  } catch (err) {
    console.error(`❌ [Linear] Failed to fetch project URL for ${projectName}:`, err.message);
    return null;
  }
}
