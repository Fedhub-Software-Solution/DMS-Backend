-- Page-level remarks per request (for Raise Request / Document Library editors)
-- Run with: node src/db/runMigrations.js

CREATE TABLE IF NOT EXISTS page_remarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  remark TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(request_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_page_remarks_request ON page_remarks(request_id);

