const { pool } = require('../db/pool');

function formatBytes(bytesLike) {
  const n = Number(bytesLike);
  if (!Number.isFinite(n) || n < 0) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
}

function safeJsonParse(val) {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  if (typeof val !== 'string') return null;
  const s = val.trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}

function titleFromAction(action) {
  return String(action || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

function buildHumanDetails(row) {
  const action = row.action;
  const detailsObj = safeJsonParse(row.details);
  const fileName =
    (detailsObj && (detailsObj.fileName || detailsObj.templateFileName)) ||
    row.request_template_file_name ||
    row.template_file_name ||
    row.document_file_name ||
    null;

  if (action === 'document_uploaded') {
    const sizeHuman = formatBytes(detailsObj && detailsObj.fileSize) || (detailsObj && detailsObj.fileSize) || null;
    const sizePart = sizeHuman ? `, Size: ${sizeHuman}` : '';
    const filePart = fileName ? `File: ${fileName}` : 'File uploaded';
    return `Document successfully uploaded to system. ${filePart}${sizePart}`;
  }

  if (action === 'request_created') {
    if (fileName) return `Approval request created for ${fileName}. Request initiated for processing.`;
    return `Approval request created. Request initiated for processing.`;
  }

  if (action === 'reviewer_assigned') {
    const assignedName = row.request_assigned_to_name || 'reviewer';
    return `Assigned ${assignedName} based on department rules`;
  }

  if (action === 'review_started') {
    if (fileName) return `Started review of ${fileName}`;
    return `Started review`;
  }

  if (action === 'revisions_requested') {
    const comment = detailsObj && (detailsObj.comment || detailsObj.remarks || detailsObj.reason);
    if (comment && String(comment).trim()) return String(comment).trim();
    return 'Revisions requested. Please update the document and resubmit.';
  }

  if (action === 'request_approved') {
    if (fileName) return `${fileName} has been approved.`;
    return 'Request approved.';
  }

  if (action === 'request_rejected') {
    const comment = detailsObj && (detailsObj.comment || detailsObj.remarks || detailsObj.reason);
    if (comment && String(comment).trim()) return String(comment).trim();
    return 'Request rejected. Please review and resubmit with necessary corrections.';
  }

  if (action === 'request_deleted') {
    if (fileName) return `Request deleted for ${fileName}.`;
    return 'Request deleted.';
  }

  if (action === 'submission_remarks_added') {
    const comment =
      detailsObj &&
      (detailsObj.submissionComments ||
        detailsObj.comment ||
        detailsObj.remarks ||
        detailsObj.reason);
    if (comment && String(comment).trim()) {
      return `Submission remarks: ${String(comment).trim()}`;
    }
    return 'Submission remarks added.';
  }

  if (action === 'user_validated_for_review') {
    const username = detailsObj && (detailsObj.username || detailsObj.user || null);
    const email = detailsObj && (detailsObj.email || null);
    if (username && email) {
      return `Secondary verification successful for ${username} (${email}).`;
    }
    if (email) {
      return `Secondary verification successful for user with email ${email}.`;
    }
    return 'Secondary verification successful.';
  }

  if (action === 'user_validation_failed') {
    const email = detailsObj && (detailsObj.email || null);
    if (email) {
      return `Secondary verification failed for user with email ${email}.`;
    }
    return 'Secondary verification failed.';
  }

  if (action === 'page_changed') {
    const page = detailsObj && (detailsObj.pageNumber || detailsObj.page || detailsObj.page_index);
    const type = detailsObj && (detailsObj.eventType || detailsObj.type);
    const summary = detailsObj && detailsObj.summary;
    const pageLabel = page ? `Page ${page}` : 'Page';
    const base =
      type === 'view'
        ? `${pageLabel} viewed.`
        : `${pageLabel} edited.`;
    if (summary && String(summary).trim()) {
      return `${base} ${String(summary).trim()}`;
    }
    return base;
  }

  if (action === 'status_changed') {
    const from = detailsObj && detailsObj.from;
    const to = detailsObj && detailsObj.to;
    if (from || to) return `Status changed${from ? ` from ${from}` : ''}${to ? ` to ${to}` : ''}.`;
  }

  // Fallback: if JSON -> stringify; else return as-is string
  if (detailsObj != null) return JSON.stringify(detailsObj);
  return (row.details || '') + '';
}

function normalizeAction(row) {
  if (row.action !== 'status_changed') return row.action;
  const detailsObj = safeJsonParse(row.details) || {};
  const to = detailsObj.to || detailsObj.newStatus || detailsObj.status;
  if (to === 'needs_revision' || to === 'needs-revision') return 'revisions_requested';
  if (to === 'approved') return 'request_approved';
  if (to === 'rejected') return 'request_rejected';
  if (to === 'pending' || to === 'submitted') return 'review_started';
  return row.action;
}

/** Derive display status for activity timeline (dynamic per action). */
function statusFromAction(normalizedAction) {
  switch (normalizedAction) {
    case 'request_approved':
      return 'approved';
    case 'request_rejected':
      return 'rejected';
    case 'revisions_requested':
      return 'needs_revision';
    case 'review_started':
    case 'reviewer_assigned':
      return 'in_progress';
    case 'document_uploaded':
    case 'request_created':
    case 'page_changed':
    case 'request_deleted':
    case 'submission_remarks_added':
    case 'status_changed':
    default:
      return 'completed';
  }
}

function mapRow(r) {
  let entityName = r.entity_id;
  if (r.entity_type === 'request' && r.request_display_id) entityName = r.request_display_id;
  else if (r.entity_type === 'template' && r.template_file_name) entityName = r.template_file_name;
  else if (r.entity_type === 'document' && r.document_file_name) entityName = r.document_file_name;

  const normalizedAction = normalizeAction(r);
  const detailsStr = buildHumanDetails({ ...r, action: normalizedAction });

  return {
    id: r.id,
    timestamp: r.created_at,
    action: normalizedAction,
    entityType: r.entity_type,
    entityId: r.entity_id,
    entityName: String(entityName),
    user: r.full_name || r.username || 'System',
    userRole: r.user_role || 'user',
    department: r.department_name || undefined,
    details: detailsStr,
    ipAddress: r.ip_address || undefined,
    requestId: r.entity_type === 'request' ? r.request_display_id : undefined,
    title: titleFromAction(normalizedAction),
    status: statusFromAction(normalizedAction),
  };
}

async function list(filters = {}) {
  const {
    entity_type,
    entity_id,
    user_id,
    request_id,
    date_range,
    from_date,
    to_date,
    limit = 100,
  } = filters;
  const limitVal = Math.min(parseInt(limit, 10) || 100, 500);

  let query = `
    SELECT a.id, a.entity_type, a.entity_id, a.action, a.user_id, a.details, a.ip_address, a.created_at,
           u.username, u.full_name, u.role AS user_role,
           d.name AS department_name,
           req.request_id AS request_display_id,
           req.title AS request_title,
           req_tpl.file_name AS request_template_file_name,
           assigned_u.full_name AS request_assigned_to_name,
           tpl.file_name AS template_file_name,
           doc.file_name AS document_file_name
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    LEFT JOIN departments d ON u.department_id = d.id
    LEFT JOIN requests req ON a.entity_type = 'request' AND a.entity_id = req.id::text
    LEFT JOIN templates req_tpl ON req.template_id = req_tpl.id
    LEFT JOIN users assigned_u ON req.assigned_to = assigned_u.id
    LEFT JOIN templates tpl ON a.entity_type = 'template' AND a.entity_id = tpl.id::text
    LEFT JOIN documents doc ON a.entity_type = 'document' AND a.entity_id = doc.id::text
    WHERE 1=1
  `;
  const params = [];
  let n = 1;
  if (entity_type) {
    query += ` AND a.entity_type = $${n++}`;
    params.push(entity_type);
  }
  if (entity_id) {
    query += ` AND a.entity_id = $${n++}`;
    params.push(entity_id);
  }
  if (user_id) {
    query += ` AND a.user_id = $${n++}`;
    params.push(user_id);
  }
  if (request_id) {
    query += ` AND (req.request_id = $${n} OR (a.entity_type = 'request' AND a.entity_id IN (SELECT id::text FROM requests WHERE request_id = $${n})))`;
    params.push(request_id);
    n++;
  }
  if (date_range === 'today') {
    query += ` AND a.created_at >= CURRENT_DATE AND a.created_at < CURRENT_DATE + INTERVAL '1 day'`;
  } else if (date_range === 'week') {
    query += ` AND a.created_at >= NOW() - INTERVAL '7 days'`;
  } else if (date_range === 'month') {
    query += ` AND a.created_at >= NOW() - INTERVAL '30 days'`;
  } else if (from_date) {
    query += ` AND a.created_at >= $${n++}`;
    params.push(from_date);
  }
  if (to_date && !date_range) {
    query += ` AND a.created_at <= $${n++}`;
    params.push(to_date);
  }
  query += ` ORDER BY a.created_at DESC LIMIT $${n}`;
  params.push(limitVal);

  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return result.rows.map(mapRow);
  } finally {
    client.release();
  }
}

async function insert(entry) {
  const { entity_type, entity_id, action, user_id, details } = entry;
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, user_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        entity_type,
        entity_id,
        action,
        user_id || null,
        details != null ? JSON.stringify(details) : null,
      ]
    );
  } finally {
    client.release();
  }
}

module.exports = { list, insert };
