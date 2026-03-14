const workflowRuleService = require('../services/workflowRuleService');

async function list(req, res) {
  try {
    const { template_id, department_id, is_active } = req.query;
    const rows = await workflowRuleService.listRules({ template_id, department_id, is_active });
    res.json(rows);
  } catch (err) {
    console.error('Workflow rules list error:', err);
    res.status(500).json({ error: 'Failed to list workflow rules' });
  }
}

async function getById(req, res) {
  try {
    const rule = await workflowRuleService.getRuleById(req.params.id);
    if (!rule) return res.status(404).json({ error: 'Workflow rule not found' });
    res.json(rule);
  } catch (err) {
    console.error('Workflow rule get error:', err);
    res.status(500).json({ error: 'Failed to get workflow rule' });
  }
}

async function create(req, res) {
  try {
    const body = req.body || {};
    const result = await workflowRuleService.createRule({
      name: body.name,
      description: body.description,
      applies_to_template_id: body.applies_to_template_id,
      applies_to_department_id: body.applies_to_department_id,
      condition_json: body.condition_json,
      action_json: body.action_json,
      is_active: body.is_active,
    });
    res.status(201).json(result);
  } catch (err) {
    console.error('Workflow rule create error:', err);
    res.status(500).json({ error: 'Failed to create workflow rule' });
  }
}

async function update(req, res) {
  try {
    const result = await workflowRuleService.updateRule(req.params.id, req.body || {});
    if (!result) return res.status(400).json({ error: 'No fields to update' });
    res.json(result);
  } catch (err) {
    console.error('Workflow rule update error:', err);
    res.status(500).json({ error: 'Failed to update workflow rule' });
  }
}

module.exports = { list, getById, create, update };
