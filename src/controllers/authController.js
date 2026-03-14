const authService = require('../services/authService');

async function login(req, res) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const result = await authService.login(username, password);
    res.json(result);
  } catch (err) {
    if (err.statusCode === 401) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
}

async function getMe(req, res) {
  try {
    const user = await authService.getMe(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
}

async function refresh(req, res) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    const result = await authService.refresh(req.user.id);
    res.json(result);
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ error: 'User not found' });
    }
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
}

async function forgotPassword(req, res) {
  try {
    const { username } = req.body || {};
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }
    const result = await authService.forgotPassword(username);
    // Always return same message to avoid leaking whether username exists
    if (result && process.env.NODE_ENV !== 'production') {
      console.log('[Auth] Password reset token (dev only):', result.token);
    }
    res.json({
      message: 'If an account exists with this username, a password reset link has been sent.',
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Request failed' });
  }
}

async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and newPassword required' });
    }
    await authService.resetPassword(token, newPassword);
    res.json({ message: 'Password has been reset. You can now sign in.' });
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({ error: err.message || 'Invalid or expired reset token' });
    }
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
}

module.exports = { login, getMe, refresh, forgotPassword, resetPassword };
