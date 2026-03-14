const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const proxy = require('express-http-proxy');
const routes = require('./routes');
const fileStorage = require('./services/fileStorage');
const config = require('./config');
const { pool } = require('./db/pool');

const app = express();

// Security headers (per reference app.ts)
app.use(helmet());

// CORS: same pattern as reference app.ts – CLIENT_ORIGIN / CORS_ORIGIN, comma-separated; allow localhost + pharma-dms hostnames
const allowedOrigins = (config.clientOrigin || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

function isLocalhostOrPharmaDms(origin) {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === 'pharma-dms.fedhubsoftware.com' ||
      host === 'www.pharma-dms.fedhubsoftware.com'
    );
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients or same-origin requests
      if (!origin) {
        callback(null, true);
        return;
      }
      const normalized = origin.trim().replace(/\/$/, '');
      // Always allow localhost and pharma-dms hostnames for dev/prod
      if (isLocalhostOrPharmaDms(normalized)) {
        callback(null, true);
        return;
      }
      // Check against configured allowed origins
      if (allowedOrigins.length === 0 || allowedOrigins.includes(normalized)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  })
);

// Proxy Syncfusion Word Processor Server (Docker) before body parsers so multipart streams through
if (config.documentEditorServiceUrl) {
  const syncfusionTarget = config.documentEditorServiceUrl;
  app.use(
    '/api/document-editor',
    proxy(syncfusionTarget, {
      proxyReqPathResolver: (req) => {
        const base = '/api/documenteditor';
        const path = (req.originalUrl || '').replace(/^\/api\/document-editor\/?/, '').trim() || '';
        return path ? `${base}/${path}` : base;
      },
      parseReqBody: false,
      proxyErrorHandler: (err, _req, res) => {
        console.error('[Syncfusion proxy]', err.message || err);
        res.status(502).json({ error: 'Document editor service unavailable' });
      },
    })
  );
}

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Request logging (per reference app.ts)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

const templatesDir = fileStorage.getUploadDir('templates');
const documentsDir = fileStorage.getUploadDir('documents');
console.log('[App] Upload directories ready:', { templates: templatesDir, documents: documentsDir });

// Root health with DB check (per reference app.ts)
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      error: err.message || 'Database connection failed',
    });
  }
});

app.use('/api', routes);

// Central error handler – ensure CORS headers on error responses
app.use((err, req, res, _next) => {
  console.error(err);
  const origin = req.get('Origin');
  const normalized = origin ? origin.trim().replace(/\/$/, '') : '';
  const allow =
    !origin ||
    isLocalhostOrPharmaDms(normalized) ||
    allowedOrigins.length === 0 ||
    allowedOrigins.includes(normalized);
  if (allow && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.status(500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
