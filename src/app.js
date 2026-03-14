const express = require('express');
const cors = require('cors');
const proxy = require('express-http-proxy');
const routes = require('./routes');
const fileStorage = require('./services/fileStorage');
const config = require('./config');

const app = express();

app.use(cors());
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
