#!/usr/bin/env node

import dotenv from 'dotenv';

dotenv.config();

const LINEAR_API_URL = 'https://api.linear.app/graphql';
const LINEAR_API_KEY = process.env.LINEAR_APP;

async function executeQuery(query) {
  const response = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': LINEAR_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });

  return response.json();
}

async function main() {
  // Get SOC2 project ID
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
  console.log('SOC2 Project:', soc2Project);

  // Get all issues
  data = await executeQuery(`
    query {
      issues(
        filter: {
          project: { id: { eq: "${soc2Project.id}" } }
        }
      ) {
        nodes {
          id
          identifier
          title
          priority
        }
      }
    }
  `);

  const allIssues = data.data.issues.nodes;
  console.log(`\nTotal issues in SOC2 project: ${allIssues.length}`);

  // Find A-195
  const a195 = allIssues.find(i => i.identifier === 'A-195');
  console.log('\nA-195:', a195 || 'NOT FOUND');

  // Check filter conditions
  if (a195) {
    console.log('\nFilter checks:');
    console.log('  Priority check (1-2):', a195.priority <= 2 && a195.priority >= 1);
    console.log('  Title includes "policy":', a195.title.toLowerCase().includes('policy'));
    console.log('  Should be included:', (a195.priority <= 2 && a195.priority >= 1) || a195.title.toLowerCase().includes('policy'));
  }

  // Show all policy issues
  const policyIssues = allIssues.filter(i => i.title.toLowerCase().includes('policy'));
  console.log('\n\nAll policy issues:');
  policyIssues.forEach(i => {
    console.log(`  ${i.identifier}: ${i.title} (priority: ${i.priority})`);
  });
}

main();
