const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const password = (req.body.password || '').trim();
    const userName = (req.body.userName || '').trim().slice(0, 80);

    if (!password) return res.status(400).json({ error: 'Password is required.' });
    if (!userName) return res.status(400).json({ error: 'Name is required.' });

    const db = getDB();
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get('password_hash');
    if (!row) return res.status(500).json({ error: 'Server configuration error.' });

    const valid = await bcrypt.compare(password, row.value);
    if (!valid) {
      await new Promise(r => setTimeout(r, 400));
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Session error.' });
      req.session.authenticated = true;
      req.session.userName = userName;
      req.session.loginAt = new Date().toISOString();
      res.json({ ok: true, userName, teamName: process.env.TEAM_NAME || 'Team' });
    });
  } catch (err) {
    console.error('[LOGIN]', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('taskmanager.sid');
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    ok: true,
    userName: req.session.userName,
    teamName: process.env.TEAM_NAME || 'Team',
  });
});

module.exports = router;
