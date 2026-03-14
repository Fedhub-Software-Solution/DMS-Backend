const { pool } = require('../db/pool');

/** Returns next sequential request_id in form REQ-YYYY-10001, REQ-YYYY-10002, ... */
async function nextRequestId(client) {
  const { rows } = await client.query(`SELECT nextval('request_display_seq') AS n`);
  const n = rows[0].n;
  const y = new Date().getFullYear();
  return `REQ-${y}-${n}`;
}

function mapRow(row) {
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
    reviewSequence: row.review_sequence,
    priority: row.priority,
    submissionComments: row.submission_comments,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    templateFileName: row.template_file_name,
    fileSize: row.template_file_size != null ? String(row.template_file_size) : null,
  };
}

const ALLOWED_SORT = { created_at: 'r.created_at', title: 'r.title', status: 'r.status', request_id: 'r.request_id', department_name: 'd.name', assigned_to_name: 'u.full_name', updated_at: 'r.updated_at' };

async function list(filters = {}) {
  const {
    department_id,
    status,
    q,
    assigned_to,
    from_date,
    to_date,
    sortBy = 'created_at',
    sortOrder = 'desc',
    page,
    pageSize,
    view,
    userId,
    userRole,
  } = filters;

  const params = [];
  const conditions = [];
  let idx = 1;
  if (department_id) {
    conditions.push(`r.department_id = $${idx++}`);
    params.push(department_id);
  }
  if (status) {
    conditions.push(`r.status = $${idx++}`);
    params.push(status);
  }
  if (q && String(q).trim()) {
    conditions.push(`(r.title ILIKE $${idx} OR r.request_id ILIKE $${idx} OR d.name ILIKE $${idx})`);
    params.push(`%${String(q).trim()}%`);
    idx += 1;
  }
  if (assigned_to) {
    conditions.push(`r.assigned_to = $${idx++}`);
    params.push(assigned_to);
  }
  if (from_date) {
    conditions.push(`r.created_at >= $${idx++}::timestamptz`);
    params.push(from_date);
  }
  if (to_date) {
    conditions.push(`r.created_at <= $${idx++}::timestamptz`);
    params.push(to_date);
  }
  const normalizedRole = (userRole || '').toLowerCase();
  if (view === 'raise') {
    // Default status filter for Raise Request when caller didn't explicitly set status:
    // show both draft and pending.
    if (!status) {
      conditions.push(`r.status IN ('draft','pending')`);
    }
    // Non-admins see only their own items; admin sees all.
    if (normalizedRole !== 'admin' && userId) {
      conditions.push(`r.created_by = $${idx++}`);
      params.push(userId);
    }
  } else if (view === 'library') {
    // Default status filter for Document Library when caller didn't set status:
    // show everything except draft and pending.
    if (!status) {
      conditions.push(`r.status NOT IN ('draft','pending')`);
    }
    // Non-admins see requests they created, are assigned to, or are in review_sequence (e.g. reviewer still sees after handoff to approver).
    if (normalizedRole !== 'admin' && userId) {
      conditions.push(`(r.created_by = $${idx++} OR r.assigned_to = $${idx++} OR (r.review_sequence IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(r.review_sequence) AS e WHERE e = $${idx++}::text)))`);
      params.push(userId, userId, userId);
    }
  }
  const whereClause = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';

  const orderCol = ALLOWED_SORT[sortBy] || ALLOWED_SORT.created_at;
  const orderDir = (sortOrder || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const orderClause = ` ORDER BY ${orderCol} ${orderDir}`;

  const baseSql = `
    SELECT r.id, r.template_id, r.request_id, r.title, r.department_id, r.status,
           r.created_by, r.assigned_to, r.review_sequence, r.priority, r.submission_comments,
           r.created_at, r.updated_at,
           t.file_name AS template_file_name, t.file_size AS template_file_size,
           d.name AS department_name,
           u.full_name AS assigned_to_name
    FROM requests r
    LEFT JOIN templates t ON r.template_id = t.id
    LEFT JOIN departments d ON r.department_id = d.id
    LEFT JOIN users u ON r.assigned_to = u.id
    WHERE 1=1
  `;
  const client = await pool.connect();
  try {
    const hasPagination = page != null && pageSize != null && Number(pageSize) > 0;
    let total = null;
    if (hasPagination) {
      const countResult = await client.query(
        `SELECT COUNT(*)::int AS total FROM requests r LEFT JOIN templates t ON r.template_id = t.id LEFT JOIN departments d ON r.department_id = d.id LEFT JOIN users u ON r.assigned_to = u.id WHERE 1=1${whereClause}`,
        params
      );
      total = countResult.rows[0].total;
    }

    let dataQuery = baseSql + whereClause + orderClause;
    const dataParams = [...params];
    if (hasPagination) {
      const limit = Math.max(1, Math.min(500, Number(pageSize)));
      const offset = (Math.max(1, Number(page)) - 1) * limit;
      dataQuery += ` LIMIT $${idx++} OFFSET $${idx}`;
      dataParams.push(limit, offset);
    }
    const result = await client.query(dataQuery, dataParams);
    const rows = result.rows.map(mapRow);
    if (hasPagination) {
      return { data: rows, total, page: Math.max(1, Number(page)), pageSize: Math.max(1, Math.min(500, Number(pageSize))) };
    }
    return rows;
  } finally {
    client.release();
  }
}

async function getById(id) {
  const client = await pool.connect();
  try {
    const q = await client.query(
      `SELECT r.*, t.file_name AS template_file_name, t.file_size AS template_file_size,
              d.name AS department_name, u.full_name AS assigned_to_name
       FROM requests r
       LEFT JOIN templates t ON r.template_id = t.id
       LEFT JOIN departments d ON r.department_id = d.id
       LEFT JOIN users u ON r.assigned_to = u.id
       WHERE r.id = $1`,
      [id]
    );
    const row = q.rows[0];
    return row ? mapRow(row) : null;
  } finally {
    client.release();
  }
}

async function create(data) {
  const { template_id, title, department_id, created_by } = data;
  const client = await pool.connect();
  try {
    const request_id = await nextRequestId(client);
    await client.query(
      `INSERT INTO requests (template_id, request_id, title, department_id, status, created_by)
       VALUES ($1, $2, $3, $4, 'pending', $5)`,
      [template_id, request_id, title || null, department_id || null, created_by]
    );
    const q = await client.query(
      `SELECT r.*, t.file_name AS template_file_name, t.file_size AS template_file_size,
              d.name AS department_name, u.full_name AS assigned_to_name
       FROM requests r
       LEFT JOIN templates t ON r.template_id = t.id
       LEFT JOIN departments d ON r.department_id = d.id
       LEFT JOIN users u ON r.assigned_to = u.id
       WHERE r.request_id = $1`,
      [request_id]
    );
    const row = q.rows[0];
    return row ? mapRow(row) : null;
  } finally {
    client.release();
  }
}

async function update(id, body) {
  const title = body.title;
  const status = body.status;
  const assigned_to = body.assigned_to ?? body.assignedTo;
  const review_sequence = body.review_sequence ?? body.reviewSequence;
  const priority = body.priority;
  const submission_comments = body.submission_comments ?? body.submissionComments;

  const updates = [];
  const values = [];
  let n = 1;
  if (title !== undefined) {
    updates.push(`title = $${n++}`);
    values.push(title);
  }
  if (status !== undefined) {
    updates.push(`status = $${n++}`);
    values.push(status);
  }
  if (assigned_to !== undefined) {
    updates.push(`assigned_to = $${n++}`);
    values.push(assigned_to);
  }
  if (review_sequence !== undefined) {
    updates.push(`review_sequence = $${n++}::jsonb`);
    const reviewSeqJson =
      review_sequence == null
        ? null
        : typeof review_sequence === 'string'
          ? review_sequence
          : Array.isArray(review_sequence)
            ? JSON.stringify(review_sequence)
            : null;
    values.push(reviewSeqJson);
  }
  if (priority !== undefined) {
    updates.push(`priority = $${n++}`);
    values.push(priority);
  }
  if (submission_comments !== undefined) {
    updates.push(`submission_comments = $${n++}`);
    values.push(submission_comments);
  }
  if (updates.length === 0) return null;
  updates.push(`updated_at = NOW()`);
  values.push(id);

  const client = await pool.connect();
  try {
    let row;
    try {
      const q = await client.query(
        `UPDATE requests SET ${updates.join(', ')} WHERE id = $${n} RETURNING *`,
        values
      );
      row = q.rows[0];
    } catch (queryErr) {
      const msg = (queryErr && queryErr.message) ? String(queryErr.message) : '';
      if (msg.includes('column') && msg.includes('does not exist')) {
        const coreUpdates = [];
        const coreValues = [];
        let n2 = 1;
        if (title !== undefined) {
          coreUpdates.push(`title = $${n2++}`);
          coreValues.push(title);
        }
        if (status !== undefined) {
          coreUpdates.push(`status = $${n2++}`);
          coreValues.push(status);
        }
        if (assigned_to !== undefined) {
          coreUpdates.push(`assigned_to = $${n2++}`);
          coreValues.push(assigned_to);
        }
        if (coreUpdates.length === 0) {
          throw queryErr;
        }
        coreUpdates.push(`updated_at = NOW()`);
        coreValues.push(id);
        const q2 = await client.query(
          `UPDATE requests SET ${coreUpdates.join(', ')} WHERE id = $${n2} RETURNING *`,
          coreValues
        );
        row = q2.rows[0];
      } else {
        throw queryErr;
      }
    }
    if (!row) return null;
    return {
      id: row.id,
      requestId: row.request_id,
      title: row.title,
      status: row.status,
      assignedTo: row.assigned_to,
      reviewSequence: row.review_sequence ?? null,
      priority: row.priority ?? null,
      submissionComments: row.submission_comments ?? null,
      updatedAt: row.updated_at,
    };
  } finally {
    client.release();
  }
}

async function remove(id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete any documents linked to this request first to satisfy FK constraints.
    await client.query('DELETE FROM documents WHERE request_id = $1', [id]);

    // Delete the request itself and capture basic fields for callers (e.g. audit logs).
    const del = await client.query('DELETE FROM requests WHERE id = $1 RETURNING *', [id]);
    const row = del.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query('COMMIT');
    return {
      id: row.id,
      requestId: row.request_id,
      title: row.title,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { list, getById, create, update, remove, nextRequestId };
