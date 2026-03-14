const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const departmentController = require('../controllers/departmentController');

const router = express.Router();
router.use(authMiddleware);

router.get('/', departmentController.list);

module.exports = router;
