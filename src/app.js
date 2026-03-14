const express = require('express');
const cors = require('cors');
const proxy = require('express-http-proxy');
const routes = require('./routes');
const fileStorage = require('./services/fileStorage');
const config = require('./config');

const app = express();

// CORS: use CORS_ORIGIN in production (exact frontend URL); empty = allow all (dev)
const allowedOrigins = config.corsOrigin
  ? config.corsOrigin.split(',').map((o) => o.trim().replace(/\/$/, ''))
  : [];
app.use(
  cors({
    origin:
      allowedOrigins.length === 0
        ? true
        : (origin, cb) => {
            const normalized = origin ? origin.replace(/\/$/, '') : '';
            if (!origin || allowedOrigins.includes(normalized)) return cb(null, true);
            return cb(null, false);
          },
    credentials: true,
  })
);
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

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
