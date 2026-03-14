const express = require('express');
const proxy = require('express-http-proxy');
const routes = require('./routes');
const fileStorage = require('./services/fileStorage');
const config = require('./config');

const app = express();

// CORS: CORS_ORIGIN = comma-separated list (e.g. https://pharma-dms.fedhubsoftware.com). Empty = allow all.
const allowedOrigins =
  config.corsOrigin && config.corsOrigin.trim()
    ? config.corsOrigin.split(',').map((o) => o.trim().replace(/\/$/, ''))
    : null; // null = allow any origin

function getCorsOrigin(req) {
  const origin = req.get('Origin');
  if (!origin) return allowedOrigins === null ? '*' : null;
  const normalized = origin.replace(/\/$/, '');
  if (allowedOrigins === null) return normalized;
  return allowedOrigins.includes(normalized) ? normalized : null;
}

app.use((req, res, next) => {
  const allowOrigin = getCorsOrigin(req);
  const originToSet = allowOrigin || (allowedOrigins === null ? req.get('Origin') || '*' : null);
  if (originToSet) {
    res.setHeader('Access-Control-Allow-Origin', originToSet);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
// Proxy Syncfusion Word Processor Server (Docker) before body parsers so multipart streams through
if (config.documentEditorServiceUrl) {
  app.use(
    '/api/document-editor',
    proxy(config.documentEditorServiceUrl, {
      proxyReqPathResolver: (req) => {
        const base = '/api/documenteditor';
        const path = req.originalUrl.replace(/^\/api\/document-editor\/?/, '') || '';
        return path ? `${base}/${path}` : base;
      },
      parseReqBody: false,
    })
  );
}
app.use(express.json({ limit: '100mb' }));
// Allow larger multipart bodies for template/document uploads (multer uses this)
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

const templatesDir = fileStorage.getUploadDir('templates');
const documentsDir = fileStorage.getUploadDir('documents');
console.log('[App] Upload directories ready:', { templates: templatesDir, documents: documentsDir });

app.use('/api', routes);

app.use((err, req, res, _next) => {
  console.error(err);
  const allowOrigin = getCorsOrigin(req);
  if (allowOrigin || allowedOrigins === null) {
    const originToSet = allowOrigin || req.get('Origin') || '*';
    res.setHeader('Access-Control-Allow-Origin', originToSet);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.status(500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
