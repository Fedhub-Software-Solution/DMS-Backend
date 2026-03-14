-- Password reset tokens for forgot/reset password flow
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

-- S3 storage for templates (optional; when set, download via presigned URL)
ALTER TABLE templates ADD COLUMN IF NOT EXISTS s3_bucket TEXT;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS s3_key TEXT;
