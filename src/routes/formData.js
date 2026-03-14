const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const formDataController = require('../controllers/formDataController');

const router = express.Router();
router.use(authMiddleware);

router.get('/:id/form-data', formDataController.getFormData);
router.put('/:id/form-data', formDataController.putFormData);

module.exports = router;
