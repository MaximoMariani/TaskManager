// routes/stats.js
const express = require('express');
const { getDb } = require('../db/database');
const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  const now = new Date();
  const today = now.toISOString();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const total = db.prepare('SELECT COUNT(*) as c FROM tasks').get().c;
  const todo = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='TODO'").get().c;
  const doing = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='DOING'").get().c;
  const done = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='DONE'").get().c;
  const overdue = db.prepare(`
    SELECT COUNT(*) as c FROM tasks 
    WHERE dueDate IS NOT NULL AND dueDate < ? AND status != 'DONE'
  `).get(today).c;

  // By area
  const byArea = db.prepare(`
    SELECT area, COUNT(*) as count FROM tasks GROUP BY area
  `).all();

  // By status (already have above)
  const byStatus = [
    { status: 'TODO', count: todo },
    { status: 'DOING', count: doing },
    { status: 'DONE', count: done }
  ];

  // Top priority active tasks
  const topPriority = db.prepare(`
    SELECT * FROM tasks WHERE status != 'DONE' ORDER BY priority ASC LIMIT 5
  `).all();

  // Top assignees with active tasks
  const topAssignees = db.prepare(`
    SELECT assignedTo, COUNT(*) as count FROM tasks 
    WHERE status != 'DONE' AND assignedTo != ''
    GROUP BY assignedTo ORDER BY count DESC LIMIT 5
  `).all();

  // Recent tasks (last 7 days)
  const recentTasks = db.prepare(`
    SELECT * FROM tasks WHERE createdAt >= ? ORDER BY createdAt DESC LIMIT 10
  `).all(sevenDaysAgo);

  // Availability
  const allAssignees = db.prepare(`
    SELECT DISTINCT assignedTo FROM tasks WHERE assignedTo != ''
  `).all().map(r => r.assignedTo);

  const availability = allAssignees.map(name => {
    const activeTasks = db.prepare(`
      SELECT COUNT(*) as c FROM tasks WHERE assignedTo=? AND status != 'DONE'
    `).get(name).c;

    const completedLast7Days = db.prepare(`
      SELECT COUNT(*) as c FROM tasks WHERE assignedTo=? AND status='DONE' AND completedAt >= ?
    `).get(name, sevenDaysAgo).c;

    const completedLast30Days = db.prepare(`
      SELECT COUNT(*) as c FROM tasks WHERE assignedTo=? AND status='DONE' AND completedAt >= ?
    `).get(name, thirtyDaysAgo).c;

    return {
      name,
      activeTasks,
      completedLast7Days,
      completedLast30Days,
      availabilityScore: activeTasks
    };
  }).sort((a, b) => a.availabilityScore - b.availabilityScore);

  res.json({
    summary: { total, todo, doing, done, overdue },
    byArea,
    byStatus,
    topPriority,
    topAssignees,
    recentTasks,
    availability
  });
});

// Dedicated availability endpoint
router.get('/availability', (req, res) => {
  const db = getDb();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const allAssignees = db.prepare(`
    SELECT DISTINCT assignedTo FROM tasks WHERE assignedTo != ''
  `).all().map(r => r.assignedTo);

  const availability = allAssignees.map(name => {
    const activeTasks = db.prepare(`
      SELECT COUNT(*) as c FROM tasks WHERE assignedTo=? AND status != 'DONE'
    `).get(name).c;

    const completedLast7Days = db.prepare(`
      SELECT COUNT(*) as c FROM tasks WHERE assignedTo=? AND status='DONE' AND completedAt >= ?
    `).get(name, sevenDaysAgo).c;

    const completedLast30Days = db.prepare(`
      SELECT COUNT(*) as c FROM tasks WHERE assignedTo=? AND status='DONE' AND completedAt >= ?
    `).get(name, thirtyDaysAgo).c;

    return {
      name,
      activeTasks,
      completedLast7Days,
      completedLast30Days,
      availabilityScore: activeTasks
    };
  }).sort((a, b) => a.availabilityScore - b.availabilityScore);

  res.json({ availability });
});

module.exports = router;
