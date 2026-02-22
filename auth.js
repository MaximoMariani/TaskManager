// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

// Hash the team password once at startup
let hashedPassword = null;

async function getHashedPassword() {
  if (!hashedPassword) {
    const raw = process.env.TEAM_PASSWORD || 'teampass123';
    hashedPassword = await bcrypt.hash(raw, 10);
  }
  return hashedPassword;
}

// Pre-hash on module load
getHashedPassword();

router.post('/login', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  const raw = process.env.TEAM_PASSWORD || 'teampass123';
  const match = await bcrypt.compare(password, await getHashedPassword()) ||
                 password === raw; // fallback plain compare if hash not set

  // Actually just compare directly with env
  const valid = password === raw;

  if (!valid) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }

  req.session.authenticated = true;
  res.json({ success: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

router.get('/check', (req, res) => {
  res.json({ authenticated: !!req.session.authenticated });
});

module.exports = router;
