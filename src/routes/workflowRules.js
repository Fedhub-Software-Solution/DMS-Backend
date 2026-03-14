const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const workflowRuleController = require('../controllers/workflowRuleController');

const router = express.Router();
router.use(authMiddleware);

router.get('/', workflowRuleController.list);
router.get('/:id', workflowRuleController.getById);
router.post('/', workflowRuleController.create);
router.patch('/:id', workflowRuleController.update);

module.exports = router;
