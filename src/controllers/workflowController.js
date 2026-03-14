const workflowService = require('../services/workflowService');

async function list(req, res) {
  try {
    const { template_id, department_id, is_active } = req.query;
    const rows = await workflowService.listWorkflows({ template_id, department_id, is_active });
    res.json(rows);
  } catch (err) {
    console.error('Workflows list error:', err);
    res.status(500).json({ error: 'Failed to list workflows' });
  }
}

async function getById(req, res) {
  try {
    const workflow = await workflowService.getWorkflowById(req.params.id);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    res.json(workflow);
  } catch (err) {
    console.error('Workflow get error:', err);
    res.status(500).json({ error: 'Failed to get workflow' });
  }
}

async function create(req, res) {
  try {
    const body = req.body || {};
    const result = await workflowService.createWorkflow({
      name: body.name,
      description: body.description,
      is_active: body.is_active,
      applies_to_template_id: body.applies_to_template_id,
      applies_to_department_id: body.applies_to_department_id,
    });
    res.status(201).json(result);
  } catch (err) {
    console.error('Workflow create error:', err);
    res.status(500).json({ error: 'Failed to create workflow' });
  }
}

async function update(req, res) {
  try {
    const result = await workflowService.updateWorkflow(req.params.id, req.body || {});
    if (!result) return res.status(400).json({ error: 'No fields to update' });
    res.json(result);
  } catch (err) {
    console.error('Workflow update error:', err);
    res.status(500).json({ error: 'Failed to update workflow' });
  }
}

async function getSteps(req, res) {
  try {
    const workflow = await workflowService.getWorkflowById(req.params.id);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    const steps = await workflowService.getWorkflowSteps(req.params.id);
    res.json(steps);
  } catch (err) {
    console.error('Workflow steps get error:', err);
    res.status(500).json({ error: 'Failed to get workflow steps' });
  }
}

async function updateSteps(req, res) {
  try {
    const workflow = await workflowService.getWorkflowById(req.params.id);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    const steps = await workflowService.updateWorkflowSteps(req.params.id, req.body);
    res.json(steps);
  } catch (err) {
    console.error('Workflow steps update error:', err);
    res.status(500).json({ error: 'Failed to update workflow steps' });
  }
}

module.exports = { list, getById, create, update, getSteps, updateSteps };
