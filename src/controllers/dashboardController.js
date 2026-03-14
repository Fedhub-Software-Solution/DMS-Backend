const dashboardService = require('../services/dashboardService');

async function summary(req, res) {
  try {
    const { limit, days, department_id, assigned_to } = req.query;
    const role = (req.user && req.user.role ? req.user.role : '').toLowerCase();
    const userId = req.user && req.user.id;
    const filters = {
      limit: limit || 10,
      days: days != null ? parseInt(days, 10) : undefined,
      department_id: department_id || undefined,
      assigned_to: assigned_to || undefined,
      created_by: undefined,
    };
    if (userId && !department_id && !assigned_to) {
      if (role === 'admin') {
        // Admin: see all, unless explicit filters are provided.
      } else if (role.includes('preparator')) {
        // Preparators: counts and lists for requests they created.
        filters.created_by = userId;
      } else if (role.includes('reviewer') || role.includes('approver')) {
        // Reviewers/Approvers: counts and lists for requests assigned to them.
        filters.assigned_to = userId;
      }
    }
    const data = await dashboardService.getSummary(filters);
    res.json(data);
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: 'Failed to load dashboard summary' });
  }
}

module.exports = { summary };
