const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const userController = require('../controllers/userController');

const router = express.Router();
router.use(authMiddleware);

router.get('/', userController.list);
router.post('/', userController.create);
router.post('/validate-for-document', userController.validateForDocument);

module.exports = router;
