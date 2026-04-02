import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _db: Database.Database | null = null;

function getDbPath(): string {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  return path.resolve(__dirname, '../../data/timepunch.db');
}

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(getDbPath());
  migrate(_db);
  return _db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      date          TEXT NOT NULL,
      clock_in      TEXT NOT NULL,
      clock_out     TEXT,
      duration_secs INTEGER NOT NULL DEFAULT 0,
      pauses        TEXT NOT NULL DEFAULT '[]',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO settings VALUES ('hourly_rate', '15.00');
  `);
}

export function resetDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
  const db = new Database(getDbPath());
  db.exec(`
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS settings;
  `);
  migrate(db);
  db.close();
  _db = null;
}
