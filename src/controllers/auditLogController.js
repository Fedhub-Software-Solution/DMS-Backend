const auditLogService = require('../services/auditLogService');

async function list(req, res) {
  try {
    const {
      entity_type,
      entity_id,
      user_id,
      request_id,
      date_range,
      from_date,
      to_date,
      limit,
    } = req.query;
    const rows = await auditLogService.list({
      entity_type,
      entity_id,
      user_id,
      request_id,
      date_range,
      from_date,
      to_date,
      limit,
    });
    res.json(rows);
  } catch (err) {
    console.error('Audit logs error:', err);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
}

module.exports = { list };
