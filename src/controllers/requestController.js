const requestService = require('../services/requestService');
const auditLogService = require('../services/auditLogService');
const requestWorkflowService = require('../services/requestWorkflowService');
const emailService = require('../services/emailService');
const pageRemarkService = require('../services/pageRemarkService');
const userService = require('../services/userService');

async function list(req, res) {
  try {
    const {
      department_id,
      status,
      q,
      assigned_to,
      from_date,
      to_date,
      sortBy,
      sortOrder,
      page,
      pageSize,
      view,
    } = req.query;
    const result = await requestService.list({
      department_id,
      status,
      q,
      assigned_to,
      from_date,
      to_date,
      sortBy,
      sortOrder,
      page,
      pageSize,
      view,
      userId: req.user && req.user.id,
      userRole: req.user && req.user.role,
    });
    res.json(result);
  } catch (err) {
    console.error('Requests list error:', err);
    res.status(500).json({ error: 'Failed to list requests' });
  }
}

async function getById(req, res) {
  try {
    const request = await requestService.getById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    res.json(request);
  } catch (err) {
    console.error('Request get error:', err);
    res.status(500).json({ error: 'Failed to get request' });
  }
}

async function create(req, res) {
  try {
    const { template_id, title, department_id } = req.body || {};
    if (!template_id) {
      return res.status(400).json({ error: 'template_id required' });
    }
    const result = await requestService.create({
      template_id,
      title,
      department_id,
      created_by: req.user.id,
    });
    if (result) {
      // Document uploaded event (tied to this request) for activity timeline
      await auditLogService.insert({
        entity_type: 'request',
        entity_id: result.id,
        action: 'document_uploaded',
        user_id: req.user.id,
        details: {
          requestId: result.requestId,
          fileName: result.templateFileName,
          fileSize: result.fileSize,
        },
      });
      // Request created event
      await auditLogService.insert({
        entity_type: 'request',
        entity_id: result.id,
        action: 'request_created',
        user_id: req.user.id,
        details: { requestId: result.requestId, title: result.title },
      });
    }
    res.status(201).json(result);
  } catch (err) {
    console.error('Request create error:', err);
    res.status(500).json({ error: 'Failed to create request' });
  }
}

async function update(req, res) {
  try {
    const previous = await requestService.getById(req.params.id);
    if (!previous) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Extra authentication validation for review/approval operations:
    // ensure the JWT user still exists in the users table.
    let actorUser = null;
    if (req.user && req.user.id) {
      actorUser = await userService.getById(req.user.id);
    }
    if (!actorUser) {
      return res
        .status(401)
        .json({ error: 'Authenticated user not found', code: 'USER_NOT_FOUND' });
    }

    const body = { ...(req.body || {}) };
    // When reviewer sets status to "reviewed", advance assigned_to to next in review_sequence (approver).
    if (previous && body.status === 'reviewed') {
      const seq = previous.reviewSequence;
      if (Array.isArray(seq) && seq.length > 0 && previous.assignedTo) {
        const currentId = previous.assignedTo;
        const idx = seq.findIndex((id) => String(id) === String(currentId));
        if (idx >= 0 && idx < seq.length - 1) {
          body.assigned_to = seq[idx + 1];
        }
      }
    }
    const result = await requestService.update(req.params.id, body);
    if (!result) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    const newAssigneeRaw = body.assigned_to ?? body.assignedTo;
    if (newAssigneeRaw && previous && previous.assignedTo !== newAssigneeRaw) {
      await auditLogService.insert({
        entity_type: 'request',
        entity_id: req.params.id,
        action: 'reviewer_assigned',
        user_id: req.user.id,
        details: {
          requestId: previous.requestId,
          fromAssignee: previous.assignedTo,
          toAssignee: newAssigneeRaw,
          actorUser: {
            id: actorUser.id,
            username: actorUser.username,
            fullName: actorUser.fullName,
            role: actorUser.role,
            departmentId: actorUser.departmentId,
            departmentName: actorUser.departmentName,
          },
        },
      });
    }
    if (body.status !== undefined && previous && previous.status !== body.status) {
      await auditLogService.insert({
        entity_type: 'request',
        entity_id: req.params.id,
        action: 'status_changed',
        user_id: req.user.id,
        details: {
          from: previous.status,
          to: body.status,
          requestId: result.requestId,
          actorUser: {
            id: actorUser.id,
            username: actorUser.username,
            fullName: actorUser.fullName,
            role: actorUser.role,
            departmentId: actorUser.departmentId,
            departmentName: actorUser.departmentName,
          },
        },
      });
      const roleLower = (req.user.role || '').toLowerCase();
      const isAdmin = roleLower === 'admin';
      const isApprover =
        roleLower === 'approver' ||
        roleLower === 'manager_approver' ||
        roleLower.includes('approver');
      const newStatus = body.status;
      if (
        emailService.isEmailConfigured() &&
        (isAdmin || (isApprover && newStatus === 'approved'))
      ) {
        emailService
          .sendRequestStatusNotification({
            requestId: req.params.id,
            actorUserId: req.user.id,
            oldStatus: previous.status,
            newStatus,
          })
          .catch((err) => console.error('Request status email error:', err));
      }
    }
    if (
      emailService.isEmailConfigured() &&
      newAssigneeRaw &&
      previous &&
      previous.assignedTo !== newAssigneeRaw &&
      (req.user.role || '').toLowerCase() !== 'admin'
    ) {
      emailService
        .sendRequestAssignmentNotification({
          requestId: req.params.id,
          actorUserId: req.user.id,
          newAssigneeId: newAssigneeRaw,
        })
        .catch((err) => console.error('Request assignment email error:', err));
    }
    res.json(result);
  } catch (err) {
    console.error('Request patch error:', err);
    const detail = err.message || (err.code ? String(err.code) : '');
    res.status(500).json({
      error: 'Failed to update request',
      ...(detail && { detail }),
    });
  }
}

async function getActivity(req, res) {
  try {
    const request = await requestService.getById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    const logs = await auditLogService.list({
      entity_type: 'request',
      entity_id: req.params.id,
      limit: req.query.limit || 100,
    });
    res.json({
      requestStatus: request.status,
      activity: logs,
    });
  } catch (err) {
    console.error('Request activity error:', err);
    res.status(500).json({ error: 'Failed to get request activity' });
  }
}

async function getWorkflow(req, res) {
  try {
    const request = await requestService.getById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    const workflow = await requestWorkflowService.getByRequestId(req.params.id);
    res.json(workflow || { requestId: req.params.id, workflowId: null, steps: [] });
  } catch (err) {
    console.error('Request workflow get error:', err);
    res.status(500).json({ error: 'Failed to get request workflow' });
  }
}

async function workflowAction(req, res) {
  try {
    const request = await requestService.getById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    const { action, workflow_id, ai_generated_definition } = req.body || {};
    if (action === 'init' || action === 'set_workflow') {
      const updated = await requestWorkflowService.createOrUpdateInstance(req.params.id, {
        workflow_id,
        ai_generated_definition,
      });
      return res.json(updated);
    }
    if (['approve', 'reject', 'request_revision'].includes(action)) {
      const updated = await requestWorkflowService.performAction(
        req.params.id,
        action,
        req.user?.id,
        req.body?.comment
      );
      return res.json(updated);
    }
    res.status(400).json({ error: 'Invalid action. Use init, set_workflow, approve, reject, or request_revision.' });
  } catch (err) {
    console.error('Request workflow action error:', err);
    res.status(500).json({ error: 'Failed to perform workflow action' });
  }
}

async function listPageRemarks(req, res) {
  try {
    const rows = await pageRemarkService.listByRequest(req.params.id);
    res.json(rows);
  } catch (err) {
    console.error('Request page remarks list error:', err);
    res.status(500).json({ error: 'Failed to list page remarks' });
  }
}

async function savePageRemark(req, res) {
  try {
    const pageNumber = parseInt(req.params.page, 10);
    if (!Number.isFinite(pageNumber) || pageNumber <= 0) {
      return res.status(400).json({ error: 'Invalid page number' });
    }
    const { remark } = req.body || {};
    const trimmed = (remark || '').toString();
    const row = await pageRemarkService.upsert(req.params.id, pageNumber, trimmed, req.user && req.user.id);
    res.json(row);
  } catch (err) {
    console.error('Request page remark save error:', err);
    res.status(500).json({ error: 'Failed to save page remark' });
  }
}

async function remove(req, res) {
  try {
    const deleted = await requestService.remove(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Audit log entry so Activity Log can show the deletion event.
    await auditLogService.insert({
      entity_type: 'request',
      entity_id: req.params.id,
      action: 'request_deleted',
      user_id: req.user.id,
      details: { requestId: deleted.requestId, title: deleted.title },
    });

    res.status(204).send();
  } catch (err) {
    console.error('Request delete error:', err);
    res.status(500).json({ error: 'Failed to delete request' });
  }
}

module.exports = {
  list,
  getById,
  create,
  update,
  getActivity,
  getWorkflow,
  workflowAction,
  listPageRemarks,
  savePageRemark,
  remove,
};
