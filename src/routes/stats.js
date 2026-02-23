const express     = require('express');
const { getDB }   = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const db          = getDB();
    const today       = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // ── Existing metrics ────────────────────────────────────────────────────
    const statusCounts = db.prepare('SELECT status, COUNT(*) as count FROM tasks GROUP BY status').all();
    const byStatus     = { TODO: 0, DOING: 0, DONE: 0 };
    for (const row of statusCounts) byStatus[row.status] = row.count;
    const total = byStatus.TODO + byStatus.DOING + byStatus.DONE;

    const overdueCount = db.prepare(
      "SELECT COUNT(*) as count FROM tasks WHERE due_date IS NOT NULL AND due_date < ? AND status != 'DONE'"
    ).get(today)?.count || 0;

    const byArea = db.prepare(
      'SELECT area, COUNT(*) as count FROM tasks GROUP BY area ORDER BY count DESC'
    ).all();

    const byAreaAndStatus = db.prepare(
      'SELECT area, status, COUNT(*) as count FROM tasks GROUP BY area, status'
    ).all();

    const topPriorityTasks = db.prepare(
      "SELECT id, title, area, status, due_date FROM tasks WHERE status IN ('TODO','DOING') ORDER BY priority ASC LIMIT 8"
    ).all();
    // Attach participants to each task
    const getParticipants = db.prepare('SELECT name FROM task_participants WHERE task_id = ? ORDER BY name');
    for (const t of topPriorityTasks) {
      t.participants = getParticipants.all(t.id).map(r => r.name);
    }

    // Top assignees — now based on task_participants table
    const topAssignees = db.prepare(`
      SELECT tp.name AS assigned_to, COUNT(*) as count
      FROM   task_participants tp
      JOIN   tasks t ON t.id = tp.task_id
      WHERE  t.status IN ('TODO','DOING')
      GROUP BY tp.name
      ORDER BY count DESC
      LIMIT 8
    `).all();

    const recentTasks = db.prepare(
      "SELECT id, title, area, status, created_at FROM tasks WHERE date(created_at) >= ? ORDER BY created_at DESC LIMIT 10"
    ).all(sevenDaysAgo);
    for (const t of recentTasks) {
      t.participants = getParticipants.all(t.id).map(r => r.name);
    }

    const completedThisWeek = db.prepare(
      "SELECT COUNT(*) as count FROM tasks WHERE status = 'DONE' AND date(updated_at) >= ?"
    ).get(sevenDaysAgo)?.count || 0;

    // ── Completion-time metrics ─────────────────────────────────────────────
    const completedTasks = db.prepare(`
      SELECT id, title, area, created_at, completed_at
      FROM   tasks
      WHERE  status       = 'DONE'
        AND  completed_at IS NOT NULL
        AND  created_at   IS NOT NULL
    `).all();
    for (const t of completedTasks) {
      t.participants = getParticipants.all(t.id).map(r => r.name);
    }

    const withDuration = completedTasks
      .map(t => {
        const ms = new Date(t.completed_at) - new Date(t.created_at);
        return ms >= 0 ? { ...t, durationMs: ms } : null;
      })
      .filter(Boolean);

    const avgCompletionTimeMs = withDuration.length
      ? Math.round(withDuration.reduce((s, t) => s + t.durationMs, 0) / withDuration.length)
      : null;

    const medianCompletionTimeMs = calcMedian(withDuration.map(t => t.durationMs));

    // By participant (was: by assignee)
    const byAssigneeMap = {};
    for (const t of withDuration) {
      const names = t.participants.length ? t.participants : ['(sin asignar)'];
      for (const name of names) {
        if (!byAssigneeMap[name]) byAssigneeMap[name] = [];
        byAssigneeMap[name].push(t.durationMs);
      }
    }
    const avgCompletionTimeByAssignee = Object.entries(byAssigneeMap).map(([name, durations]) => ({
      name,
      avgMs: Math.round(durations.reduce((s, d) => s + d, 0) / durations.length),
      count: durations.length,
    })).sort((a, b) => a.avgMs - b.avgMs);

    // By area
    const byAreaMap = {};
    for (const t of withDuration) {
      if (!byAreaMap[t.area]) byAreaMap[t.area] = [];
      byAreaMap[t.area].push(t.durationMs);
    }
    const avgCompletionTimeByArea = Object.entries(byAreaMap).map(([area, durations]) => ({
      area,
      avgMs: Math.round(durations.reduce((s, d) => s + d, 0) / durations.length),
      count: durations.length,
    })).sort((a, b) => a.avgMs - b.avgMs);

    const sorted               = [...withDuration].sort((a, b) => b.durationMs - a.durationMs);
    const slowestCompletedTasks = sorted.slice(0, 10);
    const fastestCompletedTasks = sorted.slice(-10).reverse();

    res.json({
      ok: true,
      summary: {
        total, todo: byStatus.TODO, doing: byStatus.DOING, done: byStatus.DONE,
        overdue: overdueCount, completedThisWeek,
      },
      charts: {
        byStatus: [
          { label: 'TODO',  value: byStatus.TODO  },
          { label: 'DOING', value: byStatus.DOING },
          { label: 'DONE',  value: byStatus.DONE  },
        ],
        byArea,
        byAreaAndStatus,
      },
      lists: { topPriorityTasks, topAssignees, recentTasks },
      completionTime: {
        avgCompletionTimeMs,
        medianCompletionTimeMs,
        avgCompletionTimeByAssignee,
        avgCompletionTimeByArea,
        slowestCompletedTasks,
        fastestCompletedTasks,
        totalWithData: withDuration.length,
      },
    });
  } catch (err) {
    console.error('[GET /stats]', err);
    res.status(500).json({ error: 'Could not fetch stats.' });
  }
});

function calcMedian(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid    = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

module.exports = router;
