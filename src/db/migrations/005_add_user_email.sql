-- Optional email for users (notifications for document upload/status change)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
