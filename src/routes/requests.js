const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const requestController = require('../controllers/requestController');

const router = express.Router();
router.use(authMiddleware);

router.get('/', requestController.list);
router.get('/:id/activity', requestController.getActivity);
router.get('/:id/workflow', requestController.getWorkflow);
router.post('/:id/workflow/actions', requestController.workflowAction);
router.get('/:id/page-remarks', requestController.listPageRemarks);
router.put('/:id/page-remarks/:page', requestController.savePageRemark);
router.get('/:id', requestController.getById);
router.post('/', requestController.create);
router.patch('/:id', requestController.update);
router.delete('/:id', requestController.remove);

module.exports = router;
