const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../db/pool');
const config = require('../config');

/**
 * Authenticate user by username and password. Returns { token, user } or throws.
 */
async function login(username, password) {
  const client = await pool.connect();
  let user;
  try {
    const r = await client.query(
      `SELECT id, username, password_hash, role, department_id, full_name
       FROM users WHERE username = $1`,
      [username]
    );
    user = r.rows[0];
  } finally {
    client.release();
  }
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    const err = new Error('Invalid username or password');
    err.statusCode = 401;
    throw err;
  }
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      departmentId: user.department_id,
      fullName: user.full_name,
    },
  };
}

/**
 * Get user profile by user id (from JWT). Returns user object or null if not found.
 */
async function getMe(userId) {
  const client = await pool.connect();
  let user;
  try {
    const r = await client.query(
      `SELECT id, username, role, department_id, full_name FROM users WHERE id = $1`,
      [userId]
    );
    user = r.rows[0];
  } finally {
    client.release();
  }
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    departmentId: user.department_id,
    fullName: user.full_name,
  };
}

/**
 * Refresh access token. Expects valid JWT payload with id. Returns { token, user } or throws.
 */
async function refresh(userId) {
  const user = await getMe(userId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
  return { token, user };
}

/**
 * Create a password reset token for the user (by username). Returns the raw token (caller may send by email).
 * Stores hashed token in password_reset_tokens with expiry (default 1 hour).
 */
async function forgotPassword(username) {
  const client = await pool.connect();
  let user;
  try {
    const r = await client.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
    user = r.rows[0];
  } finally {
    client.release();
  }
  if (!user) {
    // Do not reveal whether username exists
    return null;
  }
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  const client2 = await pool.connect();
  try {
    await client2.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );
  } finally {
    client2.release();
  }
  return { token: rawToken, userId: user.id, expiresAt };
}

/**
 * Reset password using token from forgot-password. Returns true on success. Throws if token invalid/expired.
 */
async function resetPassword(token, newPassword) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const client = await pool.connect();
  let row;
  try {
    const r = await client.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    row = r.rows[0];
    if (!row) {
      const err = new Error('Invalid or expired reset token');
      err.statusCode = 400;
      throw err;
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await client.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, row.user_id]
    );
    await client.query('DELETE FROM password_reset_tokens WHERE id = $1', [row.id]);
  } finally {
    client.release();
  }
  return true;
}

module.exports = { login, getMe, refresh, forgotPassword, resetPassword };
