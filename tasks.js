// routes/tasks.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const router = express.Router();

const VALID_AREAS = ['PRODUCCION', 'CONTENIDO', 'DISENO', 'ADMIN'];
const VALID_STATUSES = ['TODO', 'DOING', 'DONE'];

function now() {
  return new Date().toISOString();
}

// GET all tasks (with optional filters)
router.get('/', (req, res) => {
  const db = getDb();
  const { area, assignedTo, search } = req.query;

  let query = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];

  if (area && VALID_AREAS.includes(area)) {
    query += ' AND area = ?';
    params.push(area);
  }
  if (assignedTo) {
    query += ' AND assignedTo LIKE ?';
    params.push(`%${assignedTo}%`);
  }
  if (search) {
    query += ' AND (title LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY status, priority ASC';

  const tasks = db.prepare(query).all(...params);
  res.json(tasks);
});

// POST create task
router.post('/', (req, res) => {
  const db = getDb();
  const { title, description, area, status, assignedTo, createdBy, dueDate } = req.body;

  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  if (area && !VALID_AREAS.includes(area)) return res.status(400).json({ error: 'Invalid area' });
  if (status && !VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  // Get max priority for the target status column
  const maxPrio = db.prepare('SELECT MAX(priority) as m FROM tasks WHERE status = ?')
    .get(status || 'TODO');
  const priority = (maxPrio.m ?? -1) + 1;

  const task = {
    id: uuidv4(),
    title: title.trim(),
    description: description || '',
    area: area || 'ADMIN',
    status: status || 'TODO',
    priority,
    assignedTo: assignedTo || '',
    createdBy: createdBy || '',
    dueDate: dueDate || null,
    createdAt: now(),
    updatedAt: now(),
    completedAt: null
  };

  db.prepare(`
    INSERT INTO tasks (id, title, description, area, status, priority, assignedTo, createdBy, dueDate, createdAt, updatedAt, completedAt)
    VALUES (@id, @title, @description, @area, @status, @priority, @assignedTo, @createdBy, @dueDate, @createdAt, @updatedAt, @completedAt)
  `).run(task);

  res.status(201).json(task);
});

// PUT update task
router.put('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  const { title, description, area, status, assignedTo, createdBy, dueDate } = req.body;

  if (area && !VALID_AREAS.includes(area)) return res.status(400).json({ error: 'Invalid area' });
  if (status && !VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const completedAt = (status === 'DONE' && existing.status !== 'DONE')
    ? now()
    : (status !== 'DONE' ? null : existing.completedAt);

  const updated = {
    id,
    title: title !== undefined ? title.trim() : existing.title,
    description: description !== undefined ? description : existing.description,
    area: area || existing.area,
    status: status || existing.status,
    assignedTo: assignedTo !== undefined ? assignedTo : existing.assignedTo,
    createdBy: createdBy !== undefined ? createdBy : existing.createdBy,
    dueDate: dueDate !== undefined ? dueDate : existing.dueDate,
    updatedAt: now(),
    completedAt
  };

  db.prepare(`
    UPDATE tasks SET title=@title, description=@description, area=@area, status=@status,
    assignedTo=@assignedTo, createdBy=@createdBy, dueDate=@dueDate, updatedAt=@updatedAt,
    completedAt=@completedAt WHERE id=@id
  `).run(updated);

  res.json({ ...existing, ...updated });
});

// PATCH update status only (quick done)
router.patch('/:id/status', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { status } = req.body;

  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  const completedAt = status === 'DONE' ? now() : null;
  const updatedAt = now();

  db.prepare('UPDATE tasks SET status=?, completedAt=?, updatedAt=? WHERE id=?')
    .run(status, completedAt, updatedAt, id);

  res.json({ ...existing, status, completedAt, updatedAt });
});

// PATCH reorder tasks (drag & drop)
router.patch('/reorder', (req, res) => {
  const db = getDb();
  const { tasks } = req.body; // [{id, status, priority}]

  if (!Array.isArray(tasks)) return res.status(400).json({ error: 'tasks array required' });

  const updateStmt = db.prepare('UPDATE tasks SET status=?, priority=?, updatedAt=? WHERE id=?');
  const updateMany = db.transaction((items) => {
    for (const item of items) {
      updateStmt.run(item.status, item.priority, now(), item.id);
    }
  });

  updateMany(tasks);
  res.json({ success: true });
});

// DELETE task
router.delete('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
