const { pool } = require('../db/pool');

async function list() {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT id, name, code FROM departments ORDER BY name');
    return result.rows.map((r) => ({ id: r.id, name: r.name, code: r.code }));
  } finally {
    client.release();
  }
}

module.exports = { list };
