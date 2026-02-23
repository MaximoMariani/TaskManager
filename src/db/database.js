const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const path     = require('path');
const fs       = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/tasks.db');

let db;

function getDB() {
  if (!db) throw new Error('Database not initialized. Call initDB() first.');
  return db;
}

async function initDB() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ── Base schema ────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id           TEXT PRIMARY KEY,
      title        TEXT NOT NULL,
      description  TEXT,
      area         TEXT NOT NULL DEFAULT 'ADMIN'
                   CHECK(area IN ('PRODUCCION','CONTENIDO','DISENO','ADMIN')),
      status       TEXT NOT NULL DEFAULT 'TODO'
                   CHECK(status IN ('TODO','DOING','DONE')),
      priority     INTEGER NOT NULL DEFAULT 0,
      assigned_to  TEXT,
      created_by   TEXT,
      due_date     TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_area     ON tasks(area);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(status, priority);
  `);

  // ── Soft migration: add completed_at if missing ────────────────────────────
  const cols = db.pragma('table_info(tasks)').map(c => c.name);

  if (!cols.includes('completed_at')) {
    db.exec('ALTER TABLE tasks ADD COLUMN completed_at TEXT NULL');
    console.log('✅ Migration: added completed_at column to tasks');
  }

  // ── Backfill: mark existing DONE tasks with a best-guess completed_at ──────
  const backfillCount = db.prepare(`
    UPDATE tasks
    SET    completed_at = updated_at
    WHERE  status = 'DONE'
    AND    completed_at IS NULL
  `).run().changes;

  if (backfillCount > 0) {
    console.log(`✅ Migration: backfilled completed_at for ${backfillCount} existing DONE tasks`);
  }

  // ── Multi-assignee: task_participants pivot table ──────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_participants (
      task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      name     TEXT NOT NULL,
      PRIMARY KEY (task_id, name)
    );

    CREATE INDEX IF NOT EXISTS idx_tp_task_id ON task_participants(task_id);
  `);

  // ── Migration: copy existing assigned_to → task_participants ───────────────
  const migratedCount = db.prepare(`
    INSERT OR IGNORE INTO task_participants (task_id, name)
    SELECT id, assigned_to
    FROM   tasks
    WHERE  assigned_to IS NOT NULL
    AND    assigned_to != ''
    AND    id NOT IN (SELECT task_id FROM task_participants)
  `).run().changes;

  if (migratedCount > 0) {
    console.log(`✅ Migration: moved ${migratedCount} existing assignees into task_participants`);
  }

  // ── Password setup ─────────────────────────────────────────────────────────
  const passwordToHash = process.env.TEAM_PASSWORD || 'changeme';
  if (!process.env.TEAM_PASSWORD) {
    console.warn('⚠️  TEAM_PASSWORD not set — using default: "changeme"');
  }

  const existingHash = db.prepare('SELECT value FROM config WHERE key = ?').get('password_hash');

  if (!existingHash) {
    const hash = await bcrypt.hash(passwordToHash, 12);
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('password_hash', hash);
    console.log('🔐 Team password hashed and stored.');
  } else {
    const matches = await bcrypt.compare(passwordToHash, existingHash.value);
    if (!matches) {
      const newHash = await bcrypt.hash(passwordToHash, 12);
      db.prepare('UPDATE config SET value = ? WHERE key = ?').run(newHash, 'password_hash');
      console.log('🔐 Team password updated.');
    }
  }

  console.log(`\`💾 Database ready: ${DB_PATH}`);
  return db;
}

module.exports = { getDB, initDB };
