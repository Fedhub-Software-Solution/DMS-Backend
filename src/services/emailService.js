const nodemailer = require('nodemailer');
const { pool } = require('../db/pool');
const config = require('../config');

let transporter = null;

function isEmailConfigured() {
  const { host, user, password } = config.smtp || {};
  return !!(host && user && password);
}

function getTransport() {
  if (!isEmailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.password,
      },
    });
  }
  return transporter;
}

/**
 * Resolve user ids to notification addresses and names.
 * Returns array of { email, fullName }. Uses user.email if set, else username@emailDomain.
 */
async function getUsersForNotification(userIds) {
  if (!userIds || userIds.length === 0) return [];
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, full_name, email, username FROM users WHERE id = ANY($1::uuid[])`,
      [userIds.filter(Boolean)]
    );
    const domain = config.emailDomain || 'fedhubsoftware.com';
    return result.rows.map((r) => ({
      email: (r.email && r.email.trim()) ? r.email.trim() : `${(r.username || '').replace(/\s+/g, '')}@${domain}`,
      fullName: r.full_name || r.username || 'User',
    }));
  } finally {
    client.release();
  }
}

async function getAdminsForNotification() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, full_name, email, username FROM users WHERE role = $1`,
      ['admin']
    );
    const domain = config.emailDomain || 'fedhubsoftware.com';
    return result.rows.map((r) => ({
      email: (r.email && r.email.trim()) ? r.email.trim() : `${(r.username || '').replace(/\s+/g, '')}@${domain}`,
      fullName: r.full_name || r.username || 'Admin',
    }));
  } finally {
    client.release();
  }
}

/**
 * Get request owner and assignee user ids for a request.
 */
async function getRequestNotifyUserIds(requestId) {
  if (!requestId) return [];
  const client = await pool.connect();
  try {
    const r = await client.query(
      'SELECT created_by, assigned_to FROM requests WHERE id = $1',
      [requestId]
    );
    const row = r.rows[0];
    if (!row) return [];
    const ids = [row.created_by, row.assigned_to].filter(Boolean);
    return [...new Set(ids)];
  } finally {
    client.release();
  }
}

function sendMail(options) {
  const transport = getTransport();
  if (!transport) {
    console.warn('Email not configured; skipping send.');
    return Promise.resolve();
  }
  const from = config.smtp.fromName
    ? `"${config.smtp.fromName}" <${config.smtp.from}>`
    : config.smtp.from;
  return transport.sendMail({ from, ...options }).catch((err) => {
    console.error('Email send error:', err.message);
  });
}

/**
 * Send notification after document upload.
 * Recipients: uploader (confirmation), request owner/assignee if request_id present.
 */
async function sendDocumentUploadNotification(payload) {
  const { document, uploaderUserId, requestId } = payload;
  if (!document || !uploaderUserId) return;

  const recipientIds = [uploaderUserId];
  if (requestId) {
    const requestUserIds = await getRequestNotifyUserIds(requestId);
    recipientIds.push(...requestUserIds);
  }

  const recipients = await getUsersForNotification([...new Set(recipientIds)]);
  if (recipients.length === 0) return;

  const subject = `Document uploaded: ${document.fileName}`;
  const text = [
    `A document has been uploaded to PHARMA DMS.`,
    ``,
    `Document: ${document.fileName}`,
    `Version: ${document.version || 1}`,
    requestId ? `Request ID: ${requestId}` : '',
    `Uploaded at: ${document.createdAt || new Date().toISOString()}`,
  ].filter(Boolean).join('\n');

  const html = `
    <p>A document has been uploaded to <strong>PHARMA DMS</strong>.</p>
    <p><strong>Document:</strong> ${escapeHtml(document.fileName)}</p>
    <p><strong>Version:</strong> ${document.version || 1}</p>
    ${requestId ? `<p><strong>Request ID:</strong> ${escapeHtml(String(requestId))}</p>` : ''}
    <p><strong>Uploaded at:</strong> ${escapeHtml(String(document.createdAt || new Date().toISOString()))}</p>
  `;

  for (const to of recipients) {
    await sendMail({
      to: to.email,
      subject,
      text,
      html,
    });
  }
}

/**
 * Send notification when a template is uploaded (Document Upload).
 * Recipients: uploader; CC: all admins.
 */
async function sendTemplateUploadNotification(payload) {
  const { template, uploaderUserId } = payload;
  if (!template || !uploaderUserId) return;

  const [uploader] = await getUsersForNotification([uploaderUserId]);
  const admins = await getAdminsForNotification();
  if (!uploader && admins.length === 0) return;

  const subject = `Template uploaded: ${template.fileName}`;
  const text = [
    `A template has been uploaded to PHARMA DMS (Document Upload).`,
    ``,
    `Template: ${template.fileName}`,
    template.departmentName ? `Department: ${template.departmentName}` : '',
    `Status: ${template.status || 'draft'}`,
    `Uploaded at: ${template.uploadDate || new Date().toISOString()}`,
  ].filter(Boolean).join('\n');

  const html = `
    <p>A template has been uploaded to <strong>PHARMA DMS</strong> (Document Upload).</p>
    <p><strong>Template:</strong> ${escapeHtml(template.fileName)}</p>
    ${template.departmentName ? `<p><strong>Department:</strong> ${escapeHtml(String(template.departmentName))}</p>` : ''}
    <p><strong>Status:</strong> ${escapeHtml(String(template.status || 'draft'))}</p>
    <p><strong>Uploaded at:</strong> ${escapeHtml(String(template.uploadDate || new Date().toISOString()))}</p>
  `;

  const cc = admins.map((a) => a.email).filter(Boolean);
  if (uploader && uploader.email) {
    await sendMail({
      to: uploader.email,
      cc,
      subject,
      text,
      html,
    });
  } else if (cc.length > 0) {
    await sendMail({
      to: cc[0],
      cc: cc.slice(1),
      subject,
      text,
      html,
    });
  }
}

/**
 * Send notification when a request is (re)assigned.
 * Typical flow: preparator -> reviewer, reviewer -> approver.
 * Recipients: new assignee (To); CC: actor (who assigned) and all admins.
 */
async function sendRequestAssignmentNotification(payload) {
  const { requestId, actorUserId, newAssigneeId } = payload;
  if (!requestId || !actorUserId || !newAssigneeId) return;

  const client = await pool.connect();
  try {
    const q = await client.query(
      `SELECT r.request_id, r.title, t.file_name AS template_file_name
       FROM requests r
       LEFT JOIN templates t ON r.template_id = t.id
       WHERE r.id = $1`,
      [requestId]
    );
    const row = q.rows[0];
    if (!row) return;

    const [actor] = await getUsersForNotification([actorUserId]);
    const [assignee] = await getUsersForNotification([newAssigneeId]);
    const admins = await getAdminsForNotification();
    if (!assignee || !assignee.email) return;

    const subject = `Request assignment: ${row.request_id || row.title || row.template_file_name || 'Request'}`;
    const text = [
      `A request has been assigned in PHARMA DMS.`,
      ``,
      row.request_id ? `Request ID: ${row.request_id}` : '',
      row.title ? `Title: ${row.title}` : '',
      row.template_file_name ? `Template: ${row.template_file_name}` : '',
      actor && actor.fullName ? `Assigned by: ${actor.fullName}` : '',
      `Assigned to: ${assignee.fullName || assignee.email}`,
      `Assigned at: ${new Date().toISOString()}`,
    ].filter(Boolean).join('\n');

    const html = `
      <p>A request has been assigned in <strong>PHARMA DMS</strong>.</p>
      ${row.request_id ? `<p><strong>Request ID:</strong> ${escapeHtml(String(row.request_id))}</p>` : ''}
      ${row.title ? `<p><strong>Title:</strong> ${escapeHtml(String(row.title))}</p>` : ''}
      ${row.template_file_name ? `<p><strong>Template:</strong> ${escapeHtml(String(row.template_file_name))}</p>` : ''}
      ${actor && actor.fullName ? `<p><strong>Assigned by:</strong> ${escapeHtml(actor.fullName)}</p>` : ''}
      <p><strong>Assigned to:</strong> ${escapeHtml(assignee.fullName || assignee.email)}</p>
      <p><strong>Assigned at:</strong> ${escapeHtml(new Date().toISOString())}</p>
    `;

    const cc = [
      ...(actor && actor.email ? [actor.email] : []),
      ...admins.map((a) => a.email).filter(Boolean),
    ];

    await sendMail({
      to: assignee.email,
      cc,
      subject,
      text,
      html,
    });
  } finally {
    client.release();
  }
}

/**
 * Send notification when an admin changes a request status.
 * Recipients: all participants (creator, assignee, reviewers), excluding the admin;
 * each gets an email with admins in CC.
 */
async function sendRequestStatusNotification(payload) {
  const { requestId, actorUserId, oldStatus, newStatus } = payload;
  if (!requestId || !newStatus || oldStatus === newStatus) return;

  const client = await pool.connect();
  try {
    const q = await client.query(
      `SELECT r.request_id, r.title, r.created_by, r.assigned_to, r.review_sequence,
              t.file_name AS template_file_name
       FROM requests r
       LEFT JOIN templates t ON r.template_id = t.id
       WHERE r.id = $1`,
      [requestId]
    );
    const row = q.rows[0];
    if (!row) return;

    const participantIds = new Set();
    if (row.created_by) participantIds.add(row.created_by);
    if (row.assigned_to) participantIds.add(row.assigned_to);
    if (row.review_sequence) {
      try {
        const seq = Array.isArray(row.review_sequence)
          ? row.review_sequence
          : JSON.parse(row.review_sequence);
        if (Array.isArray(seq)) {
          seq.forEach((id) => {
            if (id) participantIds.add(id);
          });
        }
      } catch {
        // ignore parse errors
      }
    }
    if (actorUserId) participantIds.delete(actorUserId);

    const recipients = await getUsersForNotification([...participantIds]);
    const admins = await getAdminsForNotification();
    if (recipients.length === 0 && admins.length === 0) return;

    const subject = `Request status updated: ${row.request_id || row.title || row.template_file_name || 'Request'}`;
    const text = [
      `A request status has been updated in PHARMA DMS.`,
      ``,
      row.request_id ? `Request ID: ${row.request_id}` : '',
      row.title ? `Title: ${row.title}` : '',
      row.template_file_name ? `Template: ${row.template_file_name}` : '',
      `Previous status: ${oldStatus}`,
      `New status: ${newStatus}`,
      `Updated at: ${new Date().toISOString()}`,
    ].filter(Boolean).join('\n');

    const html = `
      <p>A request status has been updated in <strong>PHARMA DMS</strong>.</p>
      ${row.request_id ? `<p><strong>Request ID:</strong> ${escapeHtml(String(row.request_id))}</p>` : ''}
      ${row.title ? `<p><strong>Title:</strong> ${escapeHtml(String(row.title))}</p>` : ''}
      ${row.template_file_name ? `<p><strong>Template:</strong> ${escapeHtml(String(row.template_file_name))}</p>` : ''}
      <p><strong>Previous status:</strong> ${escapeHtml(oldStatus)}</p>
      <p><strong>New status:</strong> ${escapeHtml(newStatus)}</p>
      <p><strong>Updated at:</strong> ${escapeHtml(new Date().toISOString())}</p>
    `;

    const adminEmails = admins.map((a) => a.email).filter(Boolean);

    if (recipients.length > 0) {
      for (const r of recipients) {
        if (!r.email) continue;
        await sendMail({
          to: r.email,
          cc: adminEmails,
          subject,
          text,
          html,
        });
      }
    } else if (adminEmails.length > 0) {
      await sendMail({
        to: adminEmails[0],
        cc: adminEmails.slice(1),
        subject,
        text,
        html,
      });
    }
  } finally {
    client.release();
  }
}

/**
 * Send notification when document status is updated.
 * Recipients: document creator, request owner/assignee (if linked).
 */
async function sendDocumentStatusChangeNotification(payload) {
  const { documentId, fileName, requestId, oldStatus, newStatus, updatedByUserId, createdByUserId } = payload;
  if (!fileName || oldStatus === newStatus) return;

  const recipientIds = [createdByUserId].filter(Boolean);
  if (requestId) {
    const requestUserIds = await getRequestNotifyUserIds(requestId);
    recipientIds.push(...requestUserIds);
  }
  const recipientSet = new Set(recipientIds);
  if (updatedByUserId) recipientSet.delete(updatedByUserId);
  const recipients = await getUsersForNotification([...recipientSet]);
  if (recipients.length === 0) return;

  const subject = `Document status updated: ${fileName}`;
  const text = [
    `A document status has been updated in PHARMA DMS.`,
    ``,
    `Document: ${fileName}`,
    `Previous status: ${oldStatus}`,
    `New status: ${newStatus}`,
    requestId ? `Request ID: ${requestId}` : '',
    `Updated at: ${new Date().toISOString()}`,
  ].filter(Boolean).join('\n');

  const html = `
    <p>A document status has been updated in <strong>PHARMA DMS</strong>.</p>
    <p><strong>Document:</strong> ${escapeHtml(fileName)}</p>
    <p><strong>Previous status:</strong> ${escapeHtml(oldStatus)}</p>
    <p><strong>New status:</strong> ${escapeHtml(newStatus)}</p>
    ${requestId ? `<p><strong>Request ID:</strong> ${escapeHtml(String(requestId))}</p>` : ''}
    <p><strong>Updated at:</strong> ${escapeHtml(new Date().toISOString())}</p>
  `;

  for (const to of recipients) {
    await sendMail({
      to: to.email,
      subject,
      text,
      html,
    });
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  isEmailConfigured,
  getTransport,
  getUsersForNotification,
  getAdminsForNotification,
  sendDocumentUploadNotification,
  sendDocumentStatusChangeNotification,
  sendTemplateUploadNotification,
  sendRequestAssignmentNotification,
  sendRequestStatusNotification,
  sendMail,
};
