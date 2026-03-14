const departmentService = require('../services/departmentService');

async function list(req, res) {
  try {
    const rows = await departmentService.list();
    res.json(rows);
  } catch (err) {
    console.error('Departments list error:', err);
    res.status(500).json({ error: 'Failed to list departments' });
  }
}

module.exports = { list };
