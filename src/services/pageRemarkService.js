const { pool } = require('../db/pool');

function mapRow(r) {
  return {
    id: r.id,
    requestId: r.request_id,
    pageNumber: r.page_number,
    remark: r.remark,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function listByRequest(requestId) {
  const client = await pool.connect();
  try {
    const q = await client.query(
      `SELECT id, request_id, page_number, remark, created_by, updated_by, created_at, updated_at
       FROM page_remarks
       WHERE request_id = $1
       ORDER BY page_number ASC`,
      [requestId]
    );
    return q.rows.map(mapRow);
  } finally {
    client.release();
  }
}

async function upsert(requestId, pageNumber, remark, userId) {
  const client = await pool.connect();
  try {
    const q = await client.query(
      `INSERT INTO page_remarks (request_id, page_number, remark, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (request_id, page_number)
       DO UPDATE SET
         remark = EXCLUDED.remark,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING id, request_id, page_number, remark, created_by, updated_by, created_at, updated_at`,
      [requestId, pageNumber, remark, userId || null]
    );
    return mapRow(q.rows[0]);
  } finally {
    client.release();
  }
}

module.exports = { listByRequest, upsert };

