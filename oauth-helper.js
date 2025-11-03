import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const RENDER_DOMAIN = process.env.RENDER_DOMAIN || 'http://localhost:3000';
const REDIRECT_URI = `${RENDER_DOMAIN}/oauth/callback`;

class GitHubOAuthHelper {
  generateAuthUrl() {
    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'repo',
      state: Math.random().toString(36).substring(2)
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code) {
    try {
      console.log('🔄 Exchanging authorization code for access token...');

      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code: code,
          redirect_uri: REDIRECT_URI
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to exchange code for token: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`OAuth error: ${data.error_description || data.error}`);
      }

      console.log('✅ Access token obtained successfully!');
      return data.access_token;
    } catch (error) {
      console.error('❌ Error exchanging code for token:', error.message);
      throw error;
    }
  }

  async testToken(token) {
    console.log('🧪 Testing access token...');

    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error(`Token test failed: ${response.status} ${response.statusText}`);
    }

    const user = await response.json();
    console.log(`✅ Token works! Authenticated as: ${user.login}`);
    return user;
  }

  getAuthInstructions() {
    const authUrl = this.generateAuthUrl();

    console.log('\n🔐 GitHub OAuth Setup:');
    console.log('1. Open this URL in your browser:');
    console.log(`   ${authUrl}`);
    console.log('\n2. After authorization, you\'ll be redirected to your Render app');
    console.log('3. Copy the authorization code from the success page');
    console.log('4. Use the code with: node oauth-helper.js exchange <code>');

    return authUrl;
  }
}

// CLI interface
const helper = new GitHubOAuthHelper();
const command = process.argv[2];
const code = process.argv[3];

if (command === 'url') {
  helper.getAuthInstructions();
} else if (command === 'exchange' && code) {
  helper.exchangeCodeForToken(code)
    .then(token => {
      console.log('\n💾 Add this token to your .env file:');
      console.log(`GITHUB_TOKEN=${token}`);
    })
    .catch(error => {
      console.error('Failed to exchange code:', error.message);
      process.exit(1);
    });
} else {
  console.log('Usage:');
  console.log('  node oauth-helper.js url          # Get authorization URL');
  console.log('  node oauth-helper.js exchange <code>  # Exchange code for token');
}

export default GitHubOAuthHelper;