-- Store Submit for Approval data: reviewer sequence, priority, comments
ALTER TABLE requests ADD COLUMN IF NOT EXISTS review_sequence JSONB;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS priority TEXT;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS submission_comments TEXT;
