const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB }      = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const VALID_AREAS    = ['PRODUCCION', 'CONTENIDO', 'DISENO', 'ADMIN'];
const VALID_STATUSES = ['TODO', 'DOING', 'DONE'];

// ── Participant helpers ────────────────────────────────────────────────────────

/**
 * Parse participantIds from request body.
 * Accepts: string (comma-sep names), array of strings, or undefined.
 * Returns a deduplicated array of trimmed non-empty name strings.
 */
function parseParticipants(raw) {
  if (raw === undefined || raw === null) return null; // null = "don't change"
  if (Array.isArray(raw)) {
    return [...new Set(raw.map(s => String(s).trim()).filter(Boolean))];
  }
  if (typeof raw === 'string' && raw.trim()) {
    return [...new Set(raw.split(',').map(s => s.trim()).filter(Boolean))];
  }
  return []; // empty array = clear all participants
}

/** Replace the full participant list for a task (inside a transaction). */
function setParticipants(db, taskId, names) {
  db.prepare('DELETE FROM task_participants WHERE task_id = ?').run(taskId);
  const insert = db.prepare('INSERT INTO task_participants (task_id, name) VALUES (?, ?)');
  for (const name of names) insert.run(taskId, name);
}

/** Fetch participants for one task as an array of name strings. */
function getParticipants(db, taskId) {
  return db.prepare('SELECT name FROM task_participants WHERE task_id = ? ORDER BY name')
           .all(taskId)
           .map(r => r.name);
}

/** Attach participants array to a task object (mutates + returns it). */
function attachParticipants(db, task) {
  task.participants = getParticipants(db, task.id);
  return task;
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateTask(body, isUpdate = false) {
  const errors = [];
  const title       = typeof body.title       === 'string' ? body.title.trim()                       : null;
  const description = typeof body.description === 'string' ? body.description.trim()                 : null;
  const area        = typeof body.area        === 'string' ? body.area.trim().toUpperCase()           : null;
  const status      = typeof body.status      === 'string' ? body.status.trim().toUpperCase()         : null;
  const createdBy   = typeof body.created_by  === 'string' ? body.created_by.trim().slice(0, 100)    : null;
  const dueDate     = typeof body.due_date    === 'string' && body.due_date ? body.due_date.trim()    : null;

  if (!isUpdate && (!title || title.length === 0)) errors.push('Title is required.');
  if (title && title.length > 255)                 errors.push('Title too long (max 255).');
  if (description && description.length > 2000)    errors.push('Description too long (max 2000).');
  if (area   && !VALID_AREAS.includes(area))        errors.push(`Invalid area. Use: ${VALID_AREAS.join(', ')}.`);
  if (status && !VALID_STATUSES.includes(status))   errors.push(`Invalid status. Use: ${VALID_STATUSES.join(', ')}.`);
  if (dueDate && isNaN(Date.parse(dueDate)))        errors.push('Invalid due_date. Use YYYY-MM-DD.');

  return {
    errors,
    data: { title, description, area, status, created_by: createdBy, due_date: dueDate },
  };
}

// ── GET /api/tasks ─────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const db = getDB();
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];

    if (req.query.status) {
      const s = req.query.status.toUpperCase();
      if (VALID_STATUSES.includes(s)) { query += ' AND status = ?'; params.push(s); }
    }
    if (req.query.area) {
      const a = req.query.area.toUpperCase();
      if (VALID_AREAS.includes(a)) { query += ' AND area = ?'; params.push(a); }
    }
    if (req.query.participant) {
      // Filter by participant name (checks task_participants table)
      query += ' AND id IN (SELECT task_id FROM task_participants WHERE name LIKE ?)';
      params.push(`%${req.query.participant.trim()}%`);
    }
    if (req.query.search) {
      const term = `%${req.query.search.trim()}%`;
      query += ' AND (title LIKE ? OR description LIKE ?)';
      params.push(term, term);
    }

    query += ' ORDER BY priority ASC, created_at ASC';
    const tasks = db.prepare(query).all(...params);

    // Attach participants to every task
    for (const t of tasks) attachParticipants(db, t);

    res.json({ ok: true, tasks });
  } catch (err) {
    console.error('[GET /tasks]', err);
    res.status(500).json({ error: 'Could not fetch tasks.' });
  }
});

// ── POST /api/tasks ────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { errors, data } = validateTask(req.body, false);
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    const participants = parseParticipants(req.body.participantIds) ?? [];

    const db           = getDB();
    const targetStatus = data.status || 'TODO';
    const maxRow       = db.prepare('SELECT MAX(priority) as mp FROM tasks WHERE status = ?').get(targetStatus);
    const priority     = (maxRow?.mp ?? -1) + 1;
    const id           = uuidv4();
    const now          = new Date().toISOString();
    const completedAt  = targetStatus === 'DONE' ? now : null;

    db.transaction(() => {
      db.prepare(`
        INSERT INTO tasks
          (id, title, description, area, status, priority, created_by, due_date, created_at, updated_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, data.title, data.description,
        data.area || 'ADMIN', targetStatus, priority,
        data.created_by || req.session.userName,
        data.due_date, now, now, completedAt
      );
      setParticipants(db, id, participants);
    })();

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    attachParticipants(db, task);
    res.status(201).json({ ok: true, task });
  } catch (err) {
    console.error('[POST /tasks]', err);
    res.status(500).json({ error: 'Could not create task.' });
  }
});

// ── PATCH /api/tasks/reorder ─────────────────────────────────────────────────
// Must be before /:id route
router.patch('/reorder', (req, res) => {
  try {
    const { tasks } = req.body;
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: 'tasks array is required.' });
    }

    const db     = getDB();
    const now    = new Date().toISOString();

    const fetchStmt  = db.prepare('SELECT status, completed_at FROM tasks WHERE id = ?');
    const updateStmt = db.prepare(
      'UPDATE tasks SET status = ?, priority = ?, updated_at = ?, completed_at = ? WHERE id = ?'
    );

    db.transaction((items) => {
      for (const item of items) {
        if (!item.id || typeof item.priority !== 'number') continue;
        if (!VALID_STATUSES.includes(item.status)) continue;
        const existing    = fetchStmt.get(item.id);
        const completedAt = resolveCompletedAt(existing, item.status, now);
        updateStmt.run(item.status, item.priority, now, completedAt, item.id);
      }
    })(tasks);

    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /tasks/reorder]', err);
    res.status(500).json({ error: 'Could not reorder tasks.' });
  }
});

// ── PATCH /api/tasks/:id ──────────────────────────────────────────────────────
router.patch('/:id', (req, res) => {
  try {
    const db       = getDB();
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found.' });

    const { errors, data } = validateTask(req.body, true);
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    const participants = parseParticipants(req.body.participantIds); // null = don't touch

    const now         = new Date().toISOString();
    const newStatus   = data.status || existing.status;
    const completedAt = resolveCompletedAt(existing, newStatus, now);

    const fields = [], values = [];
    if (data.title !== null)       { fields.push('title = ?');       values.push(data.title); }
    if (data.description !== null) { fields.push('description = ?'); values.push(data.description); }
    if (data.area !== null)        { fields.push('area = ?');        values.push(data.area); }
    if (data.status !== null)      { fields.push('status = ?');      values.push(data.status); }
    if (data.created_by !== null)  { fields.push('created_by = ?');  values.push(data.created_by); }
    if (req.body.hasOwnProperty('due_date')) {
      fields.push('due_date = ?');
      values.push(data.due_date);
    }

    if (fields.length === 0 && participants === null) {
      return res.status(400).json({ error: 'No valid fields to update.' });
    }

    // Always update completed_at based on status transition logic
    fields.push('completed_at = ?');
    values.push(completedAt);

    fields.push('updated_at = ?');
    values.push(now, req.params.id);

    db.transaction(() => {
      if (fields.length > 2) { // more than just completed_at + updated_at sentinel
        db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      }
      if (participants !== null) {
        setParticipants(db, req.params.id, participants);
      }
    })();

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    attachParticipants(db, updated);
    res.json({ ok: true, task: updated });
  } catch (err) {
    console.error('[PATCH /tasks/:id]', err);
    res.status(500).json({ error: 'Could not update task.' });
  }
});

// ── DELETE /api/tasks/:id ─────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const db       = getDB();
    const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found.' });
    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /tasks/:id]', err);
    res.status(500).json({ error: 'Could not delete task.' });
  }
});

// ── HELPERS ───────────────────────────────────────────────────────────────────

function resolveCompletedAt(existing, newStatus, now) {
  const wasAlreadyDone = existing.status === 'DONE';
  const isNowDone      = newStatus === 'DONE';
  if (isNowDone && wasAlreadyDone) return existing.completed_at;
  if (isNowDone && !wasAlreadyDone) return now;
  return null;
}

module.exports = router;
