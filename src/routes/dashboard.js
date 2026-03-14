const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const dashboardController = require('../controllers/dashboardController');

const router = express.Router();
router.use(authMiddleware);

router.get('/summary', dashboardController.summary);

module.exports = router;
