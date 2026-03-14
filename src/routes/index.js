const express = require('express');
const auth = require('./auth');
const departments = require('./departments');
const users = require('./users');
const templates = require('./templates');
const requests = require('./requests');
const formData = require('./formData');
const documents = require('./documents');
const auditLogs = require('./auditLogs');
const dashboard = require('./dashboard');
const workflows = require('./workflows');
const workflowRules = require('./workflowRules');

const router = express.Router();

router.use('/auth', auth);
router.use('/dashboard', dashboard);
router.use('/departments', departments);
router.use('/users', users);
router.use('/templates', templates);
router.use('/requests', requests);
router.use('/requests', formData);
router.use('/documents', documents);
router.use('/audit-logs', auditLogs);
router.use('/workflows', workflows);
router.use('/workflow-rules', workflowRules);

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'pharma-dms-api' });
});

module.exports = router;
