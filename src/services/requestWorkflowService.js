const { pool } = require('../db/pool');
const requestService = require('./requestService');
const auditLogService = require('./auditLogService');
const emailService = require('./emailService');

function mapInstance(row) {
  return {
    id: row.id,
    requestId: row.request_id,
    workflowId: row.workflow_id,
    aiGeneratedDefinition: row.ai_generated_definition,
    createdAt: row.created_at,
  };
}

function mapStepRow(row) {
  return {
    id: row.id,
    requestWorkflowInstanceId: row.request_workflow_instance_id,
    stepOrder: row.step_order,
    name: row.name,
    assignedToUserId: row.assigned_to_user_id,
    assignedToName: row.assigned_to_name,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

async function getByRequestId(requestId) {
  const client = await pool.connect();
  try {
    const instResult = await client.query(
      `SELECT * FROM request_workflow_instances WHERE request_id = $1`,
      [requestId]
    );
    const instance = instResult.rows[0];
    if (!instance) return null;
    const stepsResult = await client.query(
      `SELECT s.*, u.full_name AS assigned_to_name
       FROM request_workflow_steps s
       LEFT JOIN users u ON s.assigned_to_user_id = u.id
       WHERE s.request_workflow_instance_id = $1
       ORDER BY s.step_order, s.created_at`,
      [instance.id]
    );
    return {
      ...mapInstance(instance),
      steps: stepsResult.rows.map(mapStepRow),
    };
  } finally {
    client.release();
  }
}

async function createOrUpdateInstance(requestId, { workflow_id, ai_generated_definition }) {
  const client = await pool.connect();
  try {
    const existing = await client.query(
      'SELECT id FROM request_workflow_instances WHERE request_id = $1',
      [requestId]
    );
    if (existing.rows[0]) {
      await client.query(
        `UPDATE request_workflow_instances SET workflow_id = $1, ai_generated_definition = $2 WHERE request_id = $3`,
        [workflow_id || null, ai_generated_definition ? JSON.stringify(ai_generated_definition) : null, requestId]
      );
    } else {
      await client.query(
        `INSERT INTO request_workflow_instances (request_id, workflow_id, ai_generated_definition) VALUES ($1, $2, $3)`,
        [requestId, workflow_id || null, ai_generated_definition ? JSON.stringify(ai_generated_definition) : null]
      );
    }
    return getByRequestId(requestId);
  } finally {
    client.release();
  }
}

async function performAction(requestId, action, userId, comment) {
  const request = await requestService.getById(requestId);
  if (!request) return null;
  const instance = await getByRequestId(requestId);
  const client = await pool.connect();
  try {
    if (action === 'approve' || action === 'reject' || action === 'request_revision') {
      const oldStatus = request.status;
      const newStatus =
        action === 'approve'
          ? 'approved'
          : action === 'reject'
          ? 'rejected'
          : 'needs_revision';

      // Update request status
      await requestService.update(requestId, { status: newStatus });

      // Audit log for Activity Timeline (frontend expects specific actions & readable details)
      await auditLogService.insert({
        entity_type: 'request',
        entity_id: requestId,
        action:
          action === 'approve'
            ? 'request_approved'
            : action === 'reject'
            ? 'request_rejected'
            : 'revisions_requested',
        user_id: userId || null,
        details: {
          from: oldStatus,
          to: newStatus,
          requestId: request.requestId,
          ...(comment != null && String(comment).trim() ? { comment: String(comment).trim() } : {}),
        },
      });

      // Email notification for status change (reviewer / approver / admin flows)
      if (emailService.isEmailConfigured()) {
        emailService
          .sendRequestStatusNotification({
            requestId,
            actorUserId: userId || null,
            oldStatus,
            newStatus,
          })
          .catch((err) => console.error('Request status email error (workflow action):', err));
      }
    }
    if (instance && instance.steps && instance.steps.length > 0) {
      const currentStep = instance.steps.find((s) => s.status === 'current');
      if (currentStep) {
        await client.query(
          `UPDATE request_workflow_steps SET status = $1, completed_at = NOW() WHERE id = $2`,
          [action === 'reject' ? 'rejected' : 'completed', currentStep.id]
        );
        const nextStep = instance.steps.find((s) => s.step_order === currentStep.stepOrder + 1);
        if (nextStep && action === 'approve') {
          await client.query(
            `UPDATE request_workflow_steps SET status = 'current', started_at = NOW() WHERE id = $1`,
            [nextStep.id]
          );
        }
      }
    }
    return requestService.getById(requestId);
  } finally {
    client.release();
  }
}

module.exports = { getByRequestId, createOrUpdateInstance, performAction };
