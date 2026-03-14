-- Enforce only allowed role values (run after 010_normalize_user_roles.sql).
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check,
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'preparator', 'reviewer', 'approver', 'requestor', 'manager'));
