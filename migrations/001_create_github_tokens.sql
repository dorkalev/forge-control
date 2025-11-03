-- Create GitHub tokens table to store OAuth tokens with metadata
CREATE TABLE IF NOT EXISTS github_tokens (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    access_token TEXT NOT NULL,
    scope VARCHAR(500),
    token_type VARCHAR(50) DEFAULT 'Bearer',

    -- GitHub user metadata
    github_id BIGINT UNIQUE,
    avatar_url TEXT,
    html_url TEXT,

    -- Token metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,

    -- OAuth flow metadata
    authorization_code VARCHAR(255),
    state VARCHAR(255),
    redirect_uri TEXT,

    -- Usage tracking
    usage_count INTEGER DEFAULT 0,
    last_ip_address INET,
    user_agent TEXT,

    CONSTRAINT unique_active_user UNIQUE (user_id, is_active) DEFERRABLE INITIALLY DEFERRED
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_github_tokens_user_id ON github_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_github_tokens_github_id ON github_tokens(github_id);
CREATE INDEX IF NOT EXISTS idx_github_tokens_active ON github_tokens(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_github_tokens_created_at ON github_tokens(created_at);
CREATE INDEX IF NOT EXISTS idx_github_tokens_last_used ON github_tokens(last_used_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_github_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS github_tokens_updated_at_trigger ON github_tokens;
CREATE TRIGGER github_tokens_updated_at_trigger
    BEFORE UPDATE ON github_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_github_tokens_updated_at();

-- Create function to deactivate old tokens when inserting new ones
CREATE OR REPLACE FUNCTION deactivate_old_tokens()
RETURNS TRIGGER AS $$
BEGIN
    -- Deactivate any existing active tokens for this user
    UPDATE github_tokens
    SET is_active = false, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = NEW.user_id AND is_active = true AND id != NEW.id;

    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to deactivate old tokens
DROP TRIGGER IF EXISTS deactivate_old_tokens_trigger ON github_tokens;
CREATE TRIGGER deactivate_old_tokens_trigger
    BEFORE INSERT ON github_tokens
    FOR EACH ROW
    EXECUTE FUNCTION deactivate_old_tokens();

-- Create view for active tokens only
CREATE OR REPLACE VIEW active_github_tokens AS
SELECT
    id,
    user_id,
    username,
    email,
    access_token,
    scope,
    token_type,
    github_id,
    avatar_url,
    html_url,
    created_at,
    updated_at,
    last_used_at,
    expires_at,
    usage_count,
    last_ip_address,
    user_agent
FROM github_tokens
WHERE is_active = true;

-- Insert migration record
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_migrations (version) VALUES ('001_create_github_tokens')
ON CONFLICT (version) DO NOTHING;