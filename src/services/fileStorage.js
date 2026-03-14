const fs = require('fs');
const path = require('path');
const config = require('../config');

const basePath = path.isAbsolute(config.fileStoragePath)
  ? config.fileStoragePath
  : path.join(__dirname, '..', '..', config.fileStoragePath);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getUploadDir(subdir = '') {
  const dir = subdir ? path.join(basePath, subdir) : basePath;
  ensureDir(dir);
  return dir;
}

function getFilePath(subdir, filename) {
  const dir = getUploadDir(subdir);
  return path.join(dir, filename);
}

function saveFile(subdir, filename, buffer) {
  const filePath = getFilePath(subdir, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

function getAbsolutePath(relativePath) {
  const full = path.isAbsolute(relativePath) ? relativePath : path.join(basePath, relativePath);
  return path.resolve(full);
}

function fileExists(relativePath) {
  const full = getAbsolutePath(relativePath);
  return fs.existsSync(full);
}

module.exports = {
  basePath,
  ensureDir,
  getUploadDir,
  getFilePath,
  saveFile,
  getAbsolutePath,
  fileExists,
};
