// server.js

// ---------------------------------------------------------------------------
// Load .env ONLY in local development.
// On Railway/Render/Fly.io, NODE_ENV=production and env vars are injected by
// the platform — dotenv is not needed there. The try/catch prevents a crash
// if dotenv is somehow absent or .env doesn't exist.
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config();
  } catch (e) {
    console.warn('⚠️  dotenv not available — skipping .env load. Set env vars manually.');
  }
}

const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const statsRoutes = require('./routes/stats');
const { getDb } = require('./db/database');

const app = express();

// Railway injects PORT automatically — always respect it.
const PORT = process.env.PORT || 3000;

// Init DB on startup
getDb();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 * 7 // 7 days
  }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Auth routes (public)
app.use('/api/auth', authRoutes);

// Auth middleware for protected routes
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Protected routes
app.use('/api/tasks', requireAuth, taskRoutes);
app.use('/api/stats', requireAuth, statsRoutes);

// Serve frontend for all non-API routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Listen on 0.0.0.0 so Railway can reach the process inside the container
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Task Manager running on port ${PORT}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
});
