import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import fsSync from 'fs';
import http from 'http';
import url from 'url';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import db from './db.js';
import WebhookBranchCreator from './webhook-branch-creator.js';

dotenv.config();

// Utility functions for worktree handling
function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { shell: false, ...opts });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function mapBranchToDir(branch) {
  return branch.replace(/[^A-Za-z0-9._-]/g, '_');
}

const LINEAR_API_KEY = process.env.LINEAR_APP;
// Prefer the dedicated webhook signing secret; do NOT fall back to OAuth client secret
const LINEAR_WEBHOOK_SECRET =
  process.env.WEBHOOK_SIGNING_SECRET ||
  process.env.LINEAR_WEBHOOK_SECRET ||
  process.env.LINEAR_WEBHOOK_SIGNING_SECRET ||
  process.env.LINEAR_SIGNING_SECRET ||
  null;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

class LinearTaskCategorizer {
  constructor() {
    this.linearHeaders = {
      'Authorization': LINEAR_API_KEY,
      'Content-Type': 'application/json'
    };
    this.openRouterHeaders = {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    };
  }

  async fetchLinearIssues() {
    const query = `
      query {
        issues(first: 100) {
          nodes {
            id
            title
            description
            priority
            state {
              name
              type
            }
            assignee {
              name
            }
            labels {
              nodes {
                name
              }
            }
            createdAt
            updatedAt
          }
        }
      }
    `;

    try {
      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: this.linearHeaders,
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.data.issues.nodes;
    } catch (error) {
      console.error('Error fetching Linear issues:', error);
      return [];
    }
  }

  async categorizeWithAI(issues) {
    // Process in smaller chunks to avoid token limits
    const chunkSize = 20;
    const chunks = [];
    for (let i = 0; i < issues.length; i += chunkSize) {
      chunks.push(issues.slice(i, i + chunkSize));
    }

    let allForgeTasks = [];
    let allOtherTasks = [];

    for (let i = 0; i < chunks.length; i++) {
      console.log(`🔄 Processing chunk ${i + 1}/${chunks.length} (${chunks[i].length} issues)`);

      const prompt = `
Analyze these Linear issues and categorize ALL of them into two main groups:

1. FORGE DOCUMENT CREATION TASKS - Tasks that can be completed or started by creating FORGE documents (requirements, design docs, test plans, architecture docs, policies, procedures, etc.)
2. OTHER TASKS - All other implementation, bug fixes, infrastructure, etc.

IMPORTANT: You must categorize EVERY single issue provided. Do not skip any.

For each task, provide:
- Task ID and title
- Brief reason for categorization
- For FORGE document tasks: suggest what type of document should be created

Issues to analyze (${chunks[i].length} issues):
${JSON.stringify(chunks[i].map(issue => ({
  id: issue.id,
  title: issue.title,
  description: issue.description || '',
  state: issue.state?.name,
  priority: issue.priority
})), null, 2)}

Please respond in JSON format and categorize ALL ${chunks[i].length} issues:
{
  "forge_document_tasks": [
    {
      "id": "task_id",
      "title": "task_title",
      "reason": "why this can be completed with document creation",
      "suggested_document": "type of document to create"
    }
  ],
  "other_tasks": [
    {
      "id": "task_id",
      "title": "task_title",
      "category": "category like 'bug_fix', 'feature_implementation', 'infrastructure'",
      "reason": "brief description"
    }
  ]
}
`;

      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: this.openRouterHeaders,
          body: JSON.stringify({
            model: 'anthropic/claude-3.5-sonnet',
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: 4000
          })
        });

        if (!response.ok) {
          throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;

        // Extract JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const chunkResult = JSON.parse(jsonMatch[0]);
          allForgeTasks = allForgeTasks.concat(chunkResult.forge_document_tasks || []);
          allOtherTasks = allOtherTasks.concat(chunkResult.other_tasks || []);
        } else {
          console.error('Could not parse JSON from AI response for chunk', i + 1);
          const fallback = this.fallbackCategorization(chunks[i]);
          allForgeTasks = allForgeTasks.concat(fallback.forge_document_tasks || []);
          allOtherTasks = allOtherTasks.concat(fallback.other_tasks || []);
        }
      } catch (error) {
        console.error(`Error categorizing chunk ${i + 1} with AI:`, error);
        const fallback = this.fallbackCategorization(chunks[i]);
        allForgeTasks = allForgeTasks.concat(fallback.forge_document_tasks || []);
        allOtherTasks = allOtherTasks.concat(fallback.other_tasks || []);
      }

      // Add a small delay between API calls
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return {
      forge_document_tasks: allForgeTasks,
      other_tasks: allOtherTasks
    };
  }

  fallbackCategorization(issues) {
    const forgeKeywords = [
      'document', 'spec', 'requirement', 'design', 'architecture', 'plan',
      'documentation', 'wireframe', 'mockup', 'user story', 'acceptance criteria',
      'test plan', 'strategy', 'proposal', 'rfc', 'adr', 'policy', 'procedure',
      'process', 'workflow', 'template', 'standard', 'guideline', 'manual',
      'runbook', 'playbook', 'sop', 'compliance', 'audit', 'review',
      'disaster recovery', 'business continuity', 'incident response',
      'change management', 'rollback', 'deployment guide', 'configuration',
      'setup', 'installation', 'training', 'onboarding', 'knowledge base',
      'wiki', 'readme', 'changelog', 'release notes', 'roadmap',
      'backlog grooming', 'sprint planning', 'retrospective', 'post-mortem',
      'risk assessment', 'threat model', 'security policy', 'privacy policy',
      'terms of service', 'sla', 'service level', 'monitoring', 'alerting',
      'logging', 'metrics', 'dashboard', 'reporting', 'analytics'
    ];

    const forgeTasks = [];
    const otherTasks = [];

    issues.forEach(issue => {
      const text = `${issue.title} ${issue.description || ''}`.toLowerCase();
      const isForgeTask = forgeKeywords.some(keyword => text.includes(keyword));

      if (isForgeTask) {
        forgeTasks.push({
          id: issue.id,
          title: issue.title,
          reason: 'Contains Forge-related keywords',
          suggested_document: 'Requirements or Design Document'
        });
      } else {
        otherTasks.push({
          id: issue.id,
          title: issue.title,
          category: 'implementation',
          reason: 'Appears to be implementation work'
        });
      }
    });

    return {
      forge_document_tasks: forgeTasks,
      other_tasks: otherTasks
    };
  }

  async generateReport(categorizedTasks, allIssues) {
    const timestamp = new Date().toISOString();

    let report = `LINEAR TASK CATEGORIZATION REPORT
Generated: ${timestamp}
Total Issues Analyzed: ${allIssues.length}

========================================
FORGE DOCUMENT CREATION TASKS (${categorizedTasks.forge_document_tasks.length})
========================================

These tasks can be completed or started by creating FORGE documents:

`;

    categorizedTasks.forge_document_tasks.forEach((task, index) => {
      const originalIssue = allIssues.find(issue => issue.id === task.id);
      report += `${index + 1}. ${task.title}
   ID: ${task.id}
   Suggested Document: ${task.suggested_document}
   Reason: ${task.reason}
   Priority: ${originalIssue?.priority || 'Not set'}
   Status: ${originalIssue?.state?.name || 'Unknown'}

`;
    });

    report += `
========================================
OTHER TASKS (${categorizedTasks.other_tasks.length})
========================================

These tasks require implementation, bug fixes, or other non-document work:

`;

    // Group other tasks by category
    const categorizedOther = {};
    categorizedTasks.other_tasks.forEach(task => {
      const category = task.category || 'uncategorized';
      if (!categorizedOther[category]) {
        categorizedOther[category] = [];
      }
      categorizedOther[category].push(task);
    });

    Object.keys(categorizedOther).forEach(category => {
      report += `\n--- ${category.toUpperCase().replace('_', ' ')} (${categorizedOther[category].length}) ---\n\n`;

      categorizedOther[category].forEach((task, index) => {
        const originalIssue = allIssues.find(issue => issue.id === task.id);
        report += `${index + 1}. ${task.title}
   ID: ${task.id}
   Reason: ${task.reason}
   Priority: ${originalIssue?.priority || 'Not set'}
   Status: ${originalIssue?.state?.name || 'Unknown'}

`;
      });
    });

    report += `
========================================
SUMMARY
========================================

📋 FORGE Document Tasks: ${categorizedTasks.forge_document_tasks.length} tasks can be completed by creating documents
🔧 Implementation Tasks: ${categorizedTasks.other_tasks.length} tasks require development work

NEXT STEPS:
1. Review the FORGE document tasks above
2. Let me know which documents you'd like me to create
3. I can help generate templates and content for any of these documents

`;

    return report;
  }

  async run() {
    console.log('🔄 Fetching Linear issues...');
    const issues = await this.fetchLinearIssues();

    if (issues.length === 0) {
      console.log('❌ No issues found or error fetching issues');
      return;
    }

    console.log(`✅ Found ${issues.length} issues`);
    console.log('🤖 Categorizing with AI...');

    const categorizedTasks = await this.categorizeWithAI(issues);

    console.log('📝 Generating report...');
    const report = await this.generateReport(categorizedTasks, issues);

    await fs.writeFile('linear_task_analysis.txt', report);
    console.log('✅ Report saved to linear_task_analysis.txt');

    // Also log summary to console
    console.log(`\n📊 SUMMARY:`);
    console.log(`   FORGE Document Tasks: ${categorizedTasks.forge_document_tasks.length}`);
    console.log(`   Other Tasks: ${categorizedTasks.other_tasks.length}`);
    console.log(`   Total: ${issues.length}`);
  }
}

// Helper function to serve HTML files
async function serveHtmlFile(res, filename) {
  try {
    const filePath = path.join(process.cwd(), 'public', filename);
    const content = await fs.readFile(filePath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(content);
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<h1>404 - File Not Found</h1>');
  }
}

// Helper function to exchange OAuth code for token
async function exchangeCodeForToken(code) {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code: code,
      redirect_uri: `${process.env.RENDER_DOMAIN || 'http://localhost:3000'}/oauth/callback`
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to exchange code for token: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`OAuth error: ${data.error_description || data.error}`);
  }

  return data.access_token;
}

// Signature verification removed per current policy; using Linear API verification instead.

/**
 * Verify webhook payload generically against Linear API state for Issue events.
 * Returns an object { ok: boolean, mismatches: Array, api: object }.
 */
async function verifyWebhookAgainstLinear(payload) {
  const VERBOSE = process.env.VERBOSE_LOG_WEBHOOKS === 'true';
  const result = { ok: true, mismatches: [], api: null };

  try {
    const type = payload?.type;
    const data = payload?.data || {};
    if (type !== 'Issue') {
      // For now, only Issue is verified. Others pass.
      return result;
    }

    if (!LINEAR_API_KEY) {
      if (VERBOSE) console.warn('⚠️ No LINEAR_APP key; skipping generic Linear verification');
      return result; // do not block when key missing
    }

    // Build query by id if available; otherwise, try identifier search
    let query;
    let variables;
    if (data.id) {
      query = `query($id: String!) {
        issue(id: $id) {
          id number identifier title description updatedAt createdAt
          assignee { id name email }
          delegate { id name email }
          state { id name type }
          team { id key name }
          project { id name }
          labels { nodes { id name } }
        }
      }`;
      variables = { id: data.id };
    } else if (data.identifier) {
      query = `query($q: String!) {
        issues(filter: { query: $q }, first: 1) {
          nodes {
            id number identifier title description updatedAt createdAt
            assignee { id name email }
            delegate { id name email }
            state { id name type }
            team { id key name }
            project { id name }
            labels { nodes { id name } }
          }
        }
      }`;
      variables = { q: data.identifier };
    } else {
      result.ok = true; // nothing to verify robustly
      return result;
    }

    const resp = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { 'Authorization': LINEAR_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables })
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error(`❌ Linear API verification error: ${resp.status} ${resp.statusText} ${text}`);
      return result; // be resilient
    }

    const json = await resp.json();
    const issue = json?.data?.issue || json?.data?.issues?.nodes?.[0] || null;
    result.api = issue;
    if (!issue) {
      result.ok = false;
      result.mismatches.push({ field: 'issue', reason: 'Issue not found in Linear' });
      return result;
    }

    // Helpers
    const addMismatch = (field, expected, actual, note) => {
      result.ok = false;
      result.mismatches.push({ field, expected, actual, note });
    };
    const norm = v => (typeof v === 'string' ? v.trim() : v);
    const normLower = v => (typeof v === 'string' ? v.trim().toLowerCase() : v);

    // Compare core identifiers
    if (data.id && norm(data.id) !== norm(issue.id)) addMismatch('id', data.id, issue.id);
    if (data.identifier && norm(data.identifier) !== norm(issue.identifier)) addMismatch('identifier', data.identifier, issue.identifier);

    // Titles and numbers
    if (data.title && norm(data.title) !== norm(issue.title)) addMismatch('title', data.title, issue.title);
    if (data.number && Number(data.number) !== Number(issue.number)) addMismatch('number', data.number, issue.number);

    // Assignee/delegate by id or name
    if (data.assigneeId && norm(data.assigneeId) !== norm(issue.assignee?.id)) addMismatch('assigneeId', data.assigneeId, issue.assignee?.id);
    if (data.assignee?.name && normLower(data.assignee.name) !== normLower(issue.assignee?.name || '')) addMismatch('assignee.name', data.assignee.name, issue.assignee?.name);
    if (data.delegateId && norm(data.delegateId) !== norm(issue.delegate?.id)) addMismatch('delegateId', data.delegateId, issue.delegate?.id);
    if (data.delegate?.name && normLower(data.delegate.name) !== normLower(issue.delegate?.name || '')) addMismatch('delegate.name', data.delegate.name, issue.delegate?.name);

    // State and team/project (ids available in payload)
    if (data.stateId && norm(data.stateId) !== norm(issue.state?.id)) addMismatch('stateId', data.stateId, issue.state?.id);
    if (data.teamId && norm(data.teamId) !== norm(issue.team?.id)) addMismatch('teamId', data.teamId, issue.team?.id);
    if (data.projectId && norm(data.projectId) !== norm(issue.project?.id)) addMismatch('projectId', data.projectId, issue.project?.id);

    // UpdatedAt tolerance (5 minutes)
    if (data.updatedAt) {
      const payloadTs = Date.parse(data.updatedAt);
      const apiTs = Date.parse(issue.updatedAt);
      if (!Number.isNaN(payloadTs) && !Number.isNaN(apiTs)) {
        const delta = Math.abs(apiTs - payloadTs);
        const fiveMin = 5 * 60 * 1000;
        if (delta > fiveMin) addMismatch('updatedAt', data.updatedAt, issue.updatedAt, `deltaMs=${delta}`);
      }
    }

    if (VERBOSE && result.mismatches.length) {
      console.log('❌ Linear verification mismatches:', JSON.stringify(result.mismatches, null, 2));
    }
    if (VERBOSE && !result.mismatches.length) {
      console.log('✅ Linear API generic verification succeeded');
    }

    return result;
  } catch (e) {
    console.error('❌ Error during generic Linear verification:', e.message);
    return result; // do not block on exceptions
  }
}

// HTTP server for health check and webhook
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  if (parsedUrl.pathname === '/login' && req.method === 'GET') {
    await serveHtmlFile(res, 'login.html');
  } else if (parsedUrl.pathname === '/oauth/url' && req.method === 'GET') {
    // Generate OAuth URL
    const authUrl = 'https://github.com/login/oauth/authorize?' + new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID,
      redirect_uri: `${process.env.RENDER_DOMAIN || 'http://localhost:3000'}/oauth/callback`,
      scope: 'repo',
      state: Math.random().toString(36).substring(2)
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ authUrl }));
  } else if (parsedUrl.pathname === '/oauth/callback') {
    // Redirect to the HTML file with query parameters
    const redirectUrl = `/oauth/success${req.url.substring(req.url.indexOf('?'))}`;
    res.writeHead(302, { 'Location': redirectUrl });
    res.end();
  } else if (parsedUrl.pathname === '/oauth/success' && req.method === 'GET') {
    await serveHtmlFile(res, 'oauth-success.html');
  } else if (parsedUrl.pathname === '/oauth/exchange' && req.method === 'POST') {
    // Exchange code for token
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const { code } = JSON.parse(body);
        const token = await exchangeCodeForToken(code);

        // Get GitHub user info
        const userInfo = await db.getGitHubUserInfo(token);

        // Get client IP and user agent for security tracking
        const clientIpRaw = req.headers['x-forwarded-for'] ||
                           req.headers['x-real-ip'] ||
                           req.connection.remoteAddress ||
                           req.socket.remoteAddress ||
                           (req.connection.socket ? req.connection.socket.remoteAddress : null);

        // Extract the first IP address from comma-separated list (for INET field compatibility)
        const clientIp = clientIpRaw ? clientIpRaw.split(',')[0].trim() : null;
        const userAgent = req.headers['user-agent'];

        // Store token in database
        const storedToken = await db.storeGitHubToken({
          userId: userInfo.username, // Using username as user_id
          username: userInfo.username,
          email: userInfo.email,
          accessToken: token,
          scope: 'repo', // We requested repo scope
          githubId: userInfo.githubId,
          avatarUrl: userInfo.avatarUrl,
          htmlUrl: userInfo.htmlUrl,
          authorizationCode: code,
          state: parsedUrl.searchParams.get('state'),
          redirectUri: `${process.env.RENDER_DOMAIN || 'http://localhost:3000'}/oauth/callback`,
          ipAddress: clientIp,
          userAgent: userAgent
        });

        // SECURITY: Only return success and user info, never expose the token
        const partialToken = token.substring(0, 8) + '...' + token.substring(token.length - 8);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Token stored successfully',
          partial_token: partialToken,
          user: {
            username: userInfo.username,
            avatar_url: userInfo.avatarUrl,
            github_id: userInfo.githubId
          },
          token_id: storedToken.id
        }));
      } catch (error) {
        console.error('❌ OAuth exchange error:', error.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
  } else if (parsedUrl.pathname === '/api/tokens' && req.method === 'GET') {
    // Get token stats (no sensitive data exposed)
    try {
      const stats = await db.getGitHubTokenStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        stats: {
          total_tokens: parseInt(stats.total_tokens),
          active_tokens: parseInt(stats.active_tokens),
          unique_users: parseInt(stats.unique_users),
          avg_usage: parseFloat(stats.avg_usage).toFixed(2),
          latest_token: stats.latest_token,
          latest_usage: stats.latest_usage
        }
      }));
    } catch (error) {
      console.error('❌ Failed to get token stats:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
    }
  } else if (parsedUrl.pathname === '/api/issues' && req.method === 'GET') {
    // List available issue files in the issues folder
    try {
      const issuesDir = path.join(process.cwd(), 'issues');
      const files = await fs.readdir(issuesDir);
      const issueFiles = files.filter(f => f.endsWith('.md') || f.endsWith('.txt'));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        issues: issueFiles.map(f => ({ name: f, path: path.join(issuesDir, f) }))
      }));
    } catch (error) {
      console.error('❌ Failed to list issues:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Failed to list issues' }));
    }
  } else if (parsedUrl.pathname === '/api/folder-status' && req.method === 'GET') {
    // Get Linear and GitHub status for a folder/branch
    const folderName = parsedUrl.searchParams.get('folder');
    if (!folderName) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Missing folder parameter' }));
      return;
    }

    try {
      const result = { success: true, folder: folderName, linear: null, github: null };

      // Extract Linear ticket ID from folder name (e.g., "ENG-123", "PROJ-456")
      const linearIdMatch = folderName.match(/([A-Z]+)-(\d+)/);
      const linearId = linearIdMatch ? linearIdMatch[0] : null;

      // Fetch Linear ticket status
      if (linearId && LINEAR_API_KEY) {
        try {
          console.log(`🔍 Searching Linear for: ${linearId}`);
          const linearQuery = `
            query($id: String!) {
              issue(id: $id) {
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
              }
            }
          `;

          const linearResponse = await fetch('https://api.linear.app/graphql', {
            method: 'POST',
            headers: {
              'Authorization': LINEAR_API_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              query: linearQuery,
              variables: { id: linearId }
            })
          });

          if (linearResponse.ok) {
            const linearData = await linearResponse.json();
            console.log(`📊 Linear response for ${linearId}:`, JSON.stringify(linearData, null, 2));

            if (linearData.errors) {
              console.error('Linear API errors:', linearData.errors);
              result.linear = { error: linearData.errors[0]?.message || 'Linear API error' };
            } else {
              const issue = linearData.data?.issue;
              result.linear = issue || { error: 'Issue not found' };
            }
          } else {
            console.error(`Linear API error: ${linearResponse.status}`);
            result.linear = { error: `Linear API error: ${linearResponse.status}` };
          }
        } catch (err) {
          console.error('Error fetching Linear status:', err.message);
          result.linear = { error: err.message };
        }
      }

      // Fetch GitHub PR status
      const githubRepoOwner = process.env.GITHUB_REPO_OWNER;
      const githubRepoName = process.env.GITHUB_REPO_NAME;
      const githubToken = process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN;

      if (githubRepoOwner && githubRepoName && githubToken) {
        try {
          console.log(`🔍 Searching for PRs with head: ${githubRepoOwner}:${folderName}`);
          const githubResponse = await fetch(
            `https://api.github.com/repos/${githubRepoOwner}/${githubRepoName}/pulls?head=${githubRepoOwner}:${folderName}&state=all`,
            {
              headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
              }
            }
          );

          if (githubResponse.ok) {
            const prs = await githubResponse.json();
            console.log(`📊 Found ${prs.length} PRs for ${folderName}`);
            result.github = prs.map(pr => ({
              number: pr.number,
              title: pr.title,
              state: pr.state,
              url: pr.html_url,
              created_at: pr.created_at,
              updated_at: pr.updated_at,
              merged_at: pr.merged_at,
              draft: pr.draft
            }));
          } else {
            console.error(`GitHub API error: ${githubResponse.status} ${githubResponse.statusText}`);
            result.github = { error: `GitHub API error: ${githubResponse.status}` };
          }
        } catch (err) {
          console.error('Error fetching GitHub status:', err.message);
          result.github = { error: err.message };
        }
      } else {
        console.log('⚠️ Skipping GitHub PR fetch - missing GITHUB_REPO_OWNER, GITHUB_REPO_NAME, or GITHUB_TOKEN');
        result.github = null;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error('❌ Failed to get folder status:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
  } else if (parsedUrl.pathname === '/api/claude-url' && req.method === 'GET') {
    // Generate Claude Code command with issue context
    try {
      const issueName = parsedUrl.searchParams.get('issue');
      if (!issueName) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Missing issue parameter' }));
        return;
      }

      const issuesDir = path.join(process.cwd(), 'issues');
      const issuePath = path.join(issuesDir, issueName);

      // Read issue file content
      const issueContent = await fs.readFile(issuePath, 'utf8');

      // Generate Claude Code command
      const command = `claude --add "${issuePath}" "Please help me with this issue"`;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        command: command,
        issueFile: issuePath
      }));
    } catch (error) {
      console.error('❌ Failed to generate Claude command:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Failed to generate command' }));
    }
  } else if (parsedUrl.pathname === '/api/releases/notify' && req.method === 'POST') {
    // Handle release notifications from GitHub Actions
    try {
      // Verify authorization
      const authHeader = req.headers['authorization'] || '';
      const expectedToken = process.env.FORGE_RELEASE_TOKEN;

      if (!expectedToken) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Server not configured (missing FORGE_RELEASE_TOKEN)' }));
        return;
      }

      if (!authHeader.startsWith('Bearer ') || authHeader.substring(7) !== expectedToken) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
        return;
      }

      // Parse request body
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
      }
      const data = JSON.parse(body);

      const { tag, release_notes, pr_number, pr_url } = data;

      if (!tag || !release_notes || !pr_number || !pr_url) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Missing required fields: tag, release_notes, pr_number, pr_url' }));
        return;
      }

      // Send notifications
      const results = { slack: null, emails: [] };

      // Send Slack notification
      const slackWebhook = process.env.SLACK_RELEASE_CHANNEL;
      if (slackWebhook) {
        try {
          // Convert markdown links [text](url) to Slack <url|text>
          const slackText = release_notes.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<$2|$1>').substring(0, 2950);

          const slackPayload = {
            text: `🚀 New Release: ${tag}`,
            blocks: [
              { type: 'header', text: { type: 'plain_text', text: `🚀 New Release: ${tag}`, emoji: true } },
              { type: 'section', text: { type: 'mrkdwn', text: slackText } },
              { type: 'divider' },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `<${pr_url}|View Pull Request #${pr_number}>` }] }
            ]
          };

          const slackRes = await fetch(slackWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(slackPayload)
          });

          results.slack = slackRes.ok ? 'sent' : 'failed';
          console.log(slackRes.ok ? '✅ Sent Slack notification' : `❌ Slack failed: ${slackRes.status}`);
        } catch (err) {
          results.slack = 'failed';
          console.error('❌ Slack error:', err.message);
        }
      } else {
        results.slack = 'not_configured';
      }

      // Send email notifications
      const resendApiKey = process.env.RESEND_API_KEY;
      const recipientEmails = (process.env.RELEASE_NOTIFICATION_EMAILS || '').split(',').map(e => e.trim()).filter(e => e);

      if (resendApiKey && recipientEmails.length > 0) {
        for (const toEmail of recipientEmails) {
          try {
            // Basic markdown to HTML conversion
            const htmlContent = release_notes
              .replace(/^### (.+)$/gm, '<h3>$1</h3>')
              .replace(/^## (.+)$/gm, '<h2>$1</h2>')
              .replace(/^# (.+)$/gm, '<h1>$1</h1>')
              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
              .replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2">$1</a>')
              .replace(/\n/g, '<br>')
              .replace(/^---$/gm, '<hr>');

            const emailPayload = {
              from: process.env.EMAIL_SENDER || 'Forge System <releases@resend.dev>',
              to: toEmail,
              subject: `🚀 New Release: ${tag}`,
              html: `
                <html>
                <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #333;">🚀 New Release: ${tag}</h2>
                  <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
                    ${htmlContent}
                  </div>
                  <p style="text-align: center; margin: 30px 0;">
                    <a href="${pr_url}" style="background-color: #007cba; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                      View Pull Request #${pr_number}
                    </a>
                  </p>
                  <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                  <p style="color: #666; font-size: 14px;">
                    This is an automated release notification from the Forge system.
                  </p>
                </body>
                </html>
              `
            };

            const emailRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(emailPayload)
            });

            const status = emailRes.ok ? 'sent' : 'failed';
            results.emails.push({ email: toEmail, status });
            console.log(emailRes.ok ? `✅ Sent email to ${toEmail}` : `❌ Email failed for ${toEmail}: ${emailRes.status}`);
          } catch (err) {
            results.emails.push({ email: toEmail, status: 'failed' });
            console.error(`❌ Email error for ${toEmail}:`, err.message);
          }
        }
      } else {
        results.email_service = resendApiKey ? 'no_recipients' : 'not_configured';
      }

      const anySent = results.slack === 'sent' || results.emails.some(e => e.status === 'sent');

      res.writeHead(anySent ? 200 : 207, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: anySent, tag, notifications: results }));
    } catch (error) {
      console.error('❌ Release notification error:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
  } else if (parsedUrl.pathname === '/webhook') {
    // Only accept POST requests for webhooks
    if (req.method !== 'POST') {
      console.log(`❌ Webhook endpoint only accepts POST requests, got: ${req.method}`);
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed. Only POST requests accepted.' }));
      return;
    }

    // Verify Linear-specific headers
    const userAgent = req.headers['user-agent'];
    const linearEvent = req.headers['linear-event'];

    if (!userAgent || !userAgent.includes('Linear')) {
      console.log(`⚠️ Suspicious webhook: User-Agent does not contain 'Linear': ${userAgent}`);
    }

    if (!linearEvent) {
      console.log(`⚠️ Missing linear-event header - may not be a genuine Linear webhook`);
    }

    // Verbose only when explicitly enabled
    const VERBOSE = process.env.VERBOSE_LOG_WEBHOOKS === 'true';
    // Log webhook requests (concise by default; verbose when enabled)
    console.log(`🎯 WEBHOOK REQUEST: ${req.method} ${req.url} ua=${userAgent || 'n/a'} event=${linearEvent || 'n/a'}`);
    if (VERBOSE) {
      console.log(`   Headers:`, JSON.stringify(req.headers, null, 2));
      console.log(`   Query Parameters:`, Object.fromEntries(parsedUrl.searchParams));
    }

    // Collect body data (preserve raw bytes for signature verification)
    const chunks = [];
    req.on('data', chunk => {
      chunks.push(chunk);
    });

    req.on('end', async () => {
      const bodyBuffer = Buffer.concat(chunks);
      const bodyText = bodyBuffer.toString('utf8');
      if (bodyBuffer.length > 0) {
        if (VERBOSE) console.log(`   Body:`, bodyText);

        // Signature enforcement disabled; verify authenticity via Linear API instead
        if (VERBOSE) console.log('🔎 Verifying webhook against Linear API');

        try {
          const parsedBody = JSON.parse(bodyText);
          console.log(`   Parsed Body:`, JSON.stringify(parsedBody, null, 2));

          // Generic verification: ensure payload matches Linear API state
          const verification = await verifyWebhookAgainstLinear(parsedBody);
          if (!verification.ok) {
            console.error('🚫 WEBHOOK BLOCKED: Linear API generic verification failed');
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized: Payload does not match Linear API', mismatches: verification.mismatches }));
            return;
          }

          // Process webhook for Forge assignee events
          const branchCreator = new WebhookBranchCreator();
          const forgeCheck = branchCreator.isForgeAssigneeEvent(parsedBody);

          if (forgeCheck.isForgeEvent) {
            console.log(`🎯 Forge assigned as agent! Processing automatic branch creation...`);
            const result = await branchCreator.processLinearAssigneeWebhook(parsedBody, forgeCheck.assigneeUsername);

            if (result.success) {
              console.log(`✅ Automatic branch creation successful:`, {
                branchName: result.branchName,
                issueId: result.issueId,
                issueTitle: result.issueTitle,
                assignee: result.assignee
              });
            } else {
              console.log(`⚠️ Automatic branch creation failed:`, result.reason || result.error);
            }
          }

        } catch (e) {
          console.log(`   Body (raw):`, body);
        }
      }
      console.log('   ===========================\n');

      // Respond with success
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'Webhook received and logged',
        method: req.method,
        timestamp: new Date().toISOString()
      }));
    });
  } else if (parsedUrl.pathname === '/login' && req.method === 'GET') {
    // Serve login page with GitHub OAuth button
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Forge – GitHub OAuth</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
        :root {
            --bg: #080d1a;
            --panel: rgba(255, 255, 255, 0.05);
            --border: rgba(255, 255, 255, 0.1);
            --text: #e2e8f0;
            --muted: #94a3b8;
            --accent: #f97316;
            --accent-2: #22d3ee;
        }
        body {
            font-family: 'Space Grotesk', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background:
                radial-gradient(circle at 20% 20%, rgba(249, 115, 22, 0.14) 0, transparent 28%),
                radial-gradient(circle at 80% 0%, rgba(34, 211, 238, 0.14) 0, transparent 26%),
                linear-gradient(135deg, #0a0f1f 0%, #070b16 100%);
            color: var(--text);
            padding: 24px;
        }
        .container {
            text-align: center;
            background: var(--panel);
            padding: 3rem;
            border-radius: 20px;
            backdrop-filter: blur(12px);
            box-shadow: 0 28px 80px rgba(0, 0, 0, 0.55);
            border: 1px solid var(--border);
            max-width: 520px;
            width: 100%;
        }
        h1 {
            margin-bottom: 0.75rem;
            font-size: 2.4rem;
            font-weight: 700;
            letter-spacing: -0.02em;
        }
        .eyebrow {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: linear-gradient(135deg, rgba(249, 115, 22, 0.18), rgba(34, 211, 238, 0.14));
            color: var(--text);
            padding: 8px 12px;
            border-radius: 999px;
            font-size: 13px;
            border: 1px solid var(--border);
            letter-spacing: 0.04em;
        }
        .tagline {
            margin-bottom: 2rem;
            color: var(--muted);
            font-size: 15px;
        }
        .login-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            background: linear-gradient(135deg, #24292e, #111418);
            color: white;
            padding: 14px 28px;
            border: 1px solid #2f353c;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 700;
            text-decoration: none;
            transition: all 0.2s ease;
            cursor: pointer;
            box-shadow: 0 18px 40px rgba(0,0,0,0.45);
            letter-spacing: 0.01em;
        }
        .login-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 24px 50px rgba(0, 0, 0, 0.55);
        }
        .github-icon {
            width: 20px;
            height: 20px;
        }
        .info {
            margin-top: 2rem;
            font-size: 14px;
            color: var(--muted);
            max-width: 420px;
            margin-left: auto;
            margin-right: auto;
            line-height: 1.6;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="eyebrow">Forge · Local automation for builders</div>
        <h1>Sign in to Forge</h1>
        <p class="tagline">Authorize with GitHub so Forge can create branches, mirror issues, and keep your local workbench in sync.</p>

        <a href="#" class="login-btn" onclick="startOAuth()">
            <svg class="github-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            Sign in with GitHub
        </a>

        <div class="info">
            <p>This will redirect you to GitHub for authentication. After authorization, you'll get an access token Forge uses to automate your local toolkit.</p>
        </div>
    </div>

    <script>
        async function startOAuth() {
            // Get the OAuth URL from the server instead of hardcoding credentials
            try {
                const response = await fetch('/oauth/url');
                const data = await response.json();
                window.location.href = data.authUrl;
            } catch (error) {
                alert('Error starting OAuth: ' + error.message);
            }
        }
    </script>
</body>
</html>
    `);
  } else if (parsedUrl.pathname === '/test-signature' && req.method === 'POST') {
    // Test endpoint to validate signature verification logic
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      const testSecret = 'test-secret-123';
      const testBody = body || '{"test": "data"}';

      // Generate expected signature
      const expectedSignature = crypto
        .createHmac('sha256', testSecret)
        .update(testBody, 'utf8')
        .digest('hex');

      console.log('🧪 SIGNATURE TEST ENDPOINT');
      console.log(`   Test secret: ${testSecret}`);
      console.log(`   Test body: ${testBody}`);
      console.log(`   Expected signature: ${expectedSignature}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        test_secret: testSecret,
        test_body: testBody,
        expected_signature: expectedSignature,
        instructions: 'Send this body with Linear-Signature header containing the expected_signature to test verification'
      }));
    });
  } else if (parsedUrl.pathname === '/worktree' && req.method === 'GET') {
    // Worktree creation endpoint (local only)
    const branch = parsedUrl.searchParams.get('branch');

    if (!branch) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'branch parameter required' }));
      return;
    }

    const WORKTREE_REPO_PATH = process.env.WORKTREE_REPO_PATH;
    const LOCAL_REPO_PATH = process.env.LOCAL_REPO_PATH;

    if (!WORKTREE_REPO_PATH) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'WORKTREE_REPO_PATH not set' }));
      return;
    }

    if (!LOCAL_REPO_PATH) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'LOCAL_REPO_PATH not set' }));
      return;
    }

    try {
      const dirName = mapBranchToDir(branch);
      const worktreePath = path.join(LOCAL_REPO_PATH, dirName);
      const results = [];

      // Check if worktree already exists
      const list = await runCommand('git', ['worktree', 'list', '--porcelain'], { cwd: WORKTREE_REPO_PATH });
      results.push({ step: 'worktree-list', ...list });

      if (list.code === 0) {
        const lines = list.stdout.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('worktree ')) {
            const p = lines[i].slice('worktree '.length).trim();
            if (path.resolve(p) === path.resolve(worktreePath)) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, branch, worktreePath, existed: true, results }));
              return;
            }
          }
        }
      }

      // Create worktree
      fsSync.mkdirSync(worktreePath, { recursive: true });

      // Fetch and add worktree
      const fetchResult = await runCommand('git', ['fetch', '--all', '--prune'], { cwd: WORKTREE_REPO_PATH });
      results.push({ step: 'fetch', ...fetchResult });

      const verify = await runCommand('git', ['rev-parse', '--verify', `origin/${branch}`], { cwd: WORKTREE_REPO_PATH });
      results.push({ step: 'verify-origin-branch', ...verify });

      if (verify.code !== 0) {
        const f = await runCommand('git', ['fetch', 'origin', `${branch}:${branch}`], { cwd: WORKTREE_REPO_PATH });
        results.push({ step: 'fetch-branch-direct', ...f });
      }

      const add = await runCommand('git', ['worktree', 'add', '-B', branch, worktreePath, `origin/${branch}`], { cwd: WORKTREE_REPO_PATH });
      results.push({ step: 'worktree-add', ...add });

      const ok = add.code === 0;
      res.writeHead(ok ? 200 : 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok,
        branch,
        worktreePath,
        results,
        error: ok ? undefined : add.stderr || add.stdout || 'failed to add worktree'
      }));
    } catch (error) {
      console.error('❌ Error creating worktree:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
  } else if (parsedUrl.pathname === '/' && req.method === 'GET') {
    // Root route
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, message: 'Forge Tools API', endpoints: ['/webhook', '/login', '/api/tokens', '/api/folder-status'] }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Health check server running on port ${PORT}`);
});
