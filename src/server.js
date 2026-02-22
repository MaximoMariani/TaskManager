require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');

const { initDB } = require('./db/database');
const authRoutes  = require('./routes/auth');
const taskRoutes  = require('./routes/tasks');
const statsRoutes = require('./routes/stats');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
  name: 'taskmanager.sid',
}));

// Serve static files from public/
app.use(express.static(path.join(__dirname, '../public')));

// API
app.use('/api/auth',  authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/stats', statsRoutes);

// For non-API routes, serve the SPA shell
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, '../public/pages/board.html'));
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`\n✅ Task Manager → http://localhost:${PORT}`);
      console.log(`   Team: ${process.env.TEAM_NAME || 'Mi Equipo'}`);
      console.log(`   Env:  ${process.env.NODE_ENV || 'development'}\n`);
    });
  } catch (err) {
    console.error('❌ Failed to start:', err);
    process.exit(1);
  }
}

start();
