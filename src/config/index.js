require('dotenv').config();

// Prefer DATABASE_URL (e.g. Aiven); otherwise use individual env vars
// Strip query from URL so pg's parser doesn't override our ssl option (parsed sslmode=require would enforce cert verification)
const rawUrl = (process.env.DATABASE_URL || '').trim();
const invalidHosts = ['base', '']; // placeholders / missing host → DATABASE_URL likely wrong in Cloud Run
if (rawUrl) {
  try {
    const u = new URL(rawUrl.replace(/^postgres:\/\//, 'https://'));
    if (invalidHosts.includes(u.hostname)) {
      console.warn('[config] DATABASE_URL has host "' + u.hostname + '". In Cloud Run, set the DATABASE_URL secret to your real Postgres URL (e.g. Aiven host).');
    }
  } catch (_) {}
}
const dbConfig = rawUrl
  ? {
      connectionString: rawUrl.includes('?') ? rawUrl.replace(/\?.*$/, '') : rawUrl,
      // Use SSL but allow Aiven/cloud self-signed certs (set DB_SSL_REJECT_UNAUTHORIZED=true + CA for strict verify)
      ssl: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' ? true : { rejectUnauthorized: false },
    }
  : {
      host: process.env.DATABASEHOST || 'localhost',
      port: parseInt(process.env.DATABASEPORT || '5432', 10),
      database: process.env.DATABASENAME || 'pharma_dms',
      user: process.env.DATABASEUSER || 'postgres',
      password: process.env.DATABASEPASSWORD || 'postgres',
    };

module.exports = {
  db: dbConfig,
  port: parseInt(process.env.PORT || '4000', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  fileStoragePath: process.env.FILE_STORAGE_PATH || './uploads',
  /** Syncfusion Word Processor Server (Docker) - DOCX to SFDT. e.g. http://localhost:6002 */
  documentEditorServiceUrl: process.env.DOCUMENT_EDITOR_SERVICE_URL || '',
  /** AWS S3 for template file storage (optional). When set, templates are also uploaded to S3. */
  s3: {
    region: process.env.AWS_REGION || 'us-east-1',
    bucket: process.env.AWS_S3_BUCKET_NAME || '',
    prefix: process.env.AWS_S3_PREFIX || '', // e.g. "Pharma DMS" for folder under bucket
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
  /** SMTP for document/notification emails */
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.EMAIL_FROM || process.env.SMTP_USER || '',
    fromName: process.env.EMAIL_FROM_NAME || 'PHARMA DMS',
  },
  /** Fallback domain when user has no email (e.g. username@this-domain) */
  emailDomain: process.env.EMAIL_DOMAIN || 'fedhubsoftware.com',
  /** CORS: comma-separated origins (CLIENT_ORIGIN or CORS_ORIGIN). Default includes localhost + pharma-dms. */
  clientOrigin:
    process.env.CLIENT_ORIGIN ||
    process.env.CORS_ORIGIN ||
    'http://localhost:5173,http://localhost:3000,https://pharma-dms.fedhubsoftware.com',
};
