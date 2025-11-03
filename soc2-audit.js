#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import https from 'https';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const LINEAR_API_URL = 'https://api.linear.app/graphql';
const LINEAR_API_KEY = process.env.LINEAR_APP;
const DOWNLOADS_DIR = './soc2-downloads';
const REPORT_FILE = './soc2-report.md';

if (!LINEAR_API_KEY) {
  console.error('❌ LINEAR_APP not found in .env');
  process.exit(1);
}

// Create downloads directory
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
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
  const soc2Project = projects.find(p => p.name.toLowerCase().includes('soc') || p.name.toLowerCase().includes('soc2'));

  if (!soc2Project) {
    console.log('Available projects:', projects.map(p => p.name).join(', '));
    throw new Error('SOC2 project not found');
  }

  console.log(`✅ Found project: ${soc2Project.name} (${soc2Project.id})`);
  return soc2Project;
}

async function getHighPriorityIssues(projectId) {
  console.log('📋 Fetching high priority issues...');

  // Linear priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low
  // Query all issues and filter by project
  const query = `
    query {
      issues(
        first: 250
        filter: {
          project: { id: { eq: "${projectId}" } }
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
          project {
            id
            name
          }
          attachments {
            nodes {
              id
              url
              title
              subtitle
              metadata
            }
          }
          comments {
            nodes {
              id
              body
              createdAt
            }
          }
        }
      }
    }
  `;

  const data = await executeQuery(query);

  if (data.errors) {
    console.error('API Error:', JSON.stringify(data.errors, null, 2));
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  const allIssues = data.data?.issues?.nodes || [];

  // Filter for high priority (1=Urgent, 2=High) OR has "policy" in title
  const relevantIssues = allIssues.filter(issue =>
    (issue.priority <= 2 && issue.priority >= 1) ||
    issue.title.toLowerCase().includes('policy')
  );

  console.log(`✅ Found ${relevantIssues.length} high/urgent priority or policy issues (out of ${allIssues.length} total in project)`);

  return relevantIssues;
}

async function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    const urlObj = new URL(url);

    const options = {
      headers: {
        'Authorization': LINEAR_API_KEY,
        'User-Agent': 'SOC2-Audit-Script'
      }
    };

    https.get(url, options, (response) => {
      // Follow redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlink(filepath, () => {});
        return downloadFile(response.headers.location, filepath)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      } else {
        fs.unlink(filepath, () => {});
        reject(new Error(`HTTP ${response.statusCode}`));
      }
    }).on('error', (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

function isFileAttachment(attachment) {
  const title = (attachment.title || '').toLowerCase();
  const subtitle = (attachment.subtitle || '').toLowerCase();

  // Skip GitHub PR/commit references
  if (title.includes('github pr') || title.includes('pull request') || subtitle.includes('github.com')) {
    return false;
  }

  // Skip commit messages (usually start with ticket ID)
  if (/^[a-z]-\d+:/i.test(title)) {
    return false;
  }

  // Look for actual file extensions
  const fileExtensions = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.txt', '.md'];
  return fileExtensions.some(ext => title.includes(ext) || subtitle.includes(ext));
}

function extractDocumentLinksFromComments(comments) {
  const links = [];
  const urlPattern = /https:\/\/uploads\.linear\.app\/[^\s\)]+/g;

  for (const comment of comments) {
    const matches = comment.body.match(urlPattern);
    if (matches) {
      matches.forEach(url => {
        links.push({
          url,
          commentId: comment.id,
          createdAt: comment.createdAt
        });
      });
    }
  }

  return links;
}

async function processIssues(issues) {
  const downloaded = [];
  const withAttachments = [];
  const needsAction = [];

  console.log(`Processing ${issues.length} issues...`);
  console.log(`Issue IDs: ${issues.map(i => i.identifier).join(', ')}\n`);

  for (const issue of issues) {
    const attachments = issue.attachments?.nodes || [];
    const fileAttachments = attachments.filter(isFileAttachment);

    // Also check for document links in comments
    const comments = issue.comments?.nodes || [];
    const documentLinks = extractDocumentLinksFromComments(comments);

    if (documentLinks.length > 0) {
      console.log(`🔗 Found ${documentLinks.length} document link(s) in ${issue.identifier} comments`);
    }

    const hasFileAttachment = fileAttachments.length > 0 || documentLinks.length > 0;

    // Try to download actual file attachments
    if (fileAttachments.length > 0) {
      for (const attachment of fileAttachments) {
        try {
          const filename = attachment.title || attachment.subtitle || `attachment-${attachment.id}`;
          const sanitizedFilename = filename.replace(/[^a-z0-9._-]/gi, '_');
          const filepath = path.join(DOWNLOADS_DIR, `${issue.identifier}-${sanitizedFilename}`);

          console.log(`📥 Downloading ${issue.identifier}: ${filename}...`);
          await downloadFile(attachment.url, filepath);

          downloaded.push({
            ticketId: issue.identifier,
            title: issue.title,
            filename: sanitizedFilename,
            path: filepath,
            url: issue.url
          });

          console.log(`   ✅ Saved to ${filepath}`);
        } catch (err) {
          console.error(`   ❌ Failed: ${err.message}`);
        }
      }
    }

    // Try to download documents from comment links
    if (documentLinks.length > 0) {
      for (const docLink of documentLinks) {
        try {
          // Extract filename from URL or use a default
          const urlParts = docLink.url.split('/');
          const urlFilename = urlParts[urlParts.length - 1];
          const filename = `policy-doc-${urlFilename}`;
          const filepath = path.join(DOWNLOADS_DIR, `${issue.identifier}-${filename}`);

          console.log(`📥 Downloading ${issue.identifier}: Document from comment...`);
          await downloadFile(docLink.url, filepath);

          downloaded.push({
            ticketId: issue.identifier,
            title: issue.title,
            filename,
            path: filepath,
            url: issue.url,
            source: 'comment'
          });

          console.log(`   ✅ Saved to ${filepath}`);
        } catch (err) {
          console.error(`   ❌ Failed: ${err.message}`);
        }
      }
    }

    // Catalog issue with recommendations
    const hasNonFileAttachments = attachments.length > fileAttachments.length;

    if (hasNonFileAttachments || !hasFileAttachment) {
      const recommendation = generateRecommendation(issue);

      const item = {
        ticketId: issue.identifier,
        title: issue.title,
        description: (issue.description || '').substring(0, 200),
        state: issue.state?.name,
        priority: issue.priority === 1 ? 'Urgent' : 'High',
        recommendation,
        url: issue.url,
        attachmentCount: attachments.length,
        hasGitHubPRs: attachments.some(a =>
          (a.title || '').includes('GitHub PR') ||
          (a.subtitle || '').includes('github.com')
        )
      };

      if (hasFileAttachment) {
        withAttachments.push(item);
      } else {
        needsAction.push(item);
      }
    }
  }

  return { downloaded, withAttachments, needsAction };
}

function generateRecommendation(issue) {
  const title = issue.title.toLowerCase();
  const description = (issue.description || '').toLowerCase();

  if (title.includes('policy')) {
    return 'Create policy document covering scope, procedures, and responsibilities. Attach as PDF/DOCX.';
  }

  if (title.includes('training')) {
    return 'Schedule training session, document attendance, and attach completion certificates.';
  }

  if (title.includes('review')) {
    return 'Conduct formal review, document findings, and attach signed review report.';
  }

  if (title.includes('implement') || title.includes('deployment')) {
    return 'Implement the control, collect evidence of implementation, attach screenshots/logs.';
  }

  if (title.includes('procedure') || title.includes('process')) {
    return 'Document the procedure step-by-step, attach process flowchart or written SOP.';
  }

  if (title.includes('audit') || title.includes('compliance')) {
    return 'Perform audit/compliance check, document results, attach audit report.';
  }

  if (title.includes('access') || title.includes('permission')) {
    return 'Review and document access controls, attach access matrix or permission logs.';
  }

  if (title.includes('monitor') || title.includes('logging')) {
    return 'Set up monitoring/logging, document configuration, attach sample logs.';
  }

  // Default
  return 'Review requirements, create necessary documentation, and attach supporting evidence.';
}

function generateReport(downloaded, withAttachments, needsAction) {
  console.log('📝 Generating report...');

  let markdown = `# SOC2 High Priority Tickets Audit Report\n\n`;
  markdown += `**Generated**: ${new Date().toISOString()}\n\n`;
  markdown += `---\n\n`;

  // Section 1: Downloaded Documents
  markdown += `## 📥 Downloaded Documents (${downloaded.length})\n\n`;

  if (downloaded.length > 0) {
    markdown += `| Ticket ID | Title | Filename | Path |\n`;
    markdown += `|-----------|-------|----------|------|\n`;

    for (const item of downloaded) {
      markdown += `| [${item.ticketId}](${item.url}) | ${item.title} | ${item.filename} | \`${item.path}\` |\n`;
    }
  } else {
    markdown += `*No policy documents found to download. Most attachments are GitHub PR references.*\n`;
  }

  markdown += `\n---\n\n`;

  // Section 2: All High Priority Tickets with Recommendations
  const allIssues = [...withAttachments, ...needsAction].sort((a, b) => {
    const aPri = a.priority === 'Urgent' ? 0 : 1;
    const bPri = b.priority === 'Urgent' ? 0 : 1;
    return aPri - bPri;
  });

  markdown += `## 📋 All High/Urgent Priority Tickets (${allIssues.length})\n\n`;

  for (const item of allIssues) {
    markdown += `### [${item.ticketId}](${item.url}): ${item.title}\n\n`;
    markdown += `**Priority**: ${item.priority} | **State**: ${item.state}\n\n`;

    if (item.hasGitHubPRs) {
      markdown += `**Status**: ✅ Has ${item.attachmentCount} GitHub PR(s) attached (likely completed/in progress)\n\n`;
    } else if (item.attachmentCount > 0) {
      markdown += `**Status**: Has ${item.attachmentCount} attachment(s)\n\n`;
    } else {
      markdown += `**Status**: ⚠️ No attachments\n\n`;
    }

    if (item.description) {
      markdown += `**Description**: ${item.description}${item.description.length >= 200 ? '...' : ''}\n\n`;
    }

    markdown += `**Recommendation**: ${item.recommendation}\n\n`;
    markdown += `---\n\n`;
  }

  // Summary
  markdown += `\n## 📊 Summary\n\n`;
  markdown += `- **Total High/Urgent Priority Tickets**: ${allIssues.length}\n`;
  markdown += `- **Urgent Priority**: ${allIssues.filter(i => i.priority === 'Urgent').length}\n`;
  markdown += `- **High Priority**: ${allIssues.filter(i => i.priority === 'High').length}\n`;
  markdown += `- **With GitHub PRs**: ${allIssues.filter(i => i.hasGitHubPRs).length}\n`;
  markdown += `- **With Attachments**: ${allIssues.filter(i => i.attachmentCount > 0).length}\n`;
  markdown += `- **Without Attachments**: ${allIssues.filter(i => i.attachmentCount === 0).length}\n`;
  markdown += `- **Documents Downloaded**: ${downloaded.length}\n`;

  fs.writeFileSync(REPORT_FILE, markdown);
  console.log(`✅ Report saved to ${REPORT_FILE}`);
}

// Main execution
async function main() {
  try {
    console.log('🚀 Starting SOC2 Audit...\n');

    const project = await findSOC2Project();
    const issues = await getHighPriorityIssues(project.id);

    console.log('\n📦 Processing issues...\n');
    const { downloaded, withAttachments, needsAction } = await processIssues(issues);

    console.log('\n');
    generateReport(downloaded, withAttachments, needsAction);

    console.log('\n✅ Audit complete!');
    console.log(`   📥 Downloads: ${DOWNLOADS_DIR}/`);
    console.log(`   📝 Report: ${REPORT_FILE}`);

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

main();
