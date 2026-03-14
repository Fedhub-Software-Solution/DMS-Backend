const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const auditLogController = require('../controllers/auditLogController');

const router = express.Router();
router.use(authMiddleware);

router.get('/', auditLogController.list);

module.exports = router;
