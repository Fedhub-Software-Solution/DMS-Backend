-- Normalize user roles to one canonical value per type (admin, preparator, reviewer, approver, requestor, manager).
-- Backend uses: role === 'admin', role.includes('preparator'), role.includes('reviewer'), role.includes('approver').

-- 1. admin (exact match for full-access checks)
UPDATE users SET role = 'admin'
WHERE LOWER(TRIM(role)) = 'admin' OR LOWER(TRIM(role)) = 'administrator' OR LOWER(role) LIKE 'admin%';

-- 2. reviewer (before manager so 'manager_reviewer' -> reviewer)
UPDATE users SET role = 'reviewer'
WHERE LOWER(role) LIKE '%reviewer%' AND role != 'admin';

-- 3. approver (before manager so 'manager_approver' -> approver)
UPDATE users SET role = 'approver'
WHERE LOWER(role) LIKE '%approver%' AND role != 'admin';

-- 4. preparator
UPDATE users SET role = 'preparator'
WHERE LOWER(role) LIKE '%preparator%' AND role != 'admin';

-- 5. requestor
UPDATE users SET role = 'requestor'
WHERE LOWER(role) LIKE '%requestor%' AND role != 'admin';

-- 6. manager (any remaining manager-like, not already reviewer/approver)
UPDATE users SET role = 'manager'
WHERE LOWER(role) LIKE '%manager%' AND role NOT IN ('admin', 'reviewer', 'approver');

-- Index for role-based queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
