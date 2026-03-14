const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const workflowController = require('../controllers/workflowController');

const router = express.Router();
router.use(authMiddleware);

router.get('/', workflowController.list);
router.post('/', workflowController.create);
router.get('/:id/steps', workflowController.getSteps);
router.put('/:id/steps', workflowController.updateSteps);
router.get('/:id', workflowController.getById);
router.patch('/:id', workflowController.update);

module.exports = router;
