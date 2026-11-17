import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DEMO_USERS } from '@app/shared';

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT UNIQUE NOT NULL,
  report_id TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  role TEXT NOT NULL,
  at TEXT NOT NULL,
  note TEXT
);
CREATE INDEX IF NOT EXISTS audit_events_report ON audit_events (report_id, seq);
`;

export function openDb(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  if (file !== ':memory:') db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const seed = db.prepare('INSERT OR IGNORE INTO users (id, name, role, position) VALUES (?, ?, ?, ?)');
  DEMO_USERS.forEach((u, i) => seed.run(u.id, u.name, u.role, i));
  return db;
}
