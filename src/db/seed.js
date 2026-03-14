const bcrypt = require('bcrypt');
const { pool } = require('./pool');

const defaultPassword = 'admin123';
const testPassword = 'test123';

// One canonical role per type: admin, preparator, reviewer, approver, requestor, manager
const roleUsers = [
  { role: 'admin', username: 'admin', fullName: 'Admin User' },
  { role: 'requestor', username: 'requestor', fullName: 'Test Requestor' },
  { role: 'preparator', username: 'preparator', fullName: 'Test Preparator' },
  { role: 'manager', username: 'manager', fullName: 'Test Manager' },
  { role: 'reviewer', username: 'manager_reviewer', fullName: 'Test Manager Reviewer' },
  { role: 'approver', username: 'manager_approver', fullName: 'Test Manager Approver' },
  { role: 'approver', username: 'approver', fullName: 'Test Approver' },
  { role: 'reviewer', username: 'reviewer1', fullName: 'Test Reviewer 1' },
  { role: 'reviewer', username: 'reviewer2', fullName: 'Test Reviewer 2' },
  { role: 'reviewer', username: 'reviewer3', fullName: 'Test Reviewer 3' },
  { role: 'reviewer', username: 'reviewer4', fullName: 'Test Reviewer 4' },
  { role: 'approver', username: 'approver1', fullName: 'Test Approver 1' },
  { role: 'approver', username: 'approver2', fullName: 'Test Approver 2' },
];

const deptIds = [
  'a0000001-0000-0000-0000-000000000001', // Engineering
  'a0000002-0000-0000-0000-000000000002', // Quality Assurance
  'a0000003-0000-0000-0000-000000000003', // Manufacturing
];

function uuid(i) {
  const h = String(i).padStart(7, '0');
  return `b${h}-0000-0000-0000-000000000001`;
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query(`
      INSERT INTO departments (id, name, code) VALUES
        ('a0000001-0000-0000-0000-000000000001', 'Engineering', 'ENG'),
        ('a0000002-0000-0000-0000-000000000002', 'Quality Assurance', 'QA'),
        ('a0000003-0000-0000-0000-000000000003', 'Manufacturing', 'MFG')
      ON CONFLICT (id) DO NOTHING;
    `);

    const adminHash = await bcrypt.hash(defaultPassword, 10);
    const testHash = await bcrypt.hash(testPassword, 10);

    for (let i = 0; i < roleUsers.length; i++) {
      const u = roleUsers[i];
      const isAdmin = u.role === 'admin';
      const hash = isAdmin ? adminHash : testHash;
      const deptId = deptIds[i % deptIds.length];
      const userId = uuid(i + 1);

      await client.query(
        `INSERT INTO users (id, username, password_hash, role, department_id, full_name)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (username) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           department_id = EXCLUDED.department_id,
           full_name = EXCLUDED.full_name,
           updated_at = NOW();`,
        [userId, u.username, hash, u.role, deptId, u.fullName]
      );
    }

    console.log('Seed done. Test users (all roles):');
    console.log('  admin / admin123  (admin)');
    roleUsers
      .filter((u) => u.role !== 'admin')
      .forEach((u) => console.log(`  ${u.username} / ${testPassword}  (${u.role})`));
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
