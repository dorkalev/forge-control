import fetch from 'node-fetch';
import db from './db.js';
import { simpleGit } from 'simple-git';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

class WebhookBranchCreator {
  constructor(options = {}) {
    // Default to current repo but allow override
    this.defaultOwner = options.owner || process.env.GITHUB_REPO_OWNER || '';
    this.defaultRepo = options.repo || process.env.GITHUB_REPO_NAME || '';
    this.githubApiUrl = 'https://api.github.com';
    this.defaultBranch = options.defaultBranch || process.env.DEFAULT_BASE_BRANCH || 'main';
    this.slackWebhookUrl = process.env.SLACK_BRANCHES_CHANNEL || '';
  }

  /**
   * Get base URL for GitHub API requests for a specific repo
   */
  getRepoBaseUrl(owner, repo) {
    return `${this.githubApiUrl}/repos/${owner}/${repo}`;
  }

  /**
   * Extract repository information from Linear issue
   */
  extractRepositoryInfo(issue) {
    try {
      // Pattern 1: Extract from Linear URL (organization name)
      if (issue.url) {
        const linearUrlPattern = /linear\.app\/([a-zA-Z0-9._-]+)\//;
        const linearMatch = issue.url.match(linearUrlPattern);

        if (linearMatch) {
          const orgName = linearMatch[1];
          console.log(`🏢 Extracted organization from Linear URL: ${orgName}`);

          // Map Linear organizations to GitHub repositories
          const repoMapping = this.getRepositoryMapping(orgName);
          console.log(`📍 Mapped ${orgName} to ${repoMapping.owner}/${repoMapping.repo}`);

          return repoMapping;
        }
      }

      // Pattern 2: Try to extract repository from issue description or title
      const text = `${issue.title || ''} ${issue.description || ''}`;

      // Pattern 2a: owner/repo format
      const repoPattern = /(?:^|\s)([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)(?:\s|$)/;
      const repoMatch = text.match(repoPattern);

      if (repoMatch) {
        console.log(`📝 Extracted repository from text: ${repoMatch[1]}/${repoMatch[2]}`);
        return {
          owner: repoMatch[1],
          repo: repoMatch[2]
        };
      }

      // Pattern 2b: GitHub URL
      const urlPattern = /github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)/;
      const urlMatch = text.match(urlPattern);

      if (urlMatch) {
        console.log(`🔗 Extracted repository from GitHub URL: ${urlMatch[1]}/${urlMatch[2]}`);
        return {
          owner: urlMatch[1],
          repo: urlMatch[2]
        };
      }

      // Default to configured repo
      console.log(`🔗 Using default repository: ${this.defaultOwner}/${this.defaultRepo}`);
      return {
        owner: this.defaultOwner,
        repo: this.defaultRepo
      };
    } catch (error) {
      console.error('❌ Error extracting repository info:', error.message);
      return {
        owner: this.defaultOwner,
        repo: this.defaultRepo
      };
    }
  }

  /**
   * Get repository mapping for Linear organization
   */
  getRepositoryMapping(linearOrg) {
    // Load mapping from environment variable or use default
    let orgMappings = {};

    if (process.env.ORG_REPO_MAPPING) {
      try {
        orgMappings = JSON.parse(process.env.ORG_REPO_MAPPING);
      } catch (error) {
        console.warn('⚠️ Failed to parse ORG_REPO_MAPPING from environment:', error.message);
      }
    }

    // Return mapped repository or fallback to default
    return orgMappings[linearOrg] || {
      owner: this.defaultOwner,
      repo: this.defaultRepo
    };
  }

  /**
   * Extract specific repository name from issue content
   */
  extractRepoFromContent(issue) {
    const text = `${issue.title || ''} ${issue.description || ''}`;

    // Look for common repository names in the content
    const repoKeywords = {
      'forge': /\b(forge|software.development|development.lifecycle)\b/i,
      'docs': /\b(docs|documentation|wiki)\b/i,
      'api': /\b(api|backend|server)\b/i,
      'frontend': /\b(frontend|ui|client|web)\b/i,
      'mobile': /\b(mobile|ios|android|app)\b/i
    };

    for (const [repoName, pattern] of Object.entries(repoKeywords)) {
      if (pattern.test(text)) {
        console.log(`📋 Detected repository type from content: ${repoName}`);
        return repoName;
      }
    }

    return null; // No specific repo detected
  }

  /**
   * Get a GitHub token for the user from the database
   */
  async getGitHubTokenForUser(username) {
    try {
      // For Forge agents, use configured fallback user
      const fallbackUser = process.env.FORGE_FALLBACK_GITHUB_USER || username;
      const lookupUser = username.toLowerCase().includes('forge') ? fallbackUser : username;

      if (lookupUser !== username) {
        console.log(`🔗 Forge agent detected: using ${lookupUser}'s GitHub token for ${username}`);
      }

      const token = await db.getActiveGitHubToken(lookupUser);
      if (!token) {
        console.log(`⚠️ No active GitHub token found for user: ${lookupUser}`);
        return null;
      }

      console.log(`✅ Using GitHub token from: ${lookupUser} (for ${username})`);
      return token.access_token;
    } catch (error) {
      console.error('❌ Error getting GitHub token:', error.message);
      return null;
    }
  }

  /**
   * Get headers for GitHub API requests
   */
  getHeaders(accessToken) {
    return {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Forge-Tools/1.0'
    };
  }

  /**
   * Get the SHA of the default branch
   */
  async getDefaultBranchSHA(accessToken, owner, repo, branch = null) {
    try {
      const branchName = branch || this.defaultBranch;
      const baseUrl = this.getRepoBaseUrl(owner, repo);

      const response = await fetch(`${baseUrl}/git/refs/heads/${branchName}`, {
        headers: this.getHeaders(accessToken)
      });

      if (!response.ok) {
        throw new Error(`Failed to get ${branchName} branch: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`📍 Retrieved ${branchName} branch SHA: ${data.object.sha.substring(0, 8)}`);
      return data.object.sha;
    } catch (error) {
      console.error(`❌ Error getting ${branch || this.defaultBranch} branch SHA:`, error.message);
      throw error;
    }
  }

  /**
   * Create a new branch on GitHub
   */
  async createBranch(accessToken, owner, repo, branchName, fromSHA) {
    try {
      console.log(`🌿 Creating branch "${branchName}" in ${owner}/${repo}...`);
      const baseUrl = this.getRepoBaseUrl(owner, repo);

      const response = await fetch(`${baseUrl}/git/refs`, {
        method: 'POST',
        headers: this.getHeaders(accessToken),
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: fromSHA
        })
      });

      if (!response.ok) {
        const errorData = await response.json();

        // Branch already exists
        if (response.status === 422 && errorData.message.includes('already exists')) {
          console.log(`ℹ️ Branch "${branchName}" already exists in ${owner}/${repo}`);
          return { exists: true, branchName, owner, repo };
        }

        throw new Error(`Failed to create branch: ${response.status} ${response.statusText} - ${errorData.message}`);
      }

      const data = await response.json();
      console.log(`✅ Branch "${branchName}" created successfully in ${owner}/${repo}!`);
      return { created: true, branchName, owner, repo, data };
    } catch (error) {
      console.error('❌ Error creating branch:', error.message);
      throw error;
    }
  }

  /**
   * Format branch name from issue ID and title
   */
  formatBranchName(issueId, issueTitle) {
    // Clean the title: remove special characters, convert to lowercase, replace spaces with hyphens
    const cleanTitle = issueTitle
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple consecutive hyphens with single hyphen
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
      .substring(0, 50); // Limit length

    return `${issueId}-${cleanTitle}`;
  }

  /**
   * Create a pull request on GitHub
   */
  async createPullRequest(accessToken, owner, repo, branchName, issue) {
    try {
      console.log(`🔄 Creating pull request for branch "${branchName}" in ${owner}/${repo}...`);
      const baseUrl = this.getRepoBaseUrl(owner, repo);

      const title = `${issue.identifier || issue.id}: ${issue.title}`;
      const body = this.generatePRDescription(issue);

      const response = await fetch(`${baseUrl}/pulls`, {
        method: 'POST',
        headers: this.getHeaders(accessToken),
        body: JSON.stringify({
          title: title,
          head: branchName,
          base: this.defaultBranch,
          body: body,
          draft: true
        })
      });

      if (!response.ok) {
        const errorData = await response.json();

        // PR might already exist
        if (response.status === 422) {
          console.log(`ℹ️ Pull request for branch "${branchName}" might already exist in ${owner}/${repo}`);
          try {
            const existing = await this.findExistingPR(accessToken, owner, repo, branchName);
            if (existing) {
              console.log(`🔗 Found existing PR: ${existing.html_url}`);
              return { exists: true, branchName, owner, repo, prNumber: existing.number, url: existing.html_url };
            }
          } catch (lookupErr) {
            console.log(`⚠️ Could not locate existing PR for ${branchName}: ${lookupErr.message}`);
          }
          return { exists: true, branchName, owner, repo };
        }

        throw new Error(`Failed to create PR: ${response.status} ${response.statusText} - ${errorData.message}`);
      }

      const data = await response.json();
      console.log(`✅ Pull request created: ${data.html_url}`);
      return { created: true, prNumber: data.number, url: data.html_url, owner, repo, data };
    } catch (error) {
      console.error('❌ Error creating pull request:', error.message);
      throw error;
    }
  }

  /**
   * Try to find an existing PR for a branch
   */
  async findExistingPR(accessToken, owner, repo, branchName) {
    const baseUrl = this.getRepoBaseUrl(owner, repo);
    const response = await fetch(`${baseUrl}/pulls?head=${owner}:${encodeURIComponent(branchName)}&state=all`, {
      headers: this.getHeaders(accessToken)
    });
    if (!response.ok) {
      throw new Error(`Failed to search PRs: ${response.status} ${response.statusText}`);
    }
    const prs = await response.json();
    return Array.isArray(prs) && prs.length > 0 ? prs[0] : null;
  }

  /**
   * Create a file with issue content in the branch
   */
  async createIssueFile(accessToken, owner, repo, branchName, issue) {
    try {
      console.log(`📝 Creating issue file for "${issue.identifier || issue.id}" in branch "${branchName}"...`);
      const baseUrl = this.getRepoBaseUrl(owner, repo);

      // Generate filename from issue identifier
      const issueId = issue.identifier || issue.id || 'unknown';
      const filename = `issues/${issueId}.md`;

      // Generate file content
      const content = this.generateIssueFileContent(issue);
      const encodedContent = Buffer.from(content).toString('base64');

      // Check if file exists and get its SHA
      let sha = null;
      try {
        const checkResponse = await fetch(`${baseUrl}/contents/${filename}?ref=${branchName}`, {
          headers: this.getHeaders(accessToken)
        });

        if (checkResponse.ok) {
          const existingFile = await checkResponse.json();
          sha = existingFile.sha;
          console.log(`📄 File exists, updating with SHA: ${sha.substring(0, 8)}`);
        }
      } catch (checkError) {
        // File doesn't exist, that's fine
        console.log(`📄 File doesn't exist, creating new file`);
      }

      // Create or update the file
      const requestBody = {
        message: sha ? `Update issue file for ${issueId}: ${issue.title}` : `Add issue file for ${issueId}: ${issue.title}`,
        content: encodedContent,
        branch: branchName
      };

      if (sha) {
        requestBody.sha = sha;
      }

      const response = await fetch(`${baseUrl}/contents/${filename}`, {
        method: 'PUT',
        headers: this.getHeaders(accessToken),
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to create issue file: ${response.status} ${response.statusText} - ${errorData.message}`);
      }

      const data = await response.json();
      console.log(`✅ Issue file ${sha ? 'updated' : 'created'}: ${filename} in branch "${branchName}"`);
      return { [sha ? 'updated' : 'created']: true, filename, branchName, data };
    } catch (error) {
      console.error('❌ Error creating issue file:', error.message);
      throw error;
    }
  }

  /**
   * Generate content for the issue file
   */
  generateIssueFileContent(issue) {
    const sections = [];

    // Title
    sections.push(`# ${issue.title || 'Untitled Issue'}\n`);

    // Description
    if (issue.description) {
      sections.push('## Description\n');
      sections.push(issue.description);
    }

    return sections.join('\n');
  }

  /**
   * Clone repository to temporary directory
   */
  async cloneRepository(owner, repo, accessToken) {
    try {
      const tempDir = path.join(os.tmpdir(), `repo-${repo}-${Date.now()}`);
      const repoUrl = `https://x-access-token:${accessToken}@github.com/${owner}/${repo}.git`;

      console.log(`📥 Cloning repository ${owner}/${repo} to ${tempDir}...`);

      const git = simpleGit();
      await git.clone(repoUrl, tempDir, ['--depth', '1']);

      console.log(`✅ Repository cloned successfully to ${tempDir}`);
      return tempDir;
    } catch (error) {
      console.error('❌ Error cloning repository:', error.message);
      throw error;
    }
  }

  /**
   * Execute Claude Code CLI with implementation planning prompt
   */
  async executeClaudeCode(tempDir, issue) {
    return new Promise((resolve, reject) => {
      console.log(`🤖 Running Claude Code analysis for issue ${issue.identifier}...`);

      const prompt = `Analyze this codebase and create a detailed implementation plan for the following Linear issue:

**Issue:** ${issue.identifier || issue.id}
**Title:** ${issue.title}
**Description:** ${issue.description || 'No description provided'}
**Priority:** ${issue.priority || 'Not specified'}

Please provide:
1. **Overview** - Brief summary of what needs to be implemented
2. **Files to Modify** - Specific files that need changes with reasoning
3. **New Files** - Any new files that need to be created
4. **Implementation Steps** - Step-by-step implementation plan
5. **Key Considerations** - Important technical considerations, dependencies, testing strategy
6. **Estimated Complexity** - Time/complexity estimate

Focus on being practical and specific to this codebase structure and existing patterns.`;

      const claude = spawn('claude', ['--print'], {
        cwd: tempDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY
        }
      });

      let output = '';
      let errorOutput = '';

      claude.stdout.on('data', (data) => {
        output += data.toString();
      });

      claude.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      claude.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ Claude Code analysis completed successfully`);
          resolve(output.trim());
        } else {
          console.error(`❌ Claude Code exited with code ${code}`);
          console.error(`Error output: ${errorOutput}`);
          reject(new Error(`Claude Code failed with exit code ${code}: ${errorOutput}`));
        }
      });

      claude.on('error', (error) => {
        console.error('❌ Error spawning Claude Code:', error.message);
        reject(error);
      });

      // Send the prompt to Claude Code
      claude.stdin.write(prompt);
      claude.stdin.end();
    });
  }

  /**
   * Post a comment to Linear issue
   */
  async postLinearComment(issueId, comment) {
    try {
      console.log(`💬 Posting implementation plan comment to Linear issue ${issueId}...`);

      const linearApiUrl = 'https://api.linear.app/graphql';
      const mutation = `
        mutation CommentCreate($input: CommentCreateInput!) {
          commentCreate(input: $input) {
            success
            comment {
              id
              body
            }
          }
        }
      `;

      const variables = {
        input: {
          issueId: issueId,
          body: `## 🤖 AI Implementation Plan

${comment}

---
*This implementation plan was automatically generated by Claude Code analysis of the repository structure and requirements.*`
        }
      };

      const response = await fetch(linearApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.LINEAR_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: mutation,
          variables: variables
        })
      });

      if (!response.ok) {
        throw new Error(`Linear API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.errors) {
        throw new Error(`Linear API errors: ${JSON.stringify(data.errors)}`);
      }

      if (data.data?.commentCreate?.success) {
        console.log(`✅ Implementation plan posted to Linear issue ${issueId}`);
        return data.data.commentCreate.comment;
      } else {
        throw new Error('Failed to create Linear comment');
      }
    } catch (error) {
      console.error('❌ Error posting Linear comment:', error.message);
      throw error;
    }
  }

  /**
   * Generate implementation plan using Claude Code
   */
  async generateImplementationPlan(accessToken, owner, repo, issue) {
    let tempDir = null;

    try {
      console.log(`🎯 ============ GENERATING IMPLEMENTATION PLAN ============`);

      // Clone repository
      tempDir = await this.cloneRepository(owner, repo, accessToken);

      // Run Claude Code analysis
      const implementationPlan = await this.executeClaudeCode(tempDir, issue);

      // Post plan to Linear
      await this.postLinearComment(issue.id, implementationPlan);

      console.log(`🎉 Implementation plan generated and posted successfully!`);
      return { success: true, plan: implementationPlan };

    } catch (error) {
      console.error('❌ Error generating implementation plan:', error.message);
      return { success: false, error: error.message };
    } finally {
      // Cleanup temporary directory
      if (tempDir) {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
          console.log(`🧹 Cleaned up temporary directory: ${tempDir}`);
        } catch (cleanupError) {
          console.error('⚠️ Error cleaning up temporary directory:', cleanupError.message);
        }
      }
    }
  }

  /**
   * Generate PR description from Linear issue data
   */
  generatePRDescription(issue) {
    const sections = [];

    sections.push('## 🔗 Linear Issue');
    sections.push(`**Issue:** ${issue.identifier || issue.id || 'N/A'}`);
    sections.push(`**Title:** ${issue.title || 'Untitled'}`);

    if (issue.url) {
      sections.push(`**Link:** ${issue.url}`);
    }

    if (issue.description) {
      sections.push('\n## 📝 Description');
      sections.push(issue.description);
    }

    if (issue.priority) {
      sections.push(`\n**Priority:** ${issue.priority}`);
    }

    if (issue.labels && issue.labels.length > 0) {
      const labelNames = issue.labels.map(label => label.name || label).join(', ');
      sections.push(`\n**Labels:** ${labelNames}`);
    }

    sections.push('\n## 🎯 Tasks');
    sections.push('- [ ] Implement solution');
    sections.push('- [ ] Add tests');
    sections.push('- [ ] Update documentation');
    sections.push('- [ ] Review and approve');

    sections.push('\n## 🤖 Automation');
    sections.push('This pull request was automatically created by the Forge webhook system when the Linear issue was assigned to a Forge agent.');

    return sections.join('\n');
  }

  /**
   * Send message to Slack webhook
   */
  async postToSlack(payload) {
    try {
      if (!this.slackWebhookUrl) {
        console.log('⚠️ SLACK_BRANCHES_CHANNEL not set; skipping Slack notification');
        return { skipped: true };
      }
      const res = await fetch(this.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Slack webhook failed: ${res.status} ${res.statusText} ${text}`);
      }
      console.log('✅ Posted Slack notification');
      return { ok: true };
    } catch (err) {
      console.error('❌ Error posting to Slack:', err.message);
      return { ok: false, error: err.message };
    }
  }

  truncate(text, max = 700) {
    if (!text) return '';
    if (text.length <= max) return text;
    return text.slice(0, max - 1) + '…';
  }

  buildBranchSlackPayload({ issue, repoInfo, branchName }) {
    const issueId = issue.identifier || issue.id || 'Unknown';
    const issueTitle = issue.title || 'Untitled';
    const issueUrl = issue.url || null;
    const branchUrl = `https://github.com/${repoInfo.owner}/${repoInfo.repo}/tree/${encodeURIComponent(branchName)}`;
    const description = this.truncate(issue.description || '');

    const text = `Branch ${repoInfo.owner}/${repoInfo.repo}:${branchName} for ${issueId} - ${issueTitle}`;

    const actionBase = process.env.LOCAL_ACTION_URL_BASE || 'http://localhost:4665';
    const agentToken = process.env.LOCAL_AGENT_TOKEN || '';
    const tokenParam = agentToken ? `&token=${encodeURIComponent(agentToken)}` : '';
    const worktreeUrl = actionBase
      ? `${actionBase.replace(/\/$/, '')}/worktree?branch=${encodeURIComponent(branchName)}${tokenParam}`
      : '';

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `🌿 Branch: ${branchName}` } },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: `*Repository*\n${repoInfo.owner}/${repoInfo.repo}` },
        { type: 'mrkdwn', text: `*Issue*\n${issueId}` }
      ] },
      { type: 'section', text: { type: 'mrkdwn', text: `*Title:* ${issueTitle}` } },
      ...(issueUrl ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Linear:* <${issueUrl}|Open Issue>` } }] : []),
      { type: 'section', text: { type: 'mrkdwn', text: `*Branch:* <${branchUrl}|${repoInfo.owner}/${repoInfo.repo}:${branchName}>` } },
      ...(description ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Description*\n${description}` } }] : []),
      ...(worktreeUrl ? [{
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Create Worktree' }, url: worktreeUrl }
        ]
      }] : [])
    ];

    return { text, blocks };
  }

  buildPRSlackPayload({ issue, repoInfo, branchName, prUrl }) {
    const issueId = issue.identifier || issue.id || 'Unknown';
    const issueTitle = issue.title || 'Untitled';
    const issueUrl = issue.url || null;
    const branchUrl = `https://github.com/${repoInfo.owner}/${repoInfo.repo}/tree/${encodeURIComponent(branchName)}`;

    const text = `PR for ${repoInfo.owner}/${repoInfo.repo}:${branchName} — ${issueId} - ${issueTitle}`;

    const actionBase = process.env.LOCAL_ACTION_URL_BASE || 'http://localhost:4665';
    const agentToken = process.env.LOCAL_AGENT_TOKEN || '';
    const tokenParam = agentToken ? `&token=${encodeURIComponent(agentToken)}` : '';
    const worktreeUrl = actionBase
      ? `${actionBase.replace(/\/$/, '')}/worktree?branch=${encodeURIComponent(branchName)}${tokenParam}`
      : '';
    const openPrUrl = actionBase && prUrl
      ? `${actionBase.replace(/\/$/, '')}/open?url=${encodeURIComponent(prUrl)}${tokenParam}`
      : '';

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `🔀 Pull Request: ${branchName}` } },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: `*Repository*\n${repoInfo.owner}/${repoInfo.repo}` },
        { type: 'mrkdwn', text: `*Issue*\n${issueId}` }
      ] },
      { type: 'section', text: { type: 'mrkdwn', text: `*Title:* ${issueTitle}` } },
      ...(issueUrl ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Linear:* <${issueUrl}|Open Issue>` } }] : []),
      { type: 'section', text: { type: 'mrkdwn', text: `*Branch:* <${branchUrl}|${repoInfo.owner}/${repoInfo.repo}:${branchName}>` } },
      ...(prUrl ? [{ type: 'section', text: { type: 'mrkdwn', text: `*PR:* <${prUrl}|Open Pull Request>` } }] : []),
      ...((worktreeUrl || openPrUrl) ? [{
        type: 'actions',
        elements: [
          ...(worktreeUrl ? [{ type: 'button', text: { type: 'plain_text', text: 'Create Worktree' }, url: worktreeUrl }] : []),
          ...(openPrUrl ? [{ type: 'button', text: { type: 'plain_text', text: 'Open PR in Browser' }, url: openPrUrl }] : [])
        ]
      }] : [])
    ];

    return { text, blocks };
  }

  /**
   * Process Linear webhook for assignee changes
   */
  async processLinearAssigneeWebhook(webhookData, assigneeUsername) {
    try {
      console.log(`🚀 ============ PROCESSING FORGE WEBHOOK ============`);
      console.log(`🎯 Processing assignee webhook for user: ${assigneeUsername}`);
      console.log(`📋 Issue: ${webhookData.data?.identifier || 'Unknown'} - "${webhookData.data?.title || 'No title'}"`);

      // Get GitHub token for the assignee
      console.log(`🔑 Looking up GitHub token for user: ${assigneeUsername}`);
      const accessToken = await this.getGitHubTokenForUser(assigneeUsername);
      if (!accessToken) {
        console.log(`❌ WORKFLOW STOPPED: No GitHub token for user ${assigneeUsername}`);
        return { success: false, reason: 'No GitHub token found' };
      }
      console.log(`✅ GitHub token found for user: ${assigneeUsername}`);

      // Extract issue information from webhook
      const issue = webhookData.data || webhookData;
      if (!issue) {
        console.log('❌ WORKFLOW STOPPED: No issue data found in webhook');
        return { success: false, reason: 'No issue data in webhook' };
      }

      const issueId = issue.identifier || issue.id;
      const issueTitle = issue.title;

      if (!issueId || !issueTitle) {
        console.log('❌ WORKFLOW STOPPED: Missing issue ID or title in webhook data');
        console.log(`   Issue ID: ${issueId || 'missing'}`);
        console.log(`   Issue Title: ${issueTitle || 'missing'}`);
        return { success: false, reason: 'Missing issue ID or title' };
      }

      // Extract repository information
      console.log(`🔍 Extracting repository information from issue...`);
      const repoInfo = this.extractRepositoryInfo(issue);
      console.log(`🔗 Target repository: ${repoInfo.owner}/${repoInfo.repo}`);

      // Format branch name
      const branchName = this.formatBranchName(issueId, issueTitle);
      console.log(`📝 Generated branch name: ${branchName}`);

      // Get default branch SHA
      console.log(`📍 Getting ${this.defaultBranch} branch SHA for ${repoInfo.owner}/${repoInfo.repo}...`);
      const defaultSHA = await this.getDefaultBranchSHA(accessToken, repoInfo.owner, repoInfo.repo);

      // Create branch
      console.log(`🌿 ============ CREATING BRANCH ============`);
      const branchResult = await this.createBranch(accessToken, repoInfo.owner, repoInfo.repo, branchName, defaultSHA);
      console.log(`🌿 Branch creation result:`, branchResult);

      // Create issue file and PR if branch was created or already exists
      let fileResult = null;
      let prResult = null;
      let planResult = null;

      if (branchResult.created || branchResult.exists) {
        // Post Slack notification for branch creation/existence
        try {
          const payload = this.buildBranchSlackPayload({ issue, repoInfo, branchName });
          await this.postToSlack(payload);
        } catch (slackErr) {
          console.error('⚠️ Failed to post branch Slack notification:', slackErr.message);
        }

        // Create file with issue content
        console.log(`📝 ============ CREATING ISSUE FILE ============`);
        try {
          fileResult = await this.createIssueFile(accessToken, repoInfo.owner, repoInfo.repo, branchName, issue);
          console.log(`📝 File creation result:`, fileResult);
        } catch (fileError) {
          console.error('⚠️ Failed to create issue file:', fileError.message);
          fileResult = { error: fileError.message };
        }

        // Generate implementation plan using Claude Code
        if (process.env.ANTHROPIC_API_KEY && process.env.LINEAR_API_TOKEN) {
          try {
            planResult = await this.generateImplementationPlan(accessToken, repoInfo.owner, repoInfo.repo, issue);
            console.log(`🎯 Implementation plan result:`, { success: planResult.success });
          } catch (planError) {
            console.error('⚠️ Failed to generate implementation plan:', planError.message);
            planResult = { error: planError.message };
          }
        } else {
          console.log('⚠️ Skipping implementation plan generation - missing ANTHROPIC_API_KEY or LINEAR_API_TOKEN');
        }

        // Check for existing PR before creating
        console.log(`🔍 ============ CHECKING FOR EXISTING PR ============`);
        try {
          const existingPR = await this.findExistingPR(accessToken, repoInfo.owner, repoInfo.repo, branchName);
          if (existingPR) {
            console.log(`✅ PR already exists: ${existingPR.html_url}`);
            prResult = { exists: true, branchName, owner: repoInfo.owner, repo: repoInfo.repo, prNumber: existingPR.number, url: existingPR.html_url };
          } else {
            // Create pull request after file is created
            console.log(`🔄 ============ CREATING PULL REQUEST ============`);
            try {
              prResult = await this.createPullRequest(accessToken, repoInfo.owner, repoInfo.repo, branchName, issue);
              console.log(`🔄 PR creation result:`, prResult);
            } catch (prError) {
              console.error('⚠️ Failed to create PR:', prError.message);
              prResult = { error: prError.message };
            }
          }
        } catch (checkError) {
          console.error('⚠️ Failed to check for existing PR:', checkError.message);
          // Continue with PR creation attempt
          console.log(`🔄 ============ CREATING PULL REQUEST ============`);
          try {
            prResult = await this.createPullRequest(accessToken, repoInfo.owner, repoInfo.repo, branchName, issue);
            console.log(`🔄 PR creation result:`, prResult);
          } catch (prError) {
            console.error('⚠️ Failed to create PR:', prError.message);
            prResult = { error: prError.message };
          }
        }

        // Post Slack notification for PR creation/existence/attempt
        try {
          const prUrl = prResult?.url || undefined;
          const payload = this.buildPRSlackPayload({ issue, repoInfo, branchName, prUrl });
          await this.postToSlack(payload);
        } catch (slackErr) {
          console.error('⚠️ Failed to post PR Slack notification:', slackErr.message);
        }
      } else {
        console.log(`⚠️ Skipping file and PR creation - branch was not created successfully`);
      }

      // Update token usage
      console.log(`📊 Updating token usage statistics...`);
      const tokenData = await db.getActiveGitHubToken(assigneeUsername);
      if (tokenData) {
        await db.updateTokenUsage(tokenData.id);
        console.log(`✅ Token usage updated for ${assigneeUsername}`);
      }

      const result = {
        success: true,
        branchName,
        issueId,
        issueTitle,
        assignee: assigneeUsername,
        repository: repoInfo,
        branch: branchResult,
        implementationPlan: planResult,
        pullRequest: prResult
      };

      console.log(`🎉 ============ WEBHOOK PROCESSING COMPLETE ============`);
      console.log(`📋 Final result:`, {
        success: result.success,
        branch: result.branch?.created ? 'created' : result.branch?.exists ? 'exists' : 'failed',
        pr: result.pullRequest?.created ? 'created' : result.pullRequest?.exists ? 'exists' : result.pullRequest?.error ? 'error' : 'none'
      });

      return result;

    } catch (error) {
      console.error('💥 ============ WEBHOOK PROCESSING FAILED ============');
      console.error('❌ Error processing assignee webhook:', error.message);
      console.error('📋 Stack trace:', error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if a webhook payload indicates "forge" was added as an assignee or delegate
   */
  isForgeAssigneeEvent(webhookData) {
    try {
      console.log('🔍 Checking for Forge assignee/delegate in webhook...');

      // Check various possible structures for Linear webhooks
      const data = webhookData.data || webhookData;
      const action = webhookData.action || webhookData.type;
      const updatedFrom = webhookData.updatedFrom || {};

      console.log(`📋 Webhook action: ${action}`);
      console.log(`👤 Current assignee: ${data?.assignee?.name || 'none'} (ID: ${data?.assignee?.id || 'none'})`);
      console.log(`🎯 Current delegate: ${data?.delegate?.name || 'none'} (ID: ${data?.delegate?.id || 'none'})`);
      console.log(`🔄 Previous assignee ID: ${updatedFrom?.assigneeId || 'none'}`);
      console.log(`🔄 Previous delegate ID: ${updatedFrom?.delegateId || 'none'}`);

      // Helper function to check if a user is Forge
      const isForgeUser = (user) => {
        if (!user) return false;
        const userName = user.name || user.displayName || user.username || user.email || '';
        return userName.toLowerCase().includes('forge');
      };

      const assignee = data?.assignee;
      const delegate = data?.delegate;

      // For create events, check if Forge is the initial assignee/delegate
      if (action === 'create' || action === 'created') {
        if (assignee && isForgeUser(assignee)) {
          const assigneeName = assignee.name || assignee.displayName || assignee.username || assignee.email;
          console.log(`✅ Forge assignee on new issue: ${assigneeName}`);
          return { isForgeEvent: true, assigneeUsername: assigneeName, role: 'assignee' };
        }

        if (delegate && isForgeUser(delegate)) {
          const delegateName = delegate.name || delegate.displayName || delegate.username || delegate.email;
          console.log(`✅ Forge delegate on new issue: ${delegateName}`);
          return { isForgeEvent: true, assigneeUsername: delegateName, role: 'delegate' };
        }
      }

      // For update events, ONLY trigger if assignee/delegate actually changed TO Forge
      if (action === 'update' || action === 'updated') {
        const currentAssigneeId = assignee?.id;
        const previousAssigneeId = updatedFrom?.assigneeId;
        const currentDelegateId = delegate?.id;
        const previousDelegateId = updatedFrom?.delegateId;

        // Check if assignee ID changed AND new assignee is Forge
        if (currentAssigneeId && currentAssigneeId !== previousAssigneeId && isForgeUser(assignee)) {
          const assigneeName = assignee.name || assignee.displayName || assignee.username || assignee.email;
          console.log(`✅ Forge newly assigned (assignee changed from ${previousAssigneeId || 'none'} to ${currentAssigneeId}): ${assigneeName}`);
          return { isForgeEvent: true, assigneeUsername: assigneeName, role: 'assignee' };
        }

        // Check if delegate ID changed AND new delegate is Forge
        if (currentDelegateId && currentDelegateId !== previousDelegateId && isForgeUser(delegate)) {
          const delegateName = delegate.name || delegate.displayName || delegate.username || delegate.email;
          console.log(`✅ Forge newly delegated (delegate changed from ${previousDelegateId || 'none'} to ${currentDelegateId}): ${delegateName}`);
          return { isForgeEvent: true, assigneeUsername: delegateName, role: 'delegate' };
        }

        // If we reach here, it's an update event but assignee/delegate didn't change to Forge
        if (isForgeUser(assignee) || isForgeUser(delegate)) {
          console.log(`ℹ️ Forge is assigned but this is not a new assignment (likely title/description update) - skipping branch creation`);
        }
      }

      console.log('❌ No new Forge assignment detected');
      return { isForgeEvent: false };
    } catch (error) {
      console.error('❌ Error checking Forge assignee event:', error.message);
      return { isForgeEvent: false };
    }
  }
}

export default WebhookBranchCreator;
