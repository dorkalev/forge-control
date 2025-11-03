#!/usr/bin/env node

import dotenv from 'dotenv';

dotenv.config();

const LINEAR_API_URL = 'https://api.linear.app/graphql';
const LINEAR_API_KEY = process.env.LINEAR_APP;

if (!LINEAR_API_KEY) {
  console.error('❌ LINEAR_APP not found in .env');
  process.exit(1);
}

async function executeQuery(query, variables = {}) {
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

async function findSOC2Project() {
  console.log('🔍 Finding SOC2 project...');

  const query = `
    query {
      projects {
        nodes {
          id
          name
        }
      }
    }
  `;

  const data = await executeQuery(query);

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  const projects = data.data?.projects?.nodes || [];
  const soc2Project = projects.find(p => p.name.toLowerCase().includes('soc'));

  if (!soc2Project) {
    throw new Error('SOC2 project not found');
  }

  console.log(`✅ Found project: ${soc2Project.name} (${soc2Project.id})`);
  return soc2Project;
}

async function getIssueDetails(issueId) {
  console.log(`\n🔍 Fetching details for issue ${issueId}...`);

  const query = `
    query {
      issue(id: "${issueId}") {
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
            subtitle
            metadata
            sourceType
            source
            createdAt
          }
        }
      }
    }
  `;

  const data = await executeQuery(query);

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  return data.data?.issue;
}

async function getProjectIssues(projectId) {
  console.log('📋 Fetching all project issues...');

  const query = `
    query {
      issues(
        filter: {
          project: { id: { eq: "${projectId}" } }
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
  `;

  const data = await executeQuery(query);

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  return data.data?.issues?.nodes || [];
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
    console.log('🚀 Starting SOC2 Policy Priority Update...\n');

    // First, examine issue A-195 to understand attachment structure
    console.log('=== EXAMINING A-195 ATTACHMENT STRUCTURE ===\n');

    // Find A-195 issue ID
    const project = await findSOC2Project();
    const allIssues = await getProjectIssues(project.id);
    const a195 = allIssues.find(i => i.identifier === 'A-195');

    if (a195) {
      const details = await getIssueDetails(a195.id);
      console.log('\n📄 Issue A-195 Details:');
      console.log('Title:', details.title);
      console.log('Priority:', details.priority);
      console.log('\nAttachments:');

      if (details.attachments?.nodes?.length > 0) {
        details.attachments.nodes.forEach((att, idx) => {
          console.log(`\n  Attachment ${idx + 1}:`);
          console.log('    ID:', att.id);
          console.log('    Title:', att.title);
          console.log('    Subtitle:', att.subtitle);
          console.log('    URL:', att.url);
          console.log('    Source Type:', att.sourceType);
          console.log('    Source:', att.source ? JSON.stringify(att.source) : 'null');
          console.log('    Metadata:', att.metadata ? JSON.stringify(att.metadata) : 'null');
          console.log('    Created:', att.createdAt);
        });
      } else {
        console.log('  No attachments found');
      }
    } else {
      console.log('⚠️  Issue A-195 not found');
    }

    // Now find and update policy tickets
    console.log('\n\n=== UPDATING POLICY TICKETS ===\n');

    const policyIssues = allIssues.filter(issue =>
      issue.title.toLowerCase().includes('policy')
    );

    console.log(`✅ Found ${policyIssues.length} issues with "policy" in title\n`);

    for (const issue of policyIssues) {
      const currentPriorityName =
        issue.priority === 0 ? 'None' :
        issue.priority === 1 ? 'Urgent' :
        issue.priority === 2 ? 'High' :
        issue.priority === 3 ? 'Medium' : 'Low';

      console.log(`[${issue.identifier}] ${issue.title}`);
      console.log(`  Current priority: ${currentPriorityName} (${issue.priority})`);

      if (issue.priority === 2) {
        console.log('  ✓ Already High priority, skipping\n');
        continue;
      }

      if (issue.priority === 1) {
        console.log('  ✓ Already Urgent priority (higher than High), skipping\n');
        continue;
      }

      // Update to High priority (2)
      console.log('  ⏳ Updating to High priority...');

      try {
        const result = await updateIssuePriority(issue.id, 2);

        if (result.success) {
          console.log('  ✅ Updated successfully\n');
        } else {
          console.log('  ❌ Update failed\n');
        }
      } catch (err) {
        console.error(`  ❌ Error: ${err.message}\n`);
      }
    }

    console.log('\n✅ Process complete!');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

main();
