/**
 * Clear uploaded templates, requests, form data, documents, and audit logs.
 * Keeps: departments, users, _migrations.
 * Run: node src/db/clearData.js
 */
require('dotenv').config();
const { pool } = require('./pool');

async function clearData() {
  const client = await pool.connect();
  try {
    await client.query(`
      TRUNCATE TABLE
        form_data,
        document_versions,
        documents,
        requests,
        templates,
        audit_logs
      RESTART IDENTITY CASCADE
    `);
    console.log('Cleared: templates, requests, form_data, documents, document_versions, audit_logs');
  } finally {
    client.release();
    await pool.end();
  }
}

clearData().catch((err) => {
  console.error(err);
  process.exit(1);
});
