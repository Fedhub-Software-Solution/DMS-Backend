const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

const migrationsDir = path.join(__dirname, 'migrations');

async function run() {
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        run_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    for (const file of files) {
      const name = file;
      const res = await client.query('SELECT 1 FROM _migrations WHERE name = $1', [name]);
      if (res.rows.length > 0) {
        console.log('Skip (already run):', name);
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [name]);
      console.log('Ran:', name);
    }
    console.log('Migrations done.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
