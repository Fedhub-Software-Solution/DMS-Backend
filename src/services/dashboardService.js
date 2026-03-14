const { pool } = require('../db/pool');

function mapRequestRow(row) {
  return {
    id: row.id,
    templateId: row.template_id,
    requestId: row.request_id,
    title: row.title,
    departmentId: row.department_id,
    departmentName: row.department_name,
    status: row.status,
    createdBy: row.created_by,
    assignedTo: row.assigned_to,
    assignedToName: row.assigned_to_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    templateFileName: row.template_file_name,
    fileSize: row.template_file_size != null ? String(row.template_file_size) : null,
  };
}

function mapTemplateRow(r) {
  return {
    id: r.id,
    fileName: r.file_name,
    filePath: r.file_path,
    fileSize: String(r.file_size || 0),
    department: r.department_id,
    departmentName: r.department_name,
    status: r.status,
    uploadDate: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function getRequestCountsByStatus(filters = {}) {
  const { department_id, assigned_to, created_by, days } = filters;
  let query = `
    SELECT status, COUNT(*)::int AS count
    FROM requests
    WHERE 1=1
  `;
  const params = [];
  let n = 1;
  if (department_id) {
    query += ` AND department_id = $${n++}`;
    params.push(department_id);
  }
  if (assigned_to) {
    query += ` AND assigned_to = $${n++}`;
    params.push(assigned_to);
  }
  if (created_by) {
    query += ` AND created_by = $${n++}`;
    params.push(created_by);
  }
  if (days != null && days > 0) {
    query += ` AND created_at >= NOW() - INTERVAL '1 day' * $${n++}`;
    params.push(Number(days));
  }
  query += ` GROUP BY status`;
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    const byStatus = {};
    result.rows.forEach((row) => {
      byStatus[row.status] = row.count;
    });
    return byStatus;
  } finally {
    client.release();
  }
}

/**
 * Get recent requests. limit default 10, days optional (e.g. 7, 30, 90).
 */
async function getRecentRequests(limit = 10, filters = {}) {
  const { department_id, assigned_to, created_by, days } = filters;
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 100);
  let query = `
    SELECT r.id, r.template_id, r.request_id, r.title, r.department_id, r.status,
           r.created_by, r.assigned_to, r.created_at, r.updated_at,
           t.file_name AS template_file_name, t.file_size AS template_file_size,
           d.name AS department_name,
           u.full_name AS assigned_to_name
    FROM requests r
    LEFT JOIN templates t ON r.template_id = t.id
    LEFT JOIN departments d ON r.department_id = d.id
    LEFT JOIN users u ON r.assigned_to = u.id
    WHERE 1=1
  `;
  const params = [];
  let n = 1;
  if (department_id) {
    query += ` AND r.department_id = $${n++}`;
    params.push(department_id);
  }
  if (assigned_to) {
    query += ` AND r.assigned_to = $${n++}`;
    params.push(assigned_to);
  }
  if (created_by) {
    query += ` AND r.created_by = $${n++}`;
    params.push(created_by);
  }
  if (days != null && days > 0) {
    query += ` AND r.created_at >= NOW() - INTERVAL '1 day' * $${n++}`;
    params.push(Number(days));
  }
  query += ` ORDER BY r.created_at DESC LIMIT $${n}`;
  params.push(safeLimit);
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return result.rows.map(mapRequestRow);
  } finally {
    client.release();
  }
}

/**
 * Get recent templates. limit default 10, days optional.
 */
async function getRecentTemplates(limit = 10, filters = {}) {
  const { department_id, days } = filters;
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 100);
  let query = `
    SELECT t.id, t.file_name, t.file_path, t.file_size, t.department_id, t.status,
           t.created_at, t.updated_at, d.name AS department_name
    FROM templates t
    LEFT JOIN departments d ON t.department_id = d.id
    WHERE 1=1
  `;
  const params = [];
  let n = 1;
  if (department_id) {
    query += ` AND t.department_id = $${n++}`;
    params.push(department_id);
  }
  if (days != null && days > 0) {
    query += ` AND t.created_at >= NOW() - INTERVAL '1 day' * $${n++}`;
    params.push(Number(days));
  }
  query += ` ORDER BY t.created_at DESC LIMIT $${n}`;
  params.push(safeLimit);
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return result.rows.map(mapTemplateRow);
  } finally {
    client.release();
  }
}

async function getTemplateCountsByStatus(filters = {}) {
  const { department_id, days } = filters;
  let query = `
    SELECT status, COUNT(*)::int AS count
    FROM templates
    WHERE 1=1
  `;
  const params = [];
  let n = 1;
  if (department_id) {
    query += ` AND department_id = $${n++}`;
    params.push(department_id);
  }
  if (days != null && days > 0) {
    query += ` AND created_at >= NOW() - INTERVAL '1 day' * $${n++}`;
    params.push(Number(days));
  }
  query += ` GROUP BY status`;
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    const byStatus = {};
    result.rows.forEach((row) => {
      byStatus[row.status] = row.count;
    });
    return byStatus;
  } finally {
    client.release();
  }
}

async function getDocumentTotals(filters = {}) {
  const { department_id, assigned_to, created_by, days } = filters;
  let query = `
    SELECT COUNT(*)::int AS total
    FROM documents d
    LEFT JOIN requests r ON d.request_id = r.id
    WHERE 1=1
  `;
  const params = [];
  let n = 1;
  if (department_id) {
    query += ` AND r.department_id = $${n++}`;
    params.push(department_id);
  }
  if (assigned_to) {
    query += ` AND r.assigned_to = $${n++}`;
    params.push(assigned_to);
  }
  if (created_by) {
    query += ` AND r.created_by = $${n++}`;
    params.push(created_by);
  }
  if (days != null && days > 0) {
    query += ` AND d.created_at >= NOW() - INTERVAL '1 day' * $${n++}`;
    params.push(Number(days));
  }
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return { total: result.rows[0]?.total || 0 };
  } finally {
    client.release();
  }
}

/**
 * Get dashboard summary: request counts by status, recent requests, recent templates.
 * Query params: limit (default 10), days (optional, e.g. 7/30/90), department_id, assigned_to.
 */
async function getSummary(filters = {}) {
  const {
    limit = 10,
    days,
    department_id,
    assigned_to,
    created_by,
  } = filters;

  const [
    requestCountsByStatus,
    recentRequests,
    recentTemplates,
    templateCountsByStatus,
    documentTotals,
  ] = await Promise.all([
    getRequestCountsByStatus({ department_id, assigned_to, created_by, days }),
    getRecentRequests(limit, { department_id, assigned_to, created_by, days }),
    getRecentTemplates(limit, { department_id, days }),
    getTemplateCountsByStatus({ department_id, days }),
    getDocumentTotals({ department_id, assigned_to, created_by, days }),
  ]);

  return {
    requestCountsByStatus,
    recentRequests,
    recentTemplates,
    templateCountsByStatus,
    templateDraftCount: templateCountsByStatus.draft || 0,
    documentTotals: documentTotals.total ?? 0,
  };
}

module.exports = {
  getRequestCountsByStatus,
  getRecentRequests,
  getRecentTemplates,
  getTemplateCountsByStatus,
  getDocumentTotals,
  getSummary,
};
