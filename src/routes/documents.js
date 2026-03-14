const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { documentsUpload } = require('../middleware/upload');
const documentController = require('../controllers/documentController');

const router = express.Router();
router.use(authMiddleware);

router.get('/', documentController.list);
router.get('/:id', documentController.getById);
router.get('/:id/file', documentController.getFile);
router.post('/', documentsUpload.single('file'), documentController.upload);
router.patch('/:id', documentController.update);

module.exports = router;
