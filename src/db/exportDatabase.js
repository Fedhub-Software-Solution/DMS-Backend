/**
 * Export the Pharma DMS database to a single SQL file for sharing with the team.
 * Tries pg_dump first; if not in PATH, falls back to Node (schema from migrations + data as INSERTs).
 *
 * Usage: npm run db:export
 * Output: backend/export-pharma_dms-YYYY-MM-DD.sql
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Prefer DATABASE_URL (e.g. Aiven); parse to get host, port, database, user, password
function getDbParams() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const u = new URL(url);
    return {
      dbName: u.pathname.replace(/^\//, '') || 'pharma_dms',
      dbUser: decodeURIComponent(u.username || 'postgres'),
      dbHost: u.hostname,
      dbPort: u.port || '5432',
      dbPassword: decodeURIComponent(u.password || ''),
    };
  }
  return {
    dbName: process.env.DATABASENAME || 'pharma_dms_test',
    dbUser: process.env.DATABASEUSER || 'postgres',
    dbHost: process.env.DATABASEHOST || 'localhost',
    dbPort: process.env.DATABASEPORT || '5432',
    dbPassword: process.env.DATABASEPASSWORD || '',
  };
}

const { dbName, dbUser, dbHost, dbPort, dbPassword } = getDbParams();

const date = new Date().toISOString().slice(0, 10);
const outFile = path.join(__dirname, '../../', `export-${dbName}-${date}.sql`);

console.log('Exporting database to:', outFile);
console.log('Database:', dbName, '| Host:', dbHost + ':' + dbPort);

function tryPgDump() {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PGPASSWORD: dbPassword };
    const args = [
      '-h', dbHost, '-p', String(dbPort), '-U', dbUser, '-d', dbName,
      '--no-owner', '--no-acl', '-f', outFile
    ];
    const pgDump = spawn('pg_dump', args, { env, stdio: ['ignore', 'pipe', 'inherit'] });
    pgDump.on('error', (err) => {
      if (err.code === 'ENOENT') resolve(false);
      else reject(err);
    });
    pgDump.on('close', (code) => {
      if (code === 0) resolve(true);
      else resolve(false);
    });
  });
}

function escapeSql(val) {
  if (val == null) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number' && !Number.isNaN(val)) return String(val);
  if (typeof val === 'object') return "'" + String(JSON.stringify(val)).replace(/'/g, "''") + "'::jsonb";
  const s = String(val);
  return "'" + s.replace(/'/g, "''").replace(/\\/g, '\\\\') + "'";
}

async function exportWithNode() {
  const { pool } = require('./pool');
  const migrationsDir = path.join(__dirname, 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  let sql = '';
  sql += '-- Pharma DMS – Database export for team (schema + data)\n';
  sql += '-- Generated: ' + new Date().toISOString() + '\n';
  sql += '-- Restore: psql -U postgres -d <your_db> -f "' + path.basename(outFile) + '"\n\n';
  for (const file of migrationFiles) {
    sql += '-- From ' + file + '\n';
    sql += fs.readFileSync(path.join(migrationsDir, file), 'utf8') + '\n\n';
  }
  sql += '-- Data export\n';
  const tables = [
    'departments', 'users', 'templates', 'requests', 'form_data',
    'documents', 'document_versions', 'audit_logs'
  ];
  const client = await pool.connect();
  try {
    for (const table of tables) {
      const exist = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
        [table]
      );
      if (exist.rows.length === 0) continue;
      const cols = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
        [table]
      );
      const colNames = cols.rows.map((r) => r.column_name);
      const res = await client.query('SELECT * FROM ' + table);
      if (res.rows.length === 0) {
        sql += '-- Table ' + table + ': no rows\n';
        continue;
      }
      sql += '\n-- Table: ' + table + '\n';
      for (const row of res.rows) {
        const vals = colNames.map((c) => escapeSql(row[c]));
        sql += 'INSERT INTO ' + table + ' (' + colNames.join(', ') + ') VALUES (' + vals.join(', ') + ') ON CONFLICT DO NOTHING;\n';
      }
    }
  } finally {
    client.release();
  }
  fs.writeFileSync(outFile, sql, 'utf8');
}

async function main() {
  const used = await tryPgDump();
  if (used) {
    const size = fs.statSync(outFile).size;
    console.log('\nExport complete (pg_dump). File size:', (size / 1024).toFixed(1), 'KB');
    return;
  }
  console.log('pg_dump not in PATH; using Node export (schema + data)...');
  try {
    await exportWithNode();
    const size = fs.statSync(outFile).size;
    console.log('\nExport complete. File size:', (size / 1024).toFixed(1), 'KB');
    console.log('Share this file with your team. To restore: psql -U postgres -d <database> -f "' + path.basename(outFile) + '"');
  } catch (err) {
    console.error('Export failed:', err.message);
    process.exit(1);
  }
}

main();
