const { pool } = require('../db/pool');

function mapRule(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    appliesToTemplateId: row.applies_to_template_id,
    appliesToDepartmentId: row.applies_to_department_id,
    conditionJson: row.condition_json,
    actionJson: row.action_json,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listRules(filters = {}) {
  const { template_id, department_id, is_active } = filters;
  const params = [];
  const conditions = [];
  let idx = 1;
  if (template_id) {
    conditions.push(`applies_to_template_id = $${idx++}`);
    params.push(template_id);
  }
  if (department_id) {
    conditions.push(`applies_to_department_id = $${idx++}`);
    params.push(department_id);
  }
  if (is_active !== undefined && is_active !== '') {
    conditions.push(`is_active = $${idx++}`);
    params.push(is_active === true || is_active === 'true');
  }
  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM workflow_rules${where} ORDER BY name`,
      params
    );
    return result.rows.map(mapRule);
  } finally {
    client.release();
  }
}

async function getRuleById(id) {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM workflow_rules WHERE id = $1', [id]);
    const row = result.rows[0];
    return row ? mapRule(row) : null;
  } finally {
    client.release();
  }
}

async function createRule(data) {
  const { name, description, applies_to_template_id, applies_to_department_id, condition_json, action_json, is_active } = data;
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO workflow_rules (name, description, applies_to_template_id, applies_to_department_id, condition_json, action_json, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        name || '',
        description || null,
        applies_to_template_id || null,
        applies_to_department_id || null,
        condition_json ? JSON.stringify(condition_json) : '{}',
        action_json ? JSON.stringify(action_json) : '{}',
        is_active !== false && is_active !== 'false',
      ]
    );
    return mapRule(result.rows[0]);
  } finally {
    client.release();
  }
}

async function updateRule(id, body) {
  const updates = [];
  const values = [];
  let n = 1;
  const fields = ['name', 'description', 'applies_to_template_id', 'applies_to_department_id', 'condition_json', 'action_json', 'is_active'];
  fields.forEach((col) => {
    if (body[col] !== undefined) {
      updates.push(`${col} = $${n++}`);
      if (col === 'condition_json' || col === 'action_json') {
        values.push(typeof body[col] === 'object' ? JSON.stringify(body[col]) : body[col]);
      } else if (col === 'is_active') {
        values.push(body[col] === true || body[col] === 'true');
      } else {
        values.push(body[col]);
      }
    }
  });
  if (updates.length === 0) return null;
  updates.push('updated_at = NOW()');
  values.push(id);
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE workflow_rules SET ${updates.join(', ')} WHERE id = $${n} RETURNING *`,
      values
    );
    return result.rows[0] ? mapRule(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

module.exports = { listRules, getRuleById, createRule, updateRule, mapRule };
