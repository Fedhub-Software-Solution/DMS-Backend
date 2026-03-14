const bcrypt = require('bcrypt');
const { pool } = require('../db/pool');

const ALLOWED_ROLES = ['admin', 'preparator', 'reviewer', 'approver', 'requestor', 'manager'];

/**
 * List users for reviewer/assignee selection and User Management. Returns id, username, fullName, email, role, departmentId, departmentName.
 */
async function list() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT u.id, u.username, u.full_name, u.email, u.role, u.department_id,
              d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       ORDER BY d.name NULLS LAST, u.full_name, u.username`
    );
    return result.rows.map((r) => ({
      id: r.id,
      username: r.username,
      fullName: r.full_name,
      email: r.email,
      role: r.role,
      departmentId: r.department_id,
      departmentName: r.department_name,
    }));
  } finally {
    client.release();
  }
}

/**
 * Get a single user by id, including department name (used for authentication validation and audit logs).
 */
async function getById(id) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT u.id, u.username, u.full_name, u.email, u.role, u.department_id,
              d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = $1`,
      [id]
    );
    const r = result.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      username: r.username,
      fullName: r.full_name,
      email: r.email,
      role: r.role,
      departmentId: r.department_id,
      departmentName: r.department_name,
    };
  } finally {
    client.release();
  }
}

/**
 * Create a new user. Expects { username, password, full_name, email?, role, department_id? }.
 * Role must be one of: admin, preparator, reviewer, approver, requestor, manager.
 */
async function create({ username, password, full_name, email, role, department_id }) {
  if (!username || !password) {
    const err = new Error('Username and password are required');
    err.statusCode = 400;
    throw err;
  }
  if (!role || !ALLOWED_ROLES.includes(role)) {
    const err = new Error(`Role must be one of: ${ALLOWED_ROLES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
  const client = await pool.connect();
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const result = await client.query(
      `INSERT INTO users (username, password_hash, full_name, email, role, department_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, full_name, email, role, department_id`,
      [username.trim(), password_hash, full_name || null, email || null, role, department_id || null]
    );
    const row = result.rows[0];
    const deptResult = row?.department_id
      ? await client.query('SELECT name FROM departments WHERE id = $1', [row.department_id])
      : { rows: [] };
    const departmentName = deptResult.rows[0]?.name || null;
    return {
      id: row.id,
      username: row.username,
      fullName: row.full_name,
      email: row.email,
      role: row.role,
      departmentId: row.department_id,
      departmentName,
    };
  } finally {
    client.release();
  }
}

/**
 * Validate a user by login identifier (email OR username) and password.
 * Returns basic user info when valid, otherwise null.
 * This is used for secondary verification before critical actions (e.g. review/approve from Document Library).
 */
async function validateByIdentifierAndPassword(identifier, password) {
  if (!identifier || !password) return null;
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, username, full_name, email, password_hash
       FROM users
       WHERE email = $1 OR username = $1`,
      [identifier]
    );
    const row = result.rows[0];
    if (!row) return null;
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return null;
    return {
      id: row.id,
      username: row.username,
      fullName: row.full_name,
      email: row.email,
    };
  } finally {
    client.release();
  }
}

module.exports = { list, getById, create, validateByIdentifierAndPassword };
