import pg from 'pg';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

class DatabaseService {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close clients after 30 seconds of inactivity
      connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('💥 Unexpected database error:', err);
    });
  }

  async query(text, params = []) {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;

      if (process.env.NODE_ENV !== 'production') {
        console.log('🗃️  Query executed:', {
          text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
          duration: `${duration}ms`,
          rows: result.rowCount
        });
      }

      return result;
    } catch (error) {
      console.error('❌ Database query error:', {
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        error: error.message
      });
      throw error;
    }
  }

  async getClient() {
    return await this.pool.connect();
  }

  async close() {
    await this.pool.end();
    console.log('📤 Database pool closed');
  }

  // GitHub token management methods
  async storeGitHubToken({
    userId,
    username,
    email,
    accessToken,
    scope,
    tokenType = 'Bearer',
    githubId,
    avatarUrl,
    htmlUrl,
    authorizationCode,
    state,
    redirectUri,
    ipAddress,
    userAgent
  }) {
    const query = `
      INSERT INTO github_tokens (
        user_id, username, email, access_token, scope, token_type,
        github_id, avatar_url, html_url, authorization_code, state,
        redirect_uri, last_ip_address, user_agent, usage_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 0)
      RETURNING id, created_at
    `;

    const values = [
      userId, username, email, accessToken, scope, tokenType,
      githubId, avatarUrl, htmlUrl, authorizationCode, state,
      redirectUri, ipAddress, userAgent
    ];

    try {
      const result = await this.query(query, values);
      console.log(`✅ Stored GitHub token for user: ${username} (${userId})`);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Failed to store GitHub token:', error.message);
      throw error;
    }
  }

  async getActiveGitHubToken(userId) {
    const query = `
      SELECT
        id, user_id, username, email, access_token, scope, token_type,
        github_id, avatar_url, html_url, created_at, updated_at,
        last_used_at, usage_count
      FROM active_github_tokens
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;

    try {
      const result = await this.query(query, [userId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Failed to get active GitHub token:', error.message);
      throw error;
    }
  }

  async getLatestGitHubToken() {
    const query = `
      SELECT
        id, user_id, username, email, access_token, scope, token_type,
        github_id, avatar_url, html_url, created_at, updated_at,
        last_used_at, usage_count
      FROM github_tokens
      WHERE is_active = true
      ORDER BY created_at DESC
      LIMIT 1
    `;

    try {
      const result = await this.query(query);
      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Failed to get latest GitHub token:', error.message);
      return null; // Return null instead of throwing to avoid breaking the request
    }
  }

  async updateTokenUsage(tokenId, ipAddress = null) {
    const query = `
      UPDATE github_tokens
      SET
        usage_count = usage_count + 1,
        last_used_at = CURRENT_TIMESTAMP,
        last_ip_address = COALESCE($2, last_ip_address)
      WHERE id = $1
      RETURNING usage_count, last_used_at
    `;

    try {
      const result = await this.query(query, [tokenId, ipAddress]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Failed to update token usage:', error.message);
      throw error;
    }
  }

  async deactivateGitHubToken(userId, tokenId = null) {
    let query, values;

    if (tokenId) {
      query = 'UPDATE github_tokens SET is_active = false WHERE id = $1 AND user_id = $2';
      values = [tokenId, userId];
    } else {
      query = 'UPDATE github_tokens SET is_active = false WHERE user_id = $1 AND is_active = true';
      values = [userId];
    }

    try {
      const result = await this.query(query, values);
      console.log(`✅ Deactivated ${result.rowCount} GitHub token(s) for user: ${userId}`);
      return result.rowCount;
    } catch (error) {
      console.error('❌ Failed to deactivate GitHub token:', error.message);
      throw error;
    }
  }

  async getGitHubTokenStats() {
    const query = `
      SELECT
        COUNT(*) as total_tokens,
        COUNT(*) FILTER (WHERE is_active = true) as active_tokens,
        COUNT(DISTINCT user_id) as unique_users,
        AVG(usage_count) as avg_usage,
        MAX(created_at) as latest_token,
        MAX(last_used_at) as latest_usage
      FROM github_tokens
    `;

    try {
      const result = await this.query(query);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Failed to get GitHub token stats:', error.message);
      throw error;
    }
  }

  async getGitHubUserInfo(accessToken) {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SDLC-Tools/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const userInfo = await response.json();
      return {
        githubId: userInfo.id,
        username: userInfo.login,
        email: userInfo.email,
        avatarUrl: userInfo.avatar_url,
        htmlUrl: userInfo.html_url
      };
    } catch (error) {
      console.error('❌ Failed to get GitHub user info:', error.message);
      throw error;
    }
  }
}

// Create singleton instance
const db = new DatabaseService();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, closing database connections...');
  await db.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, closing database connections...');
  await db.close();
  process.exit(0);
});

export default db;