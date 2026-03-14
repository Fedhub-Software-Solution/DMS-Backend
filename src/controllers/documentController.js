const path = require('path');
const fileStorage = require('../services/fileStorage');
const documentService = require('../services/documentService');
const emailService = require('../services/emailService');

async function list(req, res) {
  try {
    const { request_id, status, department_id } = req.query;
    const filters = { request_id, status, department_id };
    const role = (req.user && req.user.role ? req.user.role : '').toLowerCase();
    const userId = req.user && req.user.id;
    // When listing without a specific request_id, scope by user: preparator sees their requests' docs, reviewer/approver sees assigned requests' docs, admin sees all.
    if (userId && !request_id) {
      if (role === 'admin') {
        // Admin: no extra filter
      } else if (role.includes('preparator')) {
        filters.created_by = userId;
      } else if (role.includes('reviewer') || role.includes('approver')) {
        filters.assigned_to = userId;
      } else {
        // Other roles: scope to created_by or assigned_to so they see only their requests' documents
        filters.created_by = userId;
        filters.assigned_to = userId;
      }
    }
    const rows = await documentService.list(filters);
    res.json(rows);
  } catch (err) {
    console.error('Documents list error:', err);
    res.status(500).json({ error: 'Failed to list documents' });
  }
}

async function getById(req, res) {
  try {
    const doc = await documentService.getById(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(doc);
  } catch (err) {
    console.error('Document get error:', err);
    res.status(500).json({ error: 'Failed to get document' });
  }
}

async function getFile(req, res) {
  try {
    const fileInfo = await documentService.getFileInfo(req.params.id);
    if (!fileInfo) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (!fileStorage.fileExists(fileInfo.file_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }
    const absolutePath = fileStorage.getAbsolutePath(fileInfo.file_path);
    const ext = path.extname(fileInfo.file_name).toLowerCase();
    const mime = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${fileInfo.file_name}"`);
    res.sendFile(absolutePath);
  } catch (err) {
    console.error('Document file error:', err);
    res.status(500).json({ error: 'Failed to serve file' });
  }
}

async function upload(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const { request_id } = req.body || {};
    const result = await documentService.create(req.file, request_id, req.user.id);
    res.status(201).json(result);
    if (emailService.isEmailConfigured()) {
      emailService
        .sendDocumentUploadNotification({
          document: result,
          uploaderUserId: req.user.id,
          requestId: result.requestId || request_id,
        })
        .catch((err) => console.error('Document upload email error:', err));
    }
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({ error: err.message });
    }
    console.error('Document upload error:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
}

async function update(req, res) {
  try {
    const { status } = req.body || {};
    if (status === undefined) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    const docBefore = await documentService.getById(req.params.id);
    if (!docBefore) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const result = await documentService.updateStatus(req.params.id, status);
    if (!result) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(result);
    if (emailService.isEmailConfigured() && docBefore.status !== result.status) {
      emailService
        .sendDocumentStatusChangeNotification({
          documentId: result.id,
          fileName: docBefore.fileName,
          requestId: docBefore.requestId,
          oldStatus: docBefore.status,
          newStatus: result.status,
          updatedByUserId: req.user.id,
          createdByUserId: docBefore.createdBy,
        })
        .catch((err) => console.error('Document status change email error:', err));
    }
  } catch (err) {
    console.error('Document patch error:', err);
    res.status(500).json({ error: 'Failed to update document' });
  }
}

module.exports = { list, getById, getFile, upload, update };
