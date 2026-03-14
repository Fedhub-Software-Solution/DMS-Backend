const path = require('path');
const { pool } = require('../db/pool');
const fileStorage = require('./fileStorage');

function mapRow(r) {
  return {
    id: r.id,
    requestId: r.request_id,
    fileName: r.file_name,
    filePath: r.file_path,
    fileType: r.file_type,
    version: r.version,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function list(filters = {}) {
  const { request_id, status, department_id, created_by, assigned_to } = filters;
  let query = `
    SELECT doc.id, doc.request_id, doc.file_name, doc.file_path, doc.file_type, doc.version, doc.status,
           doc.created_by, doc.created_at, doc.updated_at
    FROM documents doc
    LEFT JOIN requests r ON doc.request_id = r.id
    WHERE 1=1
  `;
  const params = [];
  let n = 1;
  if (request_id) {
    query += ` AND doc.request_id = $${n++}`;
    params.push(request_id);
  }
  if (status) {
    query += ` AND doc.status = $${n++}`;
    params.push(status);
  }
  if (department_id) {
    query += ` AND r.department_id = $${n++}`;
    params.push(department_id);
  }
  // User-based: show documents only for requests the user created or is assigned to.
  if (created_by != null && assigned_to != null && created_by === assigned_to) {
    query += ` AND (r.created_by = $${n++} OR r.assigned_to = $${n})`;
    params.push(created_by, created_by);
    n += 1;
  } else {
    if (created_by) {
      query += ` AND r.created_by = $${n++}`;
      params.push(created_by);
    }
    if (assigned_to) {
      query += ` AND r.assigned_to = $${n++}`;
      params.push(assigned_to);
    }
  }
  query += ` ORDER BY doc.created_at DESC`;
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return result.rows.map(mapRow);
  } finally {
    client.release();
  }
}

async function getById(id) {
  const client = await pool.connect();
  try {
    const q = await client.query('SELECT * FROM documents WHERE id = $1', [id]);
    const row = q.rows[0];
    return row ? mapRow(row) : null;
  } finally {
    client.release();
  }
}

async function getFileInfo(id) {
  const client = await pool.connect();
  try {
    const q = await client.query('SELECT file_path, file_name, file_type FROM documents WHERE id = $1', [id]);
    return q.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Create document from uploaded file. file = multer result (path, originalname), request_id from body, userId from JWT.
 */
async function create(file, request_id, userId) {
  const relativePath = path.relative(fileStorage.basePath, file.path);
  const ext = path.extname(file.originalname).toLowerCase().slice(1);
  if (!['pdf', 'docx', 'xlsx'].includes(ext)) {
    const err = new Error('Allowed types: pdf, docx, xlsx');
    err.statusCode = 400;
    throw err;
  }
  const client = await pool.connect();
  try {
    const q = await client.query(
      `INSERT INTO documents (request_id, file_name, file_path, file_type, version, status, created_by)
       VALUES ($1, $2, $3, $4, 1, 'draft', $5)
       RETURNING *`,
      [request_id || null, file.originalname, relativePath, ext, userId]
    );
    const row = q.rows[0];
    return {
      id: row.id,
      requestId: row.request_id,
      fileName: row.file_name,
      filePath: row.file_path,
      fileType: row.file_type,
      version: row.version,
      status: row.status,
      createdAt: row.created_at,
    };
  } finally {
    client.release();
  }
}

async function updateStatus(id, status) {
  const client = await pool.connect();
  try {
    const q = await client.query(
      'UPDATE documents SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );
    const row = q.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      updatedAt: row.updated_at,
    };
  } finally {
    client.release();
  }
}

module.exports = { list, getById, getFileInfo, create, updateStatus, mapRow };
