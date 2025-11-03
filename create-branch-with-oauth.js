import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import GitHubOAuthHelper from './oauth-helper.js';

dotenv.config();

const REPO_OWNER = process.env.GITHUB_REPO_OWNER || '';
const REPO_NAME = process.env.GITHUB_REPO_NAME || '';
const TOKEN_FILE = '.github-token';

class GitHubBranchCreatorWithOAuth {
  constructor() {
    this.accessToken = null;
    this.baseUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
  }

  get headers() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };
  }

  async loadOrObtainToken() {
    // Try to load token from .env first
    if (process.env.GITHUB_TOKEN) {
      console.log('🔑 Using token from .env file');
      this.accessToken = process.env.GITHUB_TOKEN;
      return this.accessToken;
    }

    // Try to load token from file
    try {
      const token = await fs.readFile(TOKEN_FILE, 'utf8');
      if (token.trim()) {
        console.log('🔑 Using saved token from file');
        this.accessToken = token.trim();
        return this.accessToken;
      }
    } catch (error) {
      // File doesn't exist or can't be read
    }

    // Need to get token via OAuth
    console.log('🔐 No token found. Please get one first:');
    const oauth = new GitHubOAuthHelper();
    oauth.getAuthInstructions();
    console.log('\nAfter getting the token, add it to your .env file and run this script again.');
    throw new Error('GitHub token required');
  }

  async getBranchSHA(branchName) {
    try {
      console.log(`🔍 Getting ${branchName} branch SHA...`);
      const response = await fetch(`${this.baseUrl}/git/refs/heads/${branchName}`, {
        headers: this.headers
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Branch "${branchName}" not found`);
        }
        throw new Error(`Failed to get ${branchName} branch: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`✅ ${branchName} branch SHA: ${data.object.sha}`);
      return data.object.sha;
    } catch (error) {
      console.error(`❌ Error getting ${branchName} branch SHA:`, error.message);
      throw error;
    }
  }

  async createDevBranchIfNotExists() {
    try {
      // Try to get dev branch first
      return await this.getBranchSHA('dev');
    } catch (error) {
      if (error.message.includes('not found')) {
        console.log('📝 Dev branch not found, creating it from main...');
        const mainSHA = await this.getBranchSHA('main');
        await this.createBranch('dev', mainSHA);
        return mainSHA;
      }
      throw error;
    }
  }

  async createBranch(newBranchName, fromSHA) {
    try {
      console.log(`🌿 Creating branch "${newBranchName}"...`);
      const response = await fetch(`${this.baseUrl}/git/refs`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          ref: `refs/heads/${newBranchName}`,
          sha: fromSHA
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to create branch: ${response.status} ${response.statusText} - ${errorData.message}`);
      }

      const data = await response.json();
      console.log(`✅ Branch "${newBranchName}" created successfully!`);
      console.log(`   URL: ${data.url}`);
      return data;
    } catch (error) {
      console.error('❌ Error creating branch:', error.message);
      throw error;
    }
  }

  async listBranches() {
    try {
      console.log('📋 Listing all branches...');
      const response = await fetch(`${this.baseUrl}/branches`, {
        headers: this.headers
      });

      if (!response.ok) {
        throw new Error(`Failed to list branches: ${response.status} ${response.statusText}`);
      }

      const branches = await response.json();
      console.log('Existing branches:');
      branches.forEach(branch => {
        console.log(`   - ${branch.name}`);
      });
      return branches;
    } catch (error) {
      console.error('❌ Error listing branches:', error.message);
      throw error;
    }
  }

  async run(newBranchName) {
    if (!newBranchName) {
      console.error('❌ Please provide a branch name');
      console.log('Usage: node create-branch-with-oauth.js <branch-name>');
      return;
    }

    try {
      // Get access token (OAuth if needed)
      await this.loadOrObtainToken();

      // List existing branches first
      await this.listBranches();

      // Get or create dev branch SHA
      const devSHA = await this.createDevBranchIfNotExists();

      // Create new branch from dev
      await this.createBranch(newBranchName, devSHA);

      console.log(`\n🎉 Successfully created branch "${newBranchName}" from dev!`);
      console.log(`You can now check it out locally with: git fetch && git checkout ${newBranchName}`);

    } catch (error) {
      console.error('\n💥 Script failed:', error.message);

      // If token error, remove saved token
      if (error.message.includes('401') || error.message.includes('403')) {
        try {
          await fs.unlink(TOKEN_FILE);
          console.log('🗑️ Removed invalid token, please run again');
        } catch (e) {
          // Token file doesn't exist
        }
      }

      process.exit(1);
    }
  }
}

// Get branch name from command line arguments
const branchName = process.argv[2];

if (!branchName) {
  console.log('Usage: node create-branch-with-oauth.js <branch-name>');
  console.log('Example: node create-branch-with-oauth.js feature/new-webhook');
  process.exit(1);
}

const creator = new GitHubBranchCreatorWithOAuth();
creator.run(branchName);