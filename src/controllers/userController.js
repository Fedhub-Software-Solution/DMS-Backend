const userService = require('../services/userService');
const auditLogService = require('../services/auditLogService');

async function list(req, res) {
  try {
    const rows = await userService.list();
    res.json(rows);
  } catch (err) {
    console.error('Users list error:', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
}

async function getById(req, res) {
  try {
    const user = await userService.getById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('User get error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
}

async function create(req, res) {
  try {
    const { username, password, full_name, email, role, department_id } = req.body || {};
    const user = await userService.create({
      username,
      password,
      full_name,
      email,
      role,
      department_id,
    });
    res.status(201).json(user);
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({ error: err.message });
    }
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    console.error('User create error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
}

/**
 * Secondary verification endpoint used before review/approve actions from Document Library.
 * Body: { identifier, password, documentId }. identifier can be username OR email.
 * When valid, logs to audit_logs and returns { username, email, status }.
 */
async function validateForDocument(req, res) {
  try {
    const { identifier, password, documentId } = req.body || {};
    if (!identifier || !password || !documentId) {
      return res.status(400).json({ error: 'identifier, password, and documentId are required' });
    }

    const user = await userService.validateByIdentifierAndPassword(identifier, password);
    if (!user) {
      // Log failed attempt as request activity so it appears in View Activity
      await auditLogService.insert({
        entity_type: 'request',
        entity_id: String(documentId),
        action: 'user_validation_failed',
        user_id: null,
        details: {
          identifier,
          success: false,
        },
      });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Insert audit log entry for successful validation (as request activity)
    await auditLogService.insert({
      entity_type: 'request',
      entity_id: String(documentId),
      action: 'user_validated_for_review',
      user_id: user.id,
      details: {
        email: user.email,
        username: user.username,
      },
    });

    return res.json({
      username: user.username,
      email: user.email,
      status: 'verified',
    });
  } catch (err) {
    console.error('User validateForDocument error:', err);
    res.status(500).json({ error: 'Failed to validate user for document' });
  }
}

module.exports = { list, create, validateForDocument };
