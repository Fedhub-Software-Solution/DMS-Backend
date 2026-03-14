const config = require('../config');

let client = null;

function getClient() {
  if (client) return client;
  const { bucket, region, accessKeyId, secretAccessKey } = config.s3 || {};
  if (!bucket) return null;
  const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
  } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const credentials =
    accessKeyId && secretAccessKey
      ? { accessKeyId, secretAccessKey }
      : undefined;
  client = new S3Client({
    region: region || 'us-east-1',
    ...(credentials && { credentials }),
  });
  client._getSignedUrl = getSignedUrl;
  client._GetObjectCommand = GetObjectCommand;
  return client;
}

function isS3Configured() {
  return !!(config.s3 && config.s3.bucket);
}

/**
 * Upload a file to S3.
 * @param {string} bucket - Bucket name
 * @param {string} key - Object key
 * @param {Buffer} body - File buffer
 * @param {string} [contentType] - e.g. application/vnd.openxmlformats-officedocument.wordprocessingml.document
 * @param {object} [metadata] - Optional metadata
 * @returns {Promise<void>}
 */
async function uploadFile(bucket, key, body, contentType, metadata = {}) {
  const c = getClient();
  if (!c) throw new Error('S3 is not configured');
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType || 'application/octet-stream',
    Metadata: metadata,
  });
  await c.send(cmd);
}

/**
 * Generate a presigned URL for GET (download). Default expiry 1 hour.
 * @param {string} bucket
 * @param {string} key
 * @param {number} [expiresIn=3600]
 * @returns {Promise<string>}
 */
async function getPresignedDownloadUrl(bucket, key, expiresIn = 3600) {
  const c = getClient();
  if (!c) throw new Error('S3 is not configured');
  const cmd = new c._GetObjectCommand({ Bucket: bucket, Key: key });
  return c._getSignedUrl(c, cmd, { expiresIn });
}

/**
 * Delete an object from S3.
 */
async function deleteFile(bucket, key) {
  const c = getClient();
  if (!c) throw new Error('S3 is not configured');
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  await c.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * Get object metadata (size, lastModified). Returns null if not found.
 */
async function getFileMetadata(bucket, key) {
  const c = getClient();
  if (!c) return null;
  const { HeadObjectCommand } = require('@aws-sdk/client-s3');
  try {
    const res = await c.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return {
      contentLength: res.ContentLength,
      lastModified: res.LastModified,
    };
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

module.exports = {
  getClient,
  isS3Configured,
  uploadFile,
  getPresignedDownloadUrl,
  deleteFile,
  getFileMetadata,
};
