-- Delete all records from templates and requests (and dependent rows).
-- Run order: tables that reference requests (no CASCADE), then requests, then templates.

-- 1. Documents reference requests (no ON DELETE CASCADE)
DELETE FROM documents;

-- 2. Requests (cascades to form_data, page_remarks, request_workflow_* where CASCADE is set)
DELETE FROM requests;

-- 3. Templates
DELETE FROM templates;
