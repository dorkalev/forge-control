#!/usr/bin/env node

/**
 * Backfill script to link existing Aikido PRs to Linear
 * This is a one-time script to link PRs that were created before the GitHub Action was added
 */

import fetch from 'node-fetch';
import { config } from 'dotenv';

// Load environment variables
config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const LINEAR_APP = process.env.LINEAR_APP;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME;

const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`;
const LINEAR_API = 'https://api.linear.app/graphql';

// Helper: Make GitHub API request
async function githubRequest(endpoint, options = {}) {
  const url = `${GITHUB_API}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'aikido-linear-backfill',
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

// Helper: Make Linear GraphQL request
async function linearRequest(query, variables = {}) {
  const response = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      'Authorization': LINEAR_APP,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`Linear GraphQL error: ${data.errors[0]?.message}`);
  }

  return data;
}

// Parse Linear issue identifier from text
function parseLinearIssue(text) {
  if (!text) return null;

  // Match Linear URLs: https://linear.app/.../issue/A-123/...
  const urlMatch = text.match(/https:\/\/linear\.app\/[^\/]+\/issue\/([A-Z]+-\d+)/i);
  if (urlMatch) return urlMatch[1].toUpperCase();

  // Match plain identifiers: A-123
  const idMatch = text.match(/\b([A-Z]+-\d+)\b/);
  if (idMatch) return idMatch[1].toUpperCase();

  return null;
}

// Check if PR already has linear-synced label
function hasLinearSyncedLabel(pr) {
  return pr.labels && pr.labels.some(label => label.name === 'linear-synced');
}

// Get Linear issue ID from identifier
async function getLinearIssueId(identifier) {
  const query = `
    query($id: String!) {
      issue(id: $id) {
        id
        identifier
        title
      }
    }
  `;

  const result = await linearRequest(query, { id: identifier });
  return result.data?.issue?.id || null;
}

// Check if PR is already attached to Linear issue
async function checkAttachmentExists(prUrl) {
  const query = `
    query($url: String!) {
      attachmentsForURL(url: $url) {
        nodes {
          id
          issue {
            identifier
          }
        }
      }
    }
  `;

  const result = await linearRequest(query, { url: prUrl });
  return result.data?.attachmentsForURL?.nodes?.length > 0;
}

// Create attachment in Linear
async function createAttachment(issueId, prUrl, prNumber, prTitle) {
  const mutation = `
    mutation($issueId: String!, $url: String!, $title: String!) {
      attachmentCreate(input: {
        issueId: $issueId
        url: $url
        title: $title
      }) {
        success
        attachment {
          id
        }
      }
    }
  `;

  const result = await linearRequest(mutation, {
    issueId,
    url: prUrl,
    title: `GitHub PR #${prNumber}: ${prTitle}`
  });

  if (!result.data?.attachmentCreate?.success) {
    throw new Error('Failed to create attachment in Linear');
  }

  return result.data.attachmentCreate.attachment;
}

// Add label to PR
async function addLabel(prNumber, label) {
  await githubRequest(`/issues/${prNumber}/labels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ labels: [label] })
  });
}

// Main function
async function main() {
  console.log('🚀 Starting Aikido PR backfill...\n');

  // Get all open PRs
  console.log('📋 Fetching open PRs...');
  const prs = await githubRequest('/pulls?state=all&per_page=100');

  // Filter for Aikido PRs
  const aikidoPRs = prs.filter(pr => pr.title.startsWith('[Aikido]'));
  console.log(`✓ Found ${aikidoPRs.length} Aikido PRs\n`);

  if (aikidoPRs.length === 0) {
    console.log('No Aikido PRs to process');
    return;
  }

  let processed = 0;
  let skipped = 0;
  let linked = 0;
  let errors = 0;

  for (const pr of aikidoPRs) {
    console.log(`\n📌 PR #${pr.number}: ${pr.title}`);

    // Check if already has label
    if (hasLinearSyncedLabel(pr)) {
      console.log('  ✓ Already has linear-synced label, skipping');
      skipped++;
      continue;
    }

    // Parse Linear issue from PR body
    let issueIdentifier = parseLinearIssue(pr.body);

    // If not in body, check comments
    if (!issueIdentifier) {
      console.log('  🔍 Checking comments...');
      const comments = await githubRequest(`/issues/${pr.number}/comments`);

      for (const comment of comments) {
        issueIdentifier = parseLinearIssue(comment.body);
        if (issueIdentifier) break;
      }
    }

    if (!issueIdentifier) {
      console.log('  ⚠️  No Linear issue found in PR body or comments');
      skipped++;
      continue;
    }

    console.log(`  🎯 Found Linear issue: ${issueIdentifier}`);

    try {
      // Get Linear issue UUID
      const issueId = await getLinearIssueId(issueIdentifier);
      if (!issueId) {
        console.log(`  ❌ Linear issue ${issueIdentifier} not found`);
        errors++;
        continue;
      }

      // Check if already attached
      const exists = await checkAttachmentExists(pr.html_url);
      if (exists) {
        console.log('  ✓ Already attached to Linear, adding label...');
        await addLabel(pr.number, 'linear-synced');
        console.log('  ✓ Label added');
        skipped++;
        continue;
      }

      // Create attachment
      console.log('  🔗 Creating Linear attachment...');
      await createAttachment(issueId, pr.html_url, pr.number, pr.title);
      console.log('  ✓ Attachment created');

      // Add label
      console.log('  🏷️  Adding linear-synced label...');
      await addLabel(pr.number, 'linear-synced');
      console.log('  ✓ Label added');

      linked++;
      processed++;

    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
      errors++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary:');
  console.log(`   Total Aikido PRs: ${aikidoPRs.length}`);
  console.log(`   Linked: ${linked}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Errors: ${errors}`);
  console.log('='.repeat(50));
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
