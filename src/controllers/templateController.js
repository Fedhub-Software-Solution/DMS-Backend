const path = require('path');
const Busboy = require('busboy');
const fileStorage = require('../services/fileStorage');
const templateService = require('../services/templateService');
const emailService = require('../services/emailService');

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    let file = null;
    let fileDone = Promise.resolve();
    const busboy = Busboy({ headers: req.headers });
    busboy.on('field', (name, value) => { fields[name] = value; });
    busboy.on('file', (name, stream, info) => {
      if (name !== 'file') { stream.resume(); return; }
      const chunks = [];
      fileDone = new Promise((res, rej) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          file = { buffer: Buffer.concat(chunks), originalname: info.filename, mimetype: info.mimeType };
          res();
        });
        stream.on('error', rej);
      });
    });
    busboy.on('finish', () => fileDone.then(() => resolve({ file, fields })).catch(reject));
    busboy.on('error', reject);
    req.pipe(busboy);
  });
}

async function list(req, res) {
  try {
    const { department_id, status } = req.query;
    const rows = await templateService.list({ department_id, status });
    res.json(rows);
  } catch (err) {
    console.error('Templates list error:', err);
    res.status(500).json({ error: 'Failed to list templates' });
  }
}

async function getById(req, res) {
  try {
    const template = await templateService.getById(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (err) {
    console.error('Template get error:', err);
    res.status(500).json({ error: 'Failed to get template' });
  }
}

async function getFile(req, res) {
  try {
    const fileInfo = await templateService.getFileInfo(req.params.id);
    if (!fileInfo) {
      return res.status(404).json({ error: 'Template not found' });
    }
    if (!fileStorage.fileExists(fileInfo.file_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }
    const absolutePath = fileStorage.getAbsolutePath(fileInfo.file_path);
    const ext = path.extname(fileInfo.file_name).toLowerCase();
    const mime = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
    };
    res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${fileInfo.file_name}"`);
    res.sendFile(absolutePath);
  } catch (err) {
    console.error('Template file error:', err);
    res.status(500).json({ error: 'Failed to serve file' });
  }
}

async function upload(req, res) {
  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'Expected multipart/form-data' });
    }
    const { file, fields } = await parseMultipart(req);
    if (!file || !file.buffer || !file.originalname) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const result = await templateService.upload(file, fields, req.user.id);
    res.status(201).json(result);
    if (emailService.isEmailConfigured()) {
      emailService
        .sendTemplateUploadNotification({
          template: result,
          uploaderUserId: req.user.id,
        })
        .catch((err) => console.error('Template upload email error:', err));
    }
  } catch (err) {
    console.error('Template upload error:', err);
    res.status(500).json({ error: 'Failed to upload template' });
  }
}

async function update(req, res) {
  try {
    const { file_name, department_id, status, parsed_sections } = req.body || {};
    const result = await templateService.update(req.params.id, {
      file_name,
      department_id,
      status,
      parsed_sections,
    });
    if (!result) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    res.json(result);
  } catch (err) {
    console.error('Template patch error:', err);
    res.status(500).json({ error: 'Failed to update template' });
  }
}

async function getDownload(req, res) {
  try {
    const expiresIn = Math.min(
      parseInt(req.query.expiresIn, 10) || 3600,
      86400
    );
    const info = await templateService.getDownloadInfo(req.params.id, expiresIn);
    if (!info) {
      return res.status(404).json({
        error: 'Download not available for this template',
        message: 'File is served via GET /templates/:id/file when not stored in S3.',
      });
    }
    res.json(info);
  } catch (err) {
    console.error('Template download error:', err);
    res.status(500).json({ error: 'Failed to get download URL' });
  }
}

module.exports = { list, getById, getFile, upload, update, getDownload };
