import fetch from 'node-fetch';
import { GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GITHUB_TOKEN } from '../config/env.js';

const GITHUB_API_VERSION = '2022-11-28';

function getHeaders() {
  return {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION
  };
}

export function isConfigured() {
  return !!(GITHUB_REPO_OWNER && GITHUB_REPO_NAME && GITHUB_TOKEN);
}

export async function getPullRequestsForBranch(branch, state = 'all') {
  if (!isConfigured()) {
    throw new Error('GitHub credentials not configured');
  }

  const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/pulls?head=${GITHUB_REPO_OWNER}:${branch}&state=${state}`;
  const response = await fetch(url, { headers: getHeaders() });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return response.json();
}

export async function getOpenPRsToBase(base = process.env.DEFAULT_BASE_BRANCH || 'main') {
  if (!isConfigured()) {
    throw new Error('GitHub credentials not configured');
  }

  const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/pulls?base=${base}&state=open`;
  const response = await fetch(url, { headers: getHeaders() });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return response.json();
}

export async function getReviewThreads(prNumber) {
  if (!isConfigured()) {
    throw new Error('GitHub credentials not configured');
  }

  const query = {
    query: `
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            reviewThreads(first: 100) {
              totalCount
              nodes {
                isResolved
              }
            }
          }
        }
      }
    `,
    variables: {
      owner: GITHUB_REPO_OWNER,
      repo: GITHUB_REPO_NAME,
      number: prNumber
    }
  };

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(query)
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL API error: ${response.status}`);
  }

  return response.json();
}

export async function getCheckRuns(commitSha) {
  if (!isConfigured()) {
    throw new Error('GitHub credentials not configured');
  }

  const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/commits/${commitSha}/check-runs`;
  const response = await fetch(url, { headers: getHeaders() });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return response.json();
}

export async function getTags() {
  if (!isConfigured()) {
    throw new Error('GitHub credentials not configured');
  }

  const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/tags`;
  const response = await fetch(url, { headers: getHeaders() });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return response.json();
}

export async function getPullRequest(prNumber) {
  if (!isConfigured()) {
    throw new Error('GitHub credentials not configured');
  }

  const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/pulls/${prNumber}`;
  const response = await fetch(url, { headers: getHeaders() });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return response.json();
}
