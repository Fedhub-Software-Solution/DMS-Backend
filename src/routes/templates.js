const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const templateController = require('../controllers/templateController');

const router = express.Router();
router.use(authMiddleware);

router.get('/', templateController.list);
router.get('/:id/download', templateController.getDownload);
router.get('/:id/file', templateController.getFile);
router.get('/:id', templateController.getById);
router.post('/', templateController.upload);
router.patch('/:id', templateController.update);

module.exports = router;
