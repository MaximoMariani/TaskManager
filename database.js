// db/database.js
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'tasks.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      area TEXT NOT NULL DEFAULT 'ADMIN',
      status TEXT NOT NULL DEFAULT 'TODO',
      priority INTEGER NOT NULL DEFAULT 0,
      assignedTo TEXT DEFAULT '',
      createdBy TEXT DEFAULT '',
      dueDate TEXT DEFAULT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      completedAt TEXT DEFAULT NULL
    );
  `);

  // Migration: add updatedAt if missing (for existing DBs)
  const cols = db.pragma('table_info(tasks)').map(c => c.name);
  if (!cols.includes('updatedAt')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN updatedAt TEXT NOT NULL DEFAULT (datetime('now'));`);
  }
  if (!cols.includes('completedAt')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN completedAt TEXT DEFAULT NULL;`);
  }
}

module.exports = { getDb };
