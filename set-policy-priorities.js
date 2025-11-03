#!/usr/bin/env node

import dotenv from 'dotenv';

dotenv.config();

const LINEAR_API_URL = 'https://api.linear.app/graphql';
const LINEAR_API_KEY = process.env.LINEAR_APP;

if (!LINEAR_API_KEY) {
  console.error('❌ LINEAR_APP not found in .env');
  process.exit(1);
}

async function executeQuery(query) {
  const response = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': LINEAR_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status}`);
  }

  return response.json();
}

async function updateIssuePriority(issueId, priority) {
  const mutation = `
    mutation {
      issueUpdate(
        id: "${issueId}"
        input: { priority: ${priority} }
      ) {
        success
        issue {
          id
          identifier
          title
          priority
        }
      }
    }
  `;

  const data = await executeQuery(mutation);

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  return data.data?.issueUpdate;
}

async function main() {
  try {
    console.log('🚀 Setting Policy Priorities to High...\n');

    // Get SOC2 project
    let data = await executeQuery(`
      query {
        projects {
          nodes {
            id
            name
          }
        }
      }
    `);

    const soc2Project = data.data.projects.nodes.find(p => p.name.toLowerCase().includes('soc'));
    console.log(`✅ Found project: ${soc2Project.name}\n`);

    // Get all issues with "policy" in title
    data = await executeQuery(`
      query {
        issues(
          first: 250
          filter: {
            project: { id: { eq: "${soc2Project.id}" } }
          }
        ) {
          nodes {
            id
            identifier
            title
            priority
            state {
              name
            }
          }
        }
      }
    `);

    const allIssues = data.data.issues.nodes;
    const policyIssues = allIssues.filter(i => i.title.toLowerCase().includes('policy'));

    console.log(`📋 Found ${policyIssues.length} issues with "policy" in title\n`);

    let updated = 0;
    let skipped = 0;

    for (const issue of policyIssues) {
      const priorityName =
        issue.priority === 0 ? 'None' :
        issue.priority === 1 ? 'Urgent' :
        issue.priority === 2 ? 'High' :
        issue.priority === 3 ? 'Medium' : 'Low';

      console.log(`[${issue.identifier}] ${issue.title}`);
      console.log(`  Current: ${priorityName} (${issue.priority}) | State: ${issue.state.name}`);

      // Skip if already High or Urgent
      if (issue.priority <= 2 && issue.priority >= 1) {
        console.log(`  ✓ Already High/Urgent, skipping\n`);
        skipped++;
        continue;
      }

      // Update to High priority (2)
      console.log(`  ⏳ Updating to High...`);

      try {
        const result = await updateIssuePriority(issue.id, 2);

        if (result.success) {
          console.log(`  ✅ Updated to High\n`);
          updated++;
        } else {
          console.log(`  ❌ Update failed\n`);
        }
      } catch (err) {
        console.error(`  ❌ Error: ${err.message}\n`);
      }
    }

    console.log('\n═══════════════════════════════════════');
    console.log('✅ Process complete!');
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total: ${policyIssues.length}`);

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

main();
