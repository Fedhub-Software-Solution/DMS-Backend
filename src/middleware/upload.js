const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fileStorage = require('../services/fileStorage');

// Use memory storage to avoid diskStorage hanging on some Windows setups; route will write file manually
function makeMemoryUpload(options = {}) {
  const limits = options.limits || { fileSize: 50 * 1024 * 1024 }; // 50MB
  const fileFilter = options.fileFilter || (() => true);
  return multer({ storage: multer.memoryStorage(), limits, fileFilter });
}

function makeUploadMiddleware(subdir, options = {}) {
  const dir = fileStorage.getUploadDir(subdir);
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || path.extname(file.mimetype);
      const name = `${uuidv4()}${ext}`;
      cb(null, name);
    },
  });
  const limits = options.limits || { fileSize: 50 * 1024 * 1024 }; // 50MB default
  const fileFilter = options.fileFilter || (() => true);
  return multer({ storage, limits, fileFilter });
}

const templatesUpload = makeMemoryUpload(); // memory then manual write (avoids diskStorage hang)
const documentsUpload = makeUploadMiddleware('documents');

module.exports = {
  makeUploadMiddleware,
  templatesUpload,
  documentsUpload,
};
