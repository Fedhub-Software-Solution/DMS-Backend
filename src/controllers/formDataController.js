const formDataService = require('../services/formDataService');
const auditLogService = require('../services/auditLogService');

async function getFormData(req, res) {
  try {
    const result = await formDataService.getByRequestId(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('Form data get error:', err);
    res.status(500).json({ error: 'Failed to get form data' });
  }
}

async function putFormData(req, res) {
  try {
    const { data, formSectionsSnapshot, pageEvents } = req.body || {};
    await formDataService.upsert(req.params.id, { data, formSectionsSnapshot });
    if (Array.isArray(pageEvents)) {
      for (const ev of pageEvents) {
        const page = parseInt(ev.pageNumber, 10);
        if (!Number.isFinite(page) || page <= 0) continue;
        await auditLogService.insert({
          entity_type: 'request',
          entity_id: req.params.id,
          action: 'page_changed',
          user_id: req.user && req.user.id,
          details: {
            pageNumber: page,
            eventType: ev.eventType || 'edit',
            summary: ev.summary || null,
          },
        });
      }
    }
    const result = await formDataService.getByRequestId(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('Form data put error:', err);
    res.status(500).json({ error: 'Failed to save form data' });
  }
}

module.exports = { getFormData, putFormData };
