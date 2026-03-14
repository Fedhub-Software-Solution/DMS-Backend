const { pool } = require('../db/pool');

function mapWorkflow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    appliesToTemplateId: row.applies_to_template_id,
    appliesToDepartmentId: row.applies_to_department_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStep(row) {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    stepOrder: row.step_order,
    name: row.name,
    roleKey: row.role_key,
    departmentId: row.department_id,
    isApprovalStep: row.is_approval_step,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

async function listWorkflows(filters = {}) {
  const { template_id, department_id, is_active } = filters;
  const params = [];
  const conditions = [];
  let idx = 1;
  if (template_id) {
    conditions.push(`w.applies_to_template_id = $${idx++}`);
    params.push(template_id);
  }
  if (department_id) {
    conditions.push(`w.applies_to_department_id = $${idx++}`);
    params.push(department_id);
  }
  if (is_active !== undefined && is_active !== '') {
    conditions.push(`w.is_active = $${idx++}`);
    params.push(is_active === true || is_active === 'true');
  }
  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT w.* FROM workflows w${where} ORDER BY w.name`,
      params
    );
    return result.rows.map(mapWorkflow);
  } finally {
    client.release();
  }
}

async function getWorkflowById(id) {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM workflows WHERE id = $1', [id]);
    const row = result.rows[0];
    return row ? mapWorkflow(row) : null;
  } finally {
    client.release();
  }
}

async function createWorkflow(data) {
  const { name, description, is_active, applies_to_template_id, applies_to_department_id } = data;
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO workflows (name, description, is_active, applies_to_template_id, applies_to_department_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        name || '',
        description || null,
        is_active !== false && is_active !== 'false',
        applies_to_template_id || null,
        applies_to_department_id || null,
      ]
    );
    return mapWorkflow(result.rows[0]);
  } finally {
    client.release();
  }
}

async function updateWorkflow(id, body) {
  const updates = [];
  const values = [];
  let n = 1;
  ['name', 'description', 'is_active', 'applies_to_template_id', 'applies_to_department_id'].forEach((col) => {
    const key = col;
    if (body[key] !== undefined) {
      if (key === 'is_active') {
        updates.push(`${col} = $${n++}`);
        values.push(body[key] === true || body[key] === 'true');
      } else {
        updates.push(`${col} = $${n++}`);
        values.push(body[key]);
      }
    }
  });
  if (updates.length === 0) return null;
  updates.push('updated_at = NOW()');
  values.push(id);
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE workflows SET ${updates.join(', ')} WHERE id = $${n} RETURNING *`,
      values
    );
    return result.rows[0] ? mapWorkflow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

async function getWorkflowSteps(workflowId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order, created_at',
      [workflowId]
    );
    return result.rows.map(mapStep);
  } finally {
    client.release();
  }
}

async function updateWorkflowSteps(workflowId, steps) {
  if (!Array.isArray(steps)) return getWorkflowSteps(workflowId);
  const client = await pool.connect();
  try {
    await client.query('DELETE FROM workflow_steps WHERE workflow_id = $1', [workflowId]);
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      await client.query(
        `INSERT INTO workflow_steps (workflow_id, step_order, name, role_key, department_id, is_approval_step, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          workflowId,
          s.step_order ?? i,
          s.name || 'Step',
          s.role_key ?? null,
          s.department_id ?? null,
          s.is_approval_step !== false,
          s.metadata ? JSON.stringify(s.metadata) : null,
        ]
      );
    }
    return getWorkflowSteps(workflowId);
  } finally {
    client.release();
  }
}

module.exports = {
  listWorkflows,
  getWorkflowById,
  createWorkflow,
  updateWorkflow,
  getWorkflowSteps,
  updateWorkflowSteps,
  mapWorkflow,
  mapStep,
};
