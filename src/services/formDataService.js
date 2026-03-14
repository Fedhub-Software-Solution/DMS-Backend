const { pool } = require('../db/pool');

async function getByRequestId(requestId) {
  const client = await pool.connect();
  try {
    const [formQ, requestQ] = await Promise.all([
      client.query(
        'SELECT data, form_sections_snapshot, updated_at FROM form_data WHERE request_id = $1',
        [requestId]
      ),
      client.query(
        `SELECT d.name AS department_name, u.full_name AS preparator_name
         FROM requests r
         LEFT JOIN departments d ON r.department_id = d.id
         LEFT JOIN users u ON r.created_by = u.id
         WHERE r.id = $1`,
        [requestId]
      ),
    ]);
    const formRow = formQ.rows[0];
    const requestRow = requestQ.rows[0];
    const departmentName = requestRow ? requestRow.department_name || null : null;
    const preparatorName = requestRow ? requestRow.preparator_name || null : null;
    const base = {
      departmentName,
      preparatorName,
    };
    if (!formRow) {
      return { data: {}, formSectionsSnapshot: null, updatedAt: null, ...base };
    }
    return {
      data: formRow.data || {},
      formSectionsSnapshot: formRow.form_sections_snapshot,
      updatedAt: formRow.updated_at,
      ...base,
    };
  } finally {
    client.release();
  }
}

async function upsert(requestId, payload) {
  const { data, formSectionsSnapshot } = payload;
  const client = await pool.connect();
  try {
    const q = await client.query(
      `INSERT INTO form_data (request_id, data, form_sections_snapshot)
       VALUES ($1, $2, $3)
       ON CONFLICT (request_id) DO UPDATE SET
         data = EXCLUDED.data,
         form_sections_snapshot = EXCLUDED.form_sections_snapshot,
         updated_at = NOW()
       RETURNING data, form_sections_snapshot, updated_at`,
      [requestId, JSON.stringify(data || {}), JSON.stringify(formSectionsSnapshot || null)]
    );
    const row = q.rows[0];
    return {
      data: row.data || {},
      formSectionsSnapshot: row.form_sections_snapshot,
      updatedAt: row.updated_at,
    };
  } finally {
    client.release();
  }
}

module.exports = { getByRequestId, upsert };
