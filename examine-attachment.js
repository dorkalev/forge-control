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

async function searchIssueByIdentifier(identifier) {
  console.log(`🔍 Searching for issue ${identifier}...`);

  const query = `
    query {
      issues(
        filter: {
          number: { eq: ${identifier.split('-')[1]} }
        }
      ) {
        nodes {
          id
          identifier
          title
          description
          priority
          project {
            id
            name
          }
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
          comments {
            nodes {
              id
              body
              createdAt
              user {
                name
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

  const issues = data.data?.issues?.nodes || [];
  return issues.find(i => i.identifier === identifier);
}

async function main() {
  try {
    console.log('🚀 Examining Linear Attachment Structure...\n');

    const issue = await searchIssueByIdentifier('A-195');

    if (!issue) {
      console.log('❌ Issue A-195 not found');
      return;
    }

    console.log('✅ Found issue A-195\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log('📄 ISSUE DETAILS');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Identifier:', issue.identifier);
    console.log('Title:', issue.title);
    console.log('Project:', issue.project?.name || 'N/A');
    console.log('Project ID:', issue.project?.id || 'N/A');
    console.log('State:', issue.state?.name);
    console.log('Priority:', issue.priority);

    if (issue.description) {
      console.log('\nFull Description:');
      console.log('─'.repeat(55));
      console.log(issue.description);
      console.log('─'.repeat(55));
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📎 ATTACHMENTS');
    console.log('═══════════════════════════════════════════════════════');

    if (issue.attachments?.nodes?.length > 0) {
      issue.attachments.nodes.forEach((att, idx) => {
        console.log(`\n▸ Attachment ${idx + 1}:`);
        console.log('  ├─ ID:', att.id);
        console.log('  ├─ Title:', att.title || '(none)');
        console.log('  ├─ Subtitle:', att.subtitle || '(none)');
        console.log('  ├─ URL:', att.url);
        console.log('  ├─ Source Type:', att.sourceType || '(none)');
        console.log('  ├─ Created:', att.createdAt);

        if (att.source) {
          console.log('  ├─ Source:', JSON.stringify(att.source, null, 2).split('\n').map((line, i) => i === 0 ? line : '  │  ' + line).join('\n'));
        }

        if (att.metadata) {
          console.log('  └─ Metadata:', JSON.stringify(att.metadata, null, 2).split('\n').map((line, i) => i === 0 ? line : '     ' + line).join('\n'));
        } else {
          console.log('  └─ Metadata: (none)');
        }
      });

      console.log('\n═══════════════════════════════════════════════════════');
      console.log('💡 ANALYSIS');
      console.log('═══════════════════════════════════════════════════════');

      issue.attachments.nodes.forEach((att, idx) => {
        const isGitHubPR = att.sourceType === 'githubPr' ||
                          (att.title || '').includes('GitHub PR') ||
                          (att.subtitle || '').includes('github.com');

        const hasFileExtension = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.txt', '.md']
          .some(ext => (att.title || '').toLowerCase().includes(ext) ||
                       (att.subtitle || '').toLowerCase().includes(ext));

        console.log(`\nAttachment ${idx + 1}:`);
        console.log('  • Is GitHub PR?', isGitHubPR ? '✅' : '❌');
        console.log('  • Has file extension?', hasFileExtension ? '✅' : '❌');
        console.log('  • Downloadable?', !isGitHubPR && hasFileExtension ? '✅ YES' : '❌ NO');

        if (!isGitHubPR && hasFileExtension) {
          console.log('  • Download approach: Direct HTTPS GET to URL with auth header');
        }
      });

    } else {
      console.log('\n⚠️  No attachments found on this issue');
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('💬 COMMENTS');
    console.log('═══════════════════════════════════════════════════════');

    if (issue.comments?.nodes?.length > 0) {
      issue.comments.nodes.forEach((comment, idx) => {
        console.log(`\n▸ Comment ${idx + 1} by ${comment.user?.name || 'Unknown'} on ${comment.createdAt}:`);
        console.log('─'.repeat(55));
        console.log(comment.body);
        console.log('─'.repeat(55));
      });
    } else {
      console.log('\n⚠️  No comments found on this issue');
    }

    console.log('\n');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

main();
