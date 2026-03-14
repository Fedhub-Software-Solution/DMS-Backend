# User roles: single table vs separate table

## Current design: **one table** (`users` with `role` column)

- **Table:** `users` (id, username, password_hash, **role**, department_id, full_name, ...)
- **Role:** Stored as TEXT with CHECK constraint allowing only: `admin`, `preparator`, `reviewer`, `approver`, `requestor`, `manager`.

**Pros:**
- Simple: no join, one table.
- Easy to query and maintain.
- Fine for a fixed, small set of roles.

**Cons:**
- Adding a new role requires a DB migration (ALTER to change CHECK or add new value).
- No single “roles” list table for UI (e.g. role dropdown); app/seed defines the list.

**Verdict:** Correct and appropriate for this app. Migration `011_users_role_check.sql` ensures only these six values can be stored.

---

## Alternative: **separate `roles` table**

- **Tables:**  
  - `roles` (id UUID PK, name TEXT UNIQUE, description TEXT optional)  
  - `users` (..., **role_id** UUID REFERENCES roles(id))
- **Usage:** Join `users` with `roles` to get role name; auth returns `role: roleName` to the app as today.

**Pros:**
- Referential integrity: only valid role IDs.
- Single source of truth for role list; easy to add role metadata (e.g. display name, permissions).
- New roles can be added with an INSERT (and optional app/UI) without changing the `users` table.

**Cons:**
- One extra join wherever you need role name.
- Slightly more complex schema and migrations.

**When to use:** If you later need many roles, role-based permissions, or a UI to manage roles, migrating to a separate `roles` table is a good next step.

---

## Recommendation

- **Keep the current single-table design** with the CHECK constraint. It matches your six canonical roles and keeps the schema simple.
- **Consider a separate `roles` table** later if you add role management UI, per-role permissions, or a growing list of roles.
